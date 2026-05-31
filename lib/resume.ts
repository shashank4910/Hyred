import mammoth from 'mammoth';
import pdfParse from 'pdf-parse-fork';
import WordExtractor from 'word-extractor';

const wordExtractor = new WordExtractor();

/**
 * Parse a resume buffer based on its mime type, filename, or file signature.
 * Returns plain text suitable for embedding.
 */
export async function parseResume(args: {
  buffer: Buffer;
  filename: string;
  mimeType?: string;
}): Promise<string> {
  const lower = args.filename.toLowerCase();
  const mime = args.mimeType ?? '';

  if (
    lower.endsWith('.pdf') ||
    mime === 'application/pdf' ||
    isPdfBuffer(args.buffer)
  ) {
    const result = await pdfParse(args.buffer);
    return cleanWhitespace(result.text ?? '');
  }

  if (
    lower.endsWith('.docx') ||
    mime ===
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    isDocxBuffer(args.buffer)
  ) {
    const result = await mammoth.extractRawText({ buffer: args.buffer });
    return cleanWhitespace(result.value ?? '');
  }

  if (
    (lower.endsWith('.doc') && !lower.endsWith('.docx')) ||
    mime === 'application/msword' ||
    isLegacyDocBuffer(args.buffer)
  ) {
    const doc = await wordExtractor.extract(args.buffer);
    return cleanWhitespace(doc.getBody() ?? '');
  }

  if (lower.endsWith('.txt') || mime.startsWith('text/')) {
    return cleanWhitespace(args.buffer.toString('utf8'));
  }

  throw new Error(
    `Unsupported file type. Upload .pdf, .doc, .docx, or .txt (got ${args.filename}).`,
  );
}

function isPdfBuffer(buffer: Buffer): boolean {
  return buffer.length >= 4 && buffer.subarray(0, 4).toString() === '%PDF';
}

/** ZIP / OOXML (modern Word .docx). */
function isDocxBuffer(buffer: Buffer): boolean {
  return buffer.length >= 2 && buffer[0] === 0x50 && buffer[1] === 0x4b;
}

/** OLE compound document (legacy Word .doc). */
function isLegacyDocBuffer(buffer: Buffer): boolean {
  return (
    buffer.length >= 4 &&
    buffer[0] === 0xd0 &&
    buffer[1] === 0xcf &&
    buffer[2] === 0x11 &&
    buffer[3] === 0xe0
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
