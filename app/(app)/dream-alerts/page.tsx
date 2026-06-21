import Link from 'next/link';
import { supabaseAdmin } from '@/lib/supabase/server';
import { getCurrentProfile } from '@/lib/current-user';
import {
  companyCatalogKey,
  dreamCompanyLimitForProfile,
  getCompanyCatalog,
  type DreamCompanyRow,
} from '@/lib/dream-companies';
import { countUnreadDreamAlerts } from '@/lib/dream-company-alerts';
import { CATEGORY_LABELS } from '@/lib/top-companies';
import { DreamAlertsClient } from './DreamAlertsClient';
import { BellRing } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function DreamAlertsPage() {
  const profile = await getCurrentProfile();

  if (!profile) {
    return (
      <div className="glass-card max-w-xl mx-auto text-center mt-12 space-y-4 py-12 px-8">
        <BellRing className="h-12 w-12 text-primary mx-auto" />
        <h1 className="font-headline text-headline-md font-bold">Dream company alerts</h1>
        <p className="text-on-surface-variant">Sign in to track companies and get alerts.</p>
        <Link href="/login" className="btn-primary inline-flex">
          Sign in
        </Link>
      </div>
    );
  }

  const sb = supabaseAdmin();
  const [picksRes, alertsRes, limit, unread] = await Promise.all([
    sb
      .from('dream_companies')
      .select('*')
      .eq('profile_id', profile.id)
      .order('created_at', { ascending: true }),
    sb
      .from('dream_company_alerts')
      .select(
        `id, job_id, match_id, job_title, company_name, read_at, created_at,
         dream_company:dream_companies!inner(company_display_name, company_key)`,
      )
      .eq('profile_id', profile.id)
      .order('created_at', { ascending: false })
      .limit(30),
    dreamCompanyLimitForProfile(profile.id),
    countUnreadDreamAlerts(profile.id),
  ]);

  const catalog = getCompanyCatalog().map((c) => ({
    key: companyCatalogKey(c.name),
    name: c.name,
    category: c.category,
    category_label: CATEGORY_LABELS[c.category],
  }));

  const rawAlerts = alertsRes.data ?? [];
  const alerts = rawAlerts.map((a) => {
    const dc = Array.isArray(a.dream_company) ? a.dream_company[0] : a.dream_company;
    return {
      id: a.id as string,
      job_id: a.job_id as string,
      match_id: (a.match_id as string | null) ?? null,
      job_title: (a.job_title as string | null) ?? null,
      company_name: (a.company_name as string | null) ?? null,
      read_at: (a.read_at as string | null) ?? null,
      created_at: a.created_at as string,
      dream_company: {
        company_display_name: dc?.company_display_name ?? 'Company',
        company_key: dc?.company_key ?? '',
      },
    };
  });

  return (
    <DreamAlertsClient
      initialPicks={(picksRes.data ?? []) as DreamCompanyRow[]}
      initialAlerts={alerts}
      catalog={catalog}
      limit={limit}
      used={picksRes.data?.length ?? 0}
      unread={unread}
    />
  );
}
