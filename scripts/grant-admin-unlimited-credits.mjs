import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

function loadEnvLocal() {
  const p = resolve(process.cwd(), '.env.local');
  if (!existsSync(p)) throw new Error('Missing .env.local');
  for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i < 0) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (process.env[k] == null || process.env[k] === '') process.env[k] = v;
  }
}

loadEnvLocal();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
let adminEmail = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();

if (!url || !key) {
  console.error('missing supabase env');
  process.exit(1);
}

const sb = createClient(url, key, { auth: { persistSession: false } });

if (!adminEmail) {
  const { data: admins } = await sb
    .from('profiles')
    .select('id, email, is_admin')
    .eq('is_admin', true)
    .limit(3);
  if (admins?.length) {
    adminEmail = String(admins[0].email || '').toLowerCase();
    console.log('ADMIN_EMAIL empty — using is_admin profile');
  } else {
    adminEmail = 'shashank80771@gmail.com';
    console.log('ADMIN_EMAIL empty — using owner email fallback');
  }
}

const { data: profile, error } = await sb
  .from('profiles')
  .select('id, email, is_admin')
  .ilike('email', adminEmail)
  .maybeSingle();

if (error) throw error;
if (!profile) {
  console.error('no profile for', adminEmail);
  process.exit(1);
}

console.log('profile', profile.id, profile.email, 'is_admin=', profile.is_admin);

const { error: adminErr } = await sb.from('profiles').update({ is_admin: true }).eq('id', profile.id);
if (adminErr) throw adminErr;

const now = new Date();
const end = new Date(now);
end.setFullYear(end.getFullYear() + 10);

await sb
  .from('premium_subscriptions')
  .update({ status: 'cancelled' })
  .eq('profile_id', profile.id)
  .eq('status', 'active');

const { error: subErr } = await sb.from('premium_subscriptions').insert({
  profile_id: profile.id,
  plan: 'premium_monthly',
  status: 'active',
  cycle_start: now.toISOString(),
  cycle_end: end.toISOString(),
});
if (subErr) throw subErr;

const { count, error: delErr } = await sb
  .from('premium_usage_events')
  .delete({ count: 'exact' })
  .eq('profile_id', profile.id)
  .eq('feature_key', 'resume_studio');
if (delErr) throw delErr;

console.log('cleared resume_studio events:', count ?? 0);
console.log('OK: admin unlimited + premium_monthly granted');
