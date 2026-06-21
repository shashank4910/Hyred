/**
 * Fix Bluesminds keys: reset counters + change 500K token limits → 300 req/day.
 *
 * Usage: npx tsx scripts/fix-bluesminds-keys.ts
 */
import { repairBluesmindsKeyBudgets } from '../lib/llm-keys';

async function main() {
  const result = await repairBluesmindsKeyBudgets();
  console.log(
    `Bluesminds: reset ${result.reset} key(s), repaired ${result.repaired} limit(s) to 300 req/day`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
