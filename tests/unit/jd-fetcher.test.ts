import { describe, expect, it } from 'vitest';
import { stripHtml } from '@/lib/jd-fetcher';

describe('PR #7 #112 #116 JD HTML handling', () => {
  it('PR #112 stripHtml removes script and style blocks', () => {
    const html =
      '<p>Hello</p><script>alert(1)</script><style>.x{color:red}</style><p>World</p>';
    const text = stripHtml(html);
    expect(text).toContain('Hello');
    expect(text).toContain('World');
    expect(text).not.toContain('alert');
    expect(text).not.toContain('color:red');
  });

  it('PR #112 stripHtml decodes entities and list items', () => {
    const html = '<ul><li>Python</li><li>AWS</li></ul><p>Salary&nbsp;&amp;&nbsp;benefits</p>';
    const text = stripHtml(html);
    expect(text).toContain('Python');
    expect(text).toContain('Salary & benefits');
  });

  it('PR #116 stripHtml collapses excessive whitespace', () => {
    const html = '<div>   Senior   Engineer   </div>';
    expect(stripHtml(html)).toBe('Senior Engineer');
  });
});
