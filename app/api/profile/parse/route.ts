import { NextRequest, NextResponse } from 'next/server';
import { parseResume } from '@/lib/resume';
import { extractResumeInsights } from '@/lib/gemini';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * Parse + analyze a resume without saving anything.
 *
 * Used by the onboarding form to auto-fill name, email, location,
 * target roles, etc. when a user drops a file.
 *
 * Body: multipart with `resume` file (.pdf, .doc, .docx, .txt)
 *   OR  JSON with { resume_text: string }
 *
 * Response: { resume_text: string, insights: ResumeInsights }
 */
export async function POST(req: NextRequest) {
  const contentType = req.headers.get('content-type') ?? '';
  let resumeText: string;
  let filename: string | undefined;
  let fileBytes: number | undefined;

  try {
    if (contentType.includes('multipart/form-data')) {
      const form = await req.formData();
      const file = form.get('resume') as File | null;
      if (!file || file.size === 0) {
        console.warn('[profile/parse] 400 no file provided');
        return NextResponse.json({ error: 'no file provided' }, { status: 400 });
      }
      filename = file.name;
      fileBytes = file.size;
      if (file.size > 5 * 1024 * 1024) {
        console.warn('[profile/parse] 400 file too large', {
          filename,
          fileBytes,
        });
        return NextResponse.json(
          { error: 'file too large (max 5MB)' },
          { status: 400 },
        );
      }
      const buffer = Buffer.from(await file.arrayBuffer());
      resumeText = await parseResume({
        buffer,
        filename: file.name,
        mimeType: file.type,
      });
    } else {
      const body = (await req.json().catch(() => ({}))) as {
        resume_text?: string;
      };
      if (!body.resume_text || body.resume_text.length < 50) {
        console.warn('[profile/parse] 400 resume_text too short');
        return NextResponse.json(
          { error: 'resume_text too short' },
          { status: 400 },
        );
      }
      resumeText = body.resume_text;
    }
  } catch (e) {
    const msg = (e as Error).message;
    console.error('[profile/parse] parse failed', {
      filename,
      fileBytes,
      error: msg,
    });
    return NextResponse.json(
      { error: `Could not parse resume: ${msg}` },
      { status: 400 },
    );
  }

  if (resumeText.length < 50) {
    console.warn('[profile/parse] 400 content too short after parse', {
      filename,
      fileBytes,
      chars: resumeText.length,
    });
    return NextResponse.json(
      {
        error:
          'Could not read enough text from this file. If it is a scanned/image PDF, export a text PDF or .docx and try again.',
      },
      { status: 400 },
    );
  }

  let insights = null;
  let analysisError: string | null = null;
  try {
    insights = await extractResumeInsights(resumeText);
  } catch (e) {
    // Non-fatal: still return the parsed text so user can fill the form manually.
    analysisError = (e as Error).message;
  }

  return NextResponse.json({
    resume_text: resumeText,
    resume_chars: resumeText.length,
    insights,
    analysis_error: analysisError,
  });
}
