/**
 * One-time: reset Cerebras (or all) LLM key daily counters in Supabase.
 *
 * Usage (from repo root, with .env.local or env vars set):
 *   npx tsx scripts/reset-cerebras-keys.ts
 *   npx tsx scripts/reset-cerebras-keys.ts --all
 *   npx tsx scripts/reset-cerebras-keys.ts --fix-model
 */
import { forceResetProviderCounters } from '../lib/llm-keys';
import { supabaseAdmin } from '../lib/supabase/server';

async function main() {
  const all = process.argv.includes('--all');
  const fixModel = process.argv.includes('--fix-model');
  const provider = all ? undefined : 'cerebras';

  if (fixModel) {
    const sb = supabaseAdmin();
    const { data, error } = await sb
      .from('llm_keys')
      .update({ model: 'gpt-oss-120b', updated_at: new Date().toISOString() })
      .eq('provider', 'cerebras')
      .neq('model', 'gpt-oss-120b')
      .select('id, label, model');
    if (error) {
      console.error('Model fix failed:', error.message);
      process.exit(1);
    }
    console.log(`Updated model on ${data?.length ?? 0} Cerebras key(s)`);
  }

  const count = await forceResetProviderCounters(provider);
  console.log(
    `Reset tokens_used_today → 0 for ${count} key(s)${provider ? ` (${provider})` : ' (all providers)'}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
