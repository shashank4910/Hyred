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
    return await parseDocx(args.buffer);
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

/**
 * Parse a DOCX buffer using mammoth's HTML output to preserve bullet/list markers.
 * mammoth.extractRawText strips all formatting — including bullet characters — so we
 * use convertToHtml instead to get list structure, then convert to plain text while
 * preserving list markers with "- " prefixes.
 */
async function parseDocx(buffer: Buffer): Promise<string> {
  try {
    const htmlResult = await mammoth.convertToHtml({ buffer });
    const html = htmlResult.value ?? '';

    if (hasListItems(html)) {
      return cleanWhitespace(docxHtmlToPlainText(html));
    }
  } catch {
    // convertToHtml failed — fall through to extractRawText
  }

  // Fall back to raw text (faster path, no bullet markers though)
  const rawResult = await mammoth.extractRawText({ buffer });
  return cleanWhitespace(rawResult.value ?? '');
}

/** Check if HTML from mammoth contains list items. */
function hasListItems(html: string): boolean {
  return /<li>/i.test(html);
}

/**
 * Convert mammoth's HTML output to plain text while preserving bullet markers.
 *
 * - Prepends "- " to each list item so findBulletLines() can detect them
 * - Strips all other HTML tags
 * - Unescapes common HTML entities
 */
function docxHtmlToPlainText(html: string): string {
  let text = html;

  // Detach list containers — add blank lines around lists
  text = text.replace(/<\/ol>/gi, '\n');
  text = text.replace(/<\/ul>/gi, '\n');

  // Turn each list item into a bullet line
  // Use <li[^>]*> to handle attributes like <li class="tab1">
  text = text.replace(/<li[^>]*>/gi, '- ');
  text = text.replace(/<\/li>/gi, '\n');

  // Paragraphs become double-newlines (same as extractRawText)
  text = text.replace(/<\/p>/gi, '\n\n');

  // Line breaks
  text = text.replace(/<br\s*\/?>/gi, '\n');

  // Strip remaining HTML tags
  text = text.replace(/<[^>]+>/g, '');

  // Unescape HTML entities comprehensively
  text = text.replace(/&(?:amp|#38);/g, '&');
  text = text.replace(/&(?:lt|#60);/g, '<');
  text = text.replace(/&(?:gt|#62);/g, '>');
  text = text.replace(/&(?:quot|#34);/g, '"');
  text = text.replace(/&(?:apos|#39);/g, "'");
  text = text.replace(/&nbsp;|&#160;|&#xa0;/g, ' ');
  text = text.replace(/&mdash;|&#8212;|&#x2014;/g, '—');
  text = text.replace(/&ndash;|&#8211;|&#x2013;/g, '–');
  text = text.replace(/&hellip;|&#8230;|&#x2026;/g, '…');
  text = text.replace(/&laquo;|&#171;|&#xab;/g, '«');
  text = text.replace(/&raquo;|&#187;|&#xbb;/g, '»');
  text = text.replace(/&copy;|&#169;|&#xa9;/g, '©');
  text = text.replace(/&reg;|&#174;|&#xae;/g, '®');
  // Fallback: decode any remaining numeric HTML entities
  text = text.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)));
  text = text.replace(/&#x([0-9a-fA-F]+);/g, (_, code) => String.fromCharCode(parseInt(code, 16)));

  return text.trim();
}

function cleanWhitespace(s: string): string {
  return s
    .replace(/\r\n/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
