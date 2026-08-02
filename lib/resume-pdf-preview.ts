/** Build an object URL for in-browser PDF preview (same renderer as download). */
export async function createResumePdfObjectUrl(
  resumeText: string,
  templateId?: string | null,
): Promise<string> {
  const { generateBeautifulPdf } = await import('@/lib/pdf-resume');
  const doc = generateBeautifulPdf(resumeText, templateId);
  const blob = doc.output('blob');
  return URL.createObjectURL(blob);
}

export function revokeResumePdfObjectUrl(url: string | null | undefined) {
  if (url?.startsWith('blob:')) {
    URL.revokeObjectURL(url);
  }
}
