import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { getCurrentProfile } from '@/lib/current-user';
import {
  companyCatalogKey,
  dreamCompanyLimitForProfile,
  patternsFromDisplayName,
  type DreamCompanyRow,
} from '@/lib/dream-companies';
import { countUnreadDreamAlerts } from '@/lib/dream-company-alerts';
import { insertDreamCompanyPick } from '@/lib/dream-companies-db';
import { findCatalogBySlug } from '@/lib/company-catalog/db';
import { getCatalogSnapshot } from '@/lib/company-catalog/catalog-snapshot';

export const runtime = 'nodejs';

async function assertUnderLimit(profileId: string) {
  const sb = supabaseAdmin();
  const { count } = await sb
    .from('dream_companies')
    .select('id', { count: 'exact', head: true })
    .eq('profile_id', profileId);
  const limit = await dreamCompanyLimitForProfile(profileId);
  if ((count ?? 0) >= limit) {
    return NextResponse.json(
      {
        error:
          limit === 1
            ? 'Free plan allows 1 dream company. Upgrade for up to 10.'
            : `You can track up to ${limit} dream companies.`,
        code: 'limit_reached',
      },
      { status: 402 },
    );
  }
  return null;
}

/** GET — dream picks, limits, unread count (catalog search → /catalog) */
export async function GET() {
  const profile = await getCurrentProfile();
  if (!profile) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const sb = supabaseAdmin();
  const [{ data: picks, error }, limit, unread] = await Promise.all([
    sb
      .from('dream_companies')
      .select('*')
      .eq('profile_id', profile.id)
      .order('created_at', { ascending: true }),
    dreamCompanyLimitForProfile(profile.id),
    countUnreadDreamAlerts(profile.id),
  ]);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    picks: (picks ?? []) as DreamCompanyRow[],
    catalog_total: getCatalogSnapshot().length,
    limit,
    used: picks?.length ?? 0,
    unread_alerts: unread,
  });
}

/**
 * POST — add dream company
 * - `{ company_key }` — from DB catalog
 * - `{ custom_name }` — manual add (immediate, user-specific patterns)
 */
export async function POST(req: NextRequest) {
  const profile = await getCurrentProfile();
  if (!profile) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const limitErr = await assertUnderLimit(profile.id);
  if (limitErr) return limitErr;

  const body = await req.json().catch(() => ({}));
  const customName = typeof body.custom_name === 'string' ? body.custom_name.trim() : '';
  const companyKey = typeof body.company_key === 'string' ? body.company_key.trim().toLowerCase() : '';

  const notifyEmail = body.notify_email !== false;
  const notifySms = body.notify_sms === true;

  if (customName) {
    if (customName.length < 2 || customName.length > 120) {
      return NextResponse.json({ error: 'Company name must be 2–120 characters' }, { status: 400 });
    }
    const patterns = patternsFromDisplayName(customName);
    const slug = companyCatalogKey(customName);

    const { data, error: insertErr } = await insertDreamCompanyPick({
      profile_id: profile.id,
      company_key: slug,
      company_display_name: customName,
      notify_email: notifyEmail,
      notify_sms: notifySms,
      source: 'manual',
      custom_patterns: patterns,
      catalog_id: null,
    });

    if (insertErr) {
      if (insertErr.includes('duplicate') || insertErr.includes('23505')) {
        return NextResponse.json({ error: 'Already tracking this company' }, { status: 409 });
      }
      return NextResponse.json({ error: insertErr }, { status: 500 });
    }
    return NextResponse.json({ pick: data as DreamCompanyRow, mode: 'manual' });
  }

  if (!companyKey) {
    return NextResponse.json({ error: 'company_key or custom_name required' }, { status: 400 });
  }

  const catalogRow = await findCatalogBySlug(companyKey);
  if (!catalogRow) {
    return NextResponse.json(
      { error: 'Company not in catalog. Use custom_name to add manually, or submit a request.' },
      { status: 400 },
    );
  }

  const catalogId =
    catalogRow.id && catalogRow.id !== catalogRow.slug ? catalogRow.id : null;

  const { data, error: insertErr } = await insertDreamCompanyPick({
    profile_id: profile.id,
    company_key: catalogRow.slug,
    company_display_name: catalogRow.display_name,
    notify_email: notifyEmail,
    notify_sms: notifySms,
    source: 'catalog',
    catalog_id: catalogId,
    custom_patterns: null,
  });

  if (insertErr) {
    if (insertErr.includes('duplicate') || insertErr.includes('23505')) {
      return NextResponse.json({ error: 'Already tracking this company' }, { status: 409 });
    }
    return NextResponse.json({ error: insertErr }, { status: 500 });
  }

  return NextResponse.json({ pick: data as DreamCompanyRow, mode: 'catalog' });
}

/** PATCH — update notification prefs on a pick `{ id, notify_email?, notify_sms? }` */
export async function PATCH(req: NextRequest) {
  const profile = await getCurrentProfile();
  if (!profile) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const id = typeof body.id === 'string' ? body.id : '';
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const patch: Record<string, boolean> = {};
  if (typeof body.notify_email === 'boolean') patch.notify_email = body.notify_email;
  if (typeof body.notify_sms === 'boolean') patch.notify_sms = body.notify_sms;
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  }

  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('dream_companies')
    .update(patch)
    .eq('id', id)
    .eq('profile_id', profile.id)
    .select('*')
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json({ pick: data as DreamCompanyRow });
}
