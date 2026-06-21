/** Build an object URL for in-browser PDF preview (same renderer as download). */
export async function createResumePdfObjectUrl(resumeText: string): Promise<string> {
  const { generateBeautifulPdf } = await import('@/lib/pdf-resume');
  const doc = generateBeautifulPdf(resumeText);
  const blob = doc.output('blob');
  return URL.createObjectURL(blob);
}

export function revokeResumePdfObjectUrl(url: string | null | undefined) {
  if (url?.startsWith('blob:')) {
    URL.revokeObjectURL(url);
  }
}
