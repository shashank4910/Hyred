import { NextRequest, NextResponse } from 'next/server';
import { analyzeMatchStudio, buildProposedChanges } from '@/lib/match-studio';

export const runtime = 'nodejs';
// 120s (was 60): the analysis makes up to 3 LLM calls (extraction pair +
// grade) and a cold-cache run measured 43-83s wall — Vercel killed it at 60s
// mid-grade (no error rows even logged; Session 53 round 4). Matches the
// resume route's 120s precedent.
export const maxDuration = 120;

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
    // Story-first review: the deterministic preview of concrete changes (reframed
    // bullets + missing must-haves). Stateless — Accept/Skip lives client-side.
    // No regeneration, no DB write, no quota charge (free-tier friendly).
    const changes = buildProposedChanges(analysis);
    return NextResponse.json({ ...analysis, changes });
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
