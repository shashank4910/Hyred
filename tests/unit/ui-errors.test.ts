import { describe, expect, it } from 'vitest';
import { readableError, formatIngestWarnings } from '@/lib/ui';

describe('PR #91 scan toast readable errors', () => {
  it('PR #91 readableError never returns [object Object] for nested API errors', () => {
    const msg = readableError({ error: { message: 'Rate limit exceeded' } });
    expect(msg).toBe('Rate limit exceeded');
    expect(msg).not.toContain('[object Object]');
  });

  it('PR #91 formatIngestWarnings formats source errors array', () => {
    const msg = formatIngestWarnings([
      { source: 'linkedin', error: 'timeout' },
    ]);
    expect(msg).toContain('linkedin');
    expect(msg).not.toContain('[object Object]');
  });
});
