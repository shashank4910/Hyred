/**
 * Cosine similarity between two equal-length vectors.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

/**
 * Build a compact text representation of a job for embedding.
 */
export function jobToEmbeddingText(job: {
  title: string;
  company: string | null;
  location: string | null;
  description: string | null;
  tags: string[] | null;
}): string {
  const parts = [
    `Title: ${job.title}`,
    job.company ? `Company: ${job.company}` : null,
    job.location ? `Location: ${job.location}` : null,
    job.tags?.length ? `Tags: ${job.tags.join(', ')}` : null,
    job.description ? `\n${job.description}` : null,
  ].filter(Boolean);
  return parts.join('\n');
}
