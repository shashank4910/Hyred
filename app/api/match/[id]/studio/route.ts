import { NextRequest, NextResponse } from 'next/server';
import { analyzeMatchStudio } from '@/lib/match-studio';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * POST /api/match/[id]/studio — Ready-to-Apply analysis for the current user
 * against this job: requirement checklist with evidence states, robot + human
 * scores, recruiter verdict, and smart pre-selected keywords for generation.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const analysis = await analyzeMatchStudio(id);
    return NextResponse.json(analysis);
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === 'Not authenticated') {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
    if (msg === 'no_resume') {
      return NextResponse.json({ error: 'no_resume' }, { status: 400 });
    }
    if (msg === 'Match not found') {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    console.error('[api/match/studio] failed:', msg);
    return NextResponse.json({ error: 'analysis_failed' }, { status: 500 });
  }
}
