import { NextRequest, NextResponse } from 'next/server';
import { parseResume } from '@/lib/resume';
import { checkAtsCompatibility } from '@/lib/ats-checker';

export const runtime = 'nodejs';
export const maxDuration = 30;

/**
 * POST /api/ats-checker
 *
 * Accepts a resume (file upload or pasted text) and returns ATS-friendliness
 * analysis. Zero LLM calls — pure deterministic scoring.
 *
 * Body (multipart):
 *   resume: File (.pdf, .doc, .docx, .txt)
 *
 * Body (JSON):
 *   { "resume_text": "..." }
 *
 * Response:
 *   { overallScore, breakdown, topImprovements, detectedIssues, goodPractices, fileHints? }
 */
export async function POST(req: NextRequest) {
  const contentType = req.headers.get('content-type') ?? '';
  let resumeText: string;
  let filename: string | undefined;

  try {
    if (contentType.includes('multipart/form-data')) {
      const form = await req.formData();
      const file = form.get('resume') as File | null;
      if (!file || file.size === 0) {
        return NextResponse.json({ error: 'No file provided.' }, { status: 400 });
      }
      if (file.size > 10 * 1024 * 1024) {
        return NextResponse.json(
          { error: 'File too large (max 10MB).' },
          { status: 400 },
        );
      }
      filename = file.name;
      const buffer = Buffer.from(await file.arrayBuffer());
      resumeText = await parseResume({ buffer, filename, mimeType: file.type });
    } else {
      const body = (await req.json().catch(() => ({}))) as {
        resume_text?: string;
      };
      if (!body.resume_text || body.resume_text.trim().length < 50) {
        return NextResponse.json(
          { error: 'Resume text too short (min 50 characters).' },
          { status: 400 },
        );
      }
      resumeText = body.resume_text;
    }
  } catch (e) {
    return NextResponse.json(
      { error: `Could not read resume: ${(e as Error).message}` },
      { status: 400 },
    );
  }

  if (resumeText.trim().length < 50) {
    return NextResponse.json(
      { error: 'Parsed resume content is too short to analyze. The file may be scanned/image-based.' },
      { status: 400 },
    );
  }

  const result = checkAtsCompatibility(resumeText, filename);

  return NextResponse.json({
    ...result,
    resume_chars: resumeText.length,
    filename: filename ?? null,
  });
}
