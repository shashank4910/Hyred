import mammoth from 'mammoth';
import pdfParse from 'pdf-parse-fork';

/**
 * Parse a resume buffer based on its mime type or filename.
 * Returns plain text suitable for embedding.
 */
export async function parseResume(args: {
  buffer: Buffer;
  filename: string;
  mimeType?: string;
}): Promise<string> {
  const lower = args.filename.toLowerCase();
  const mime = args.mimeType ?? '';

  if (lower.endsWith('.pdf') || mime === 'application/pdf') {
    const result = await pdfParse(args.buffer);
    return cleanWhitespace(result.text ?? '');
  }

  if (
    lower.endsWith('.docx') ||
    mime ===
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) {
    const result = await mammoth.extractRawText({ buffer: args.buffer });
    return cleanWhitespace(result.value ?? '');
  }

  if (lower.endsWith('.txt') || mime.startsWith('text/')) {
    return cleanWhitespace(args.buffer.toString('utf8'));
  }

  throw new Error(
    `Unsupported file type. Upload .pdf, .docx, or .txt (got ${args.filename}).`,
  );
}

function cleanWhitespace(s: string): string {
  return s
    .replace(/\r\n/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
