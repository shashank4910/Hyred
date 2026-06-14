import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { getCurrentProfile } from '@/lib/current-user';
import { generateOutreachMessage } from '@/lib/gemini';

export const runtime = 'nodejs';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = (await req.json().catch(() => ({}))) as { template?: string };
    const template = body.template;

    if (!template || !['peer', 'recruiter', 'warm'].includes(template)) {
      return NextResponse.json(
        { error: 'template must be "peer", "recruiter", or "warm"' },
        { status: 400 },
      );
    }

    const profile = await getCurrentProfile();
    if (!profile) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }

    const sb = supabaseAdmin();
    
    // Fetch match, associated job, and user profile details
    const { data: match, error: fetchError } = await sb
      .from('matches')
      .select(`
        id,
        matched_skills,
        job:jobs (
          title,
          company,
          description
        )
      `)
      .eq('id', id)
      .eq('profile_id', profile.id)
      .maybeSingle();

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    if (!match) {
      return NextResponse.json({ error: 'match not found' }, { status: 404 });
    }

    const job = match.job as any;
    if (!job) {
      return NextResponse.json({ error: 'job details not found' }, { status: 404 });
    }

    if (!profile.resume_text) {
      return NextResponse.json(
        { error: 'Please upload a resume first to generate tailored outreach.' },
        { status: 400 },
      );
    }

    // Call the AI utility helper
    const message = await generateOutreachMessage({
      resume: profile.resume_text,
      jobTitle: job.title,
      jobCompany: job.company ?? 'the company',
      jobDescription: job.description,
      template: template as 'peer' | 'recruiter' | 'warm',
      candidateName: profile.full_name || (profile.insights as any)?.full_name || null,
      profileId: profile.id,
    });

    return NextResponse.json({ success: true, message });
  } catch (err: any) {
    console.error('[outreach api] Error:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
