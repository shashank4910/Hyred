/** Client-safe resume upload helpers (no Node parsers). */

export const RESUME_FILE_ACCEPT =
  '.pdf,.doc,.docx,.txt,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain';

export function isResumeFilename(filename: string): boolean {
  const lower = filename.toLowerCase();
  return (
    lower.endsWith('.pdf') ||
    lower.endsWith('.docx') ||
    lower.endsWith('.txt') ||
    (lower.endsWith('.doc') && !lower.endsWith('.docx'))
  );
}
