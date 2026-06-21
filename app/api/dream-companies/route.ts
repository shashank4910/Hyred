import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { getCurrentProfile } from '@/lib/current-user';
import {
  companyCatalogKey,
  dreamCompanyLimitForProfile,
  findCatalogCompanyByKey,
  getCompanyCatalog,
  type DreamCompanyRow,
} from '@/lib/dream-companies';
import { countUnreadDreamAlerts } from '@/lib/dream-company-alerts';
import { CATEGORY_LABELS } from '@/lib/top-companies';

export const runtime = 'nodejs';

/** GET — dream picks, catalog, limits, unread count */
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

  const catalog = getCompanyCatalog().map((c) => ({
    key: companyCatalogKey(c.name),
    name: c.name,
    category: c.category,
    category_label: CATEGORY_LABELS[c.category],
  }));

  return NextResponse.json({
    picks: (picks ?? []) as DreamCompanyRow[],
    catalog,
    limit,
    used: picks?.length ?? 0,
    unread_alerts: unread,
  });
}

/** POST — add a dream company `{ company_key: string }` */
export async function POST(req: NextRequest) {
  const profile = await getCurrentProfile();
  if (!profile) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const companyKey = typeof body.company_key === 'string' ? body.company_key.trim().toLowerCase() : '';
  if (!companyKey) {
    return NextResponse.json({ error: 'company_key required' }, { status: 400 });
  }

  const entry = findCatalogCompanyByKey(companyKey);
  if (!entry) {
    return NextResponse.json({ error: 'Company not in catalog' }, { status: 400 });
  }

  const sb = supabaseAdmin();
  const { count } = await sb
    .from('dream_companies')
    .select('id', { count: 'exact', head: true })
    .eq('profile_id', profile.id);

  const limit = await dreamCompanyLimitForProfile(profile.id);
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

  const notifyEmail = body.notify_email !== false;
  const notifySms = body.notify_sms === true;

  const { data, error } = await sb
    .from('dream_companies')
    .insert({
      profile_id: profile.id,
      company_key: companyCatalogKey(entry.name),
      company_display_name: entry.name,
      notify_email: notifyEmail,
      notify_sms: notifySms,
    })
    .select('*')
    .single();

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'Already tracking this company' }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ pick: data as DreamCompanyRow });
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
