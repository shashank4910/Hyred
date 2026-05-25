import type { RawJob } from '../types';

/**
 * Hacker News "Who is hiring" - we fetch the latest monthly thread via
 * Algolia search and return its top-level comments as job posts.
 *
 * Algolia search docs: https://hn.algolia.com/api
 */
const SEARCH_URL =
  'https://hn.algolia.com/api/v1/search?tags=story&query=Ask%20HN%3A%20Who%20is%20hiring%3F';

type Hit = { objectID: string; title: string; created_at: string };
type Item = {
  id: number;
  text?: string;
  author?: string;
  created_at?: string;
  kids?: number[];
};

function stripHtml(s: string): string {
  return s
    .replace(/<p>/gi, '\n\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x2F;/g, '/')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+\n/g, '\n')
    .replace(/\n\s+/g, '\n')
    .trim();
}

function firstLine(s: string): string {
  return s.split('\n')[0]?.trim().slice(0, 200) ?? '';
}

function extractUrl(s: string): string | null {
  const m = s.match(/https?:\/\/[^\s)<>"]+/);
  return m ? m[0] : null;
}

export async function fetchHackerNews(opts?: { limit?: number }): Promise<RawJob[]> {
  const limit = opts?.limit ?? 60;

  // 1. Find the most recent "Ask HN: Who is hiring?" thread
  const searchRes = await fetch(SEARCH_URL, { cache: 'no-store' });
  if (!searchRes.ok) throw new Error(`HN search ${searchRes.status}`);
  const search = (await searchRes.json()) as { hits: Hit[] };
  const thread = search.hits.find((h) => /who is hiring/i.test(h.title));
  if (!thread) return [];

  // 2. Fetch the thread to get top-level comment ids
  const threadRes = await fetch(
    `https://hacker-news.firebaseio.com/v0/item/${thread.objectID}.json`,
  );
  if (!threadRes.ok) throw new Error(`HN thread ${threadRes.status}`);
  const threadItem = (await threadRes.json()) as Item;
  const kids = (threadItem.kids ?? []).slice(0, limit);

  // 3. Fetch comments in parallel batches of 10
  const jobs: RawJob[] = [];
  for (let i = 0; i < kids.length; i += 10) {
    const batch = kids.slice(i, i + 10);
    const items = await Promise.all(
      batch.map((id) =>
        fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`)
          .then((r) => (r.ok ? (r.json() as Promise<Item>) : null))
          .catch(() => null),
      ),
    );
    for (const it of items) {
      if (!it || !it.text) continue;
      const text = stripHtml(it.text);
      const headline = firstLine(text);
      if (!headline) continue;
      const url = extractUrl(text) ?? `https://news.ycombinator.com/item?id=${it.id}`;
      jobs.push({
        source: 'hn',
        source_id: String(it.id),
        title: headline,
        company: it.author ?? null,
        location: null,
        remote: /remote/i.test(text),
        url,
        description: text.slice(0, 5000),
        salary: null,
        tags: null,
        posted_at: it.created_at ?? null,
      });
    }
  }
  return jobs;
}
