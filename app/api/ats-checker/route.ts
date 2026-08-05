import { NextRequest, NextResponse } from 'next/server';
import { parseResume } from '@/lib/resume';
import { getCurrentProfile } from '@/lib/current-user';
import { runEvidenceGroundedAts } from '@/lib/ats-evidence-engine';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * POST /api/ats-checker
 *
 * Accepts a resume (file upload or pasted text) and returns ATS analysis.
 *
 * - Logged-in users → hybrid evidence-grounded engine (facts + LLM semantic + gate)
 * - Anonymous / public widget → structural only (fast, zero LLM)
 * - Body/query `engine=structural|hybrid` can override (hybrid requires auth)
 *
 * Body (multipart): resume file + optional job_description
 * Body (JSON): { resume_text, job_description?, engine? }
 */
export async function POST(req: NextRequest) {
  const contentType = req.headers.get('content-type') ?? '';
  let resumeText: string;
  let filename: string | undefined;
  let jobDescription: string | undefined;
  let engineOverride: 'structural' | 'hybrid' | undefined;

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
      jobDescription = (form.get('job_description') as string | undefined) || undefined;
      const eng = form.get('engine');
      if (eng === 'structural' || eng === 'hybrid') engineOverride = eng;
    } else {
      const body = (await req.json().catch(() => ({}))) as {
        resume_text?: string;
        job_description?: string;
        engine?: string;
      };
      if (!body.resume_text || body.resume_text.trim().length < 50) {
        return NextResponse.json(
          { error: 'Resume text too short (min 50 characters).' },
          { status: 400 },
        );
      }
      resumeText = body.resume_text;
      jobDescription = body.job_description;
      if (body.engine === 'structural' || body.engine === 'hybrid') {
        engineOverride = body.engine;
      }
    }
  } catch (e) {
    return NextResponse.json(
      { error: `Could not read resume: ${(e as Error).message}` },
      { status: 400 },
    );
  }

  if (resumeText.trim().length < 50) {
    return NextResponse.json(
      {
        error:
          'Parsed resume content is too short to analyze. The file may be scanned/image-based.',
      },
      { status: 400 },
    );
  }

  const profile = await getCurrentProfile();
  const urlEngine = req.nextUrl.searchParams.get('engine');
  if (urlEngine === 'structural' || urlEngine === 'hybrid') {
    engineOverride = urlEngine;
  }

  let mode: 'structural' | 'hybrid' = profile ? 'hybrid' : 'structural';
  if (engineOverride === 'structural') mode = 'structural';
  if (engineOverride === 'hybrid') {
    if (!profile) {
      return NextResponse.json(
        { error: 'Hybrid engine requires sign-in.' },
        { status: 401 },
      );
    }
    mode = 'hybrid';
  }

  const evidence = await runEvidenceGroundedAts(resumeText, {
    filename,
    jobDescription,
    profileId: profile?.id,
    mode,
  });

  return NextResponse.json({
    ...evidence.result,
    engine: evidence.engine,
    report: evidence.report,
    /** Parsed / normalized resume body — needed for Fix Studio after file upload */
    resume_text: evidence.resumeText,
    resume_chars: evidence.resumeText.length,
    filename: filename ?? null,
  });
}
