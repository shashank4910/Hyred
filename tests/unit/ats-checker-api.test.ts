/**
 * Integration tests for the ATS Checker API route.
 *
 * Tests the POST /api/ats-checker handler directly with mock
 * requests — covers content-type handling, input validation,
 * error cases, and response shape.
 */

import { describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

// Mock the route's external dependencies
vi.mock('@/lib/resume', () => ({
  parseResume: vi.fn(async ({ buffer, filename }: { buffer: Buffer; filename: string }) => {
    if (filename === 'scanned.pdf') return 'Hello'; // < 50 chars = scanned
    if (filename === 'corrupt.pdf') throw new Error('Failed to parse PDF');
    return [
      'John Smith',
      'john@email.com | (555) 123-4567',
      'San Francisco, CA',
      '',
      'PROFESSIONAL SUMMARY',
      'Experienced software engineer with 5+ years building web applications.',
      '',
      'PROFESSIONAL EXPERIENCE',
      '- Led a team of 5 engineers to build a platform serving 2M users',
      '- Reduced API response times by 40% through query optimization',
      '- Designed microservices architecture using Docker and Kubernetes',
      '- Mentored 3 junior engineers through code review and pair programming',
      '',
      'EDUCATION',
      'Bachelor of Science in Computer Science, University of California',
      '',
      'TECHNICAL SKILLS',
      'Languages: TypeScript, JavaScript, Python, Java',
      'Frontend: React, Next.js, HTML/CSS',
      'Backend: Node.js, Express, PostgreSQL',
      'DevOps: Docker, Kubernetes, AWS',
    ].join('\n');
  }),
}));

vi.mock('@/lib/current-user', () => ({
  getCurrentProfile: vi.fn(async () => null),
}));

// Import after mocks
const { POST } = await import('@/app/api/ats-checker/route');

function makeJsonRequest(body: Record<string, unknown>, headers?: Record<string, string>): NextRequest {
  return new NextRequest('http://localhost:3000/api/ats-checker', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

/* ------------------------------------------------------------------ */
/*  JSON Request Tests                                                 */
/* ------------------------------------------------------------------ */

describe('POST /api/ats-checker (JSON)', () => {
  it('returns 400 for empty body', async () => {
    const req = makeJsonRequest({});
    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('too short');
  });

  it('returns 400 for short resume text (< 50 chars)', async () => {
    const req = makeJsonRequest({ resume_text: 'Hello world' });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('too short');
  });

  it('returns 200 with full results for valid resume text', async () => {
    const resumeText = [
      'John Smith',
      'john@email.com | (555) 123-4567',
      'San Francisco, CA',
      '',
      'PROFESSIONAL SUMMARY',
      'Experienced software engineer.', // dummy content
      '',
      'PROFESSIONAL EXPERIENCE',
      '- Led a team of 5 engineers',
      '- Reduced API response times by 40%',
      '- Designed microservices using Docker and Kubernetes',
      '- Mentored 3 junior engineers',
      '',
      'EDUCATION',
      'Bachelor of Science in Computer Science',
      '',
      'TECHNICAL SKILLS',
      'TypeScript, React, Node.js, Docker',
    ].join('\n');

    const req = makeJsonRequest({ resume_text: resumeText });
    const res = await POST(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.overallScore).toBeGreaterThanOrEqual(0);
    expect(data.overallScore).toBeLessThanOrEqual(100);
    expect(data.breakdown.sectionStructure).toBeDefined();
    expect(data.breakdown.contactInfo).toBeDefined();
    expect(data.breakdown.bulletQuality).toBeDefined();
    expect(data.breakdown.quantifiableAchievements).toBeDefined();
    expect(data.breakdown.skillsOptimization).toBeDefined();
    expect(data.breakdown.lengthReadability).toBeDefined();
    expect(data.breakdown.formatCleanliness).toBeDefined();
    expect(data.breakdown.dateConsistency).toBeDefined();
    expect(data.stats.wordCount).toBeGreaterThan(0);
    expect(data.stats.charCount).toBeGreaterThan(0);
    expect(Array.isArray(data.topImprovements)).toBe(true);
    expect(Array.isArray(data.detectedIssues)).toBe(true);
    expect(data.resume_chars).toBeGreaterThan(0);
    expect(data.filename).toBeNull();
    expect(data.engine).toBe('structural');
    expect(data.report).toBeDefined();
    expect(Array.isArray(data.report.categories)).toBe(true);
  });

  it('accepts optional job_description and returns jdMatch', async () => {
    const resumeText = [
      'John Smith | john@email.com',
      '',
      'PROFESSIONAL EXPERIENCE',
      '- Built applications using TypeScript, React, and Node.js.',
      '- Deployed services on AWS using Docker and Kubernetes.',
      '',
      'EDUCATION',
      'B.S. Computer Science',
      '',
      'TECHNICAL SKILLS',
      'TypeScript, React, Node.js, AWS, Docker, Kubernetes',
    ].join('\n');

    const req = makeJsonRequest({
      resume_text: resumeText,
      job_description: 'Need TypeScript, React, AWS, Docker, Kubernetes engineer.',
    });
    const res = await POST(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.jdMatch).toBeDefined();
    expect(data.jdMatch.matchScore).toBeGreaterThan(0);
    expect(data.jdMatch.matched.length).toBeGreaterThanOrEqual(1);
    expect(data.jdMatch.missing).toBeDefined();
  });

  it('handles malformed JSON gracefully', async () => {
    const req = new NextRequest('http://localhost:3000/api/ats-checker', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not-json-at-all',
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});

/* ------------------------------------------------------------------ */
/*  Multipart / File Upload Tests                                      */
/* ------------------------------------------------------------------ */

describe('POST /api/ats-checker (multipart file upload)', () => {
  it('returns 400 when no file is provided', async () => {
    // Empty form with multipart content-type: the route can't parse it and throws
    const form = new FormData();
    const req = new NextRequest('http://localhost:3000/api/ats-checker', {
      method: 'POST',
      body: form,
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('returns 200 for valid .docx upload', async () => {
    const form = new FormData();
    form.append('resume', new Blob(['fake-docx-binary'], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }), 'resume.docx');
    const fileReq = new NextRequest('http://localhost:3000/api/ats-checker', {
      method: 'POST',
      body: form,
    });

    const res = await POST(fileReq);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.overallScore).toBeGreaterThanOrEqual(0);
    expect(data.filename).toBe('resume.docx');
    // .docx should hint as 'best' format
    expect(data.fileHints.formatQuality).toBe('best');
  });

  it('returns 400 for corrupt/parse-failed file', async () => {
    const form = new FormData();
    form.append('resume', new Blob(['fake'], { type: 'application/pdf' }), 'corrupt.pdf');
    const req = new NextRequest('http://localhost:3000/api/ats-checker', {
      method: 'POST',
      body: form,
    });
    const res = await POST(req);
    // The mock throws an error, which gets caught and returns 400
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('Could not read resume');
  });

  it('returns 400 for scanned/image PDF (< 50 chars after parse)', async () => {
    const form = new FormData();
    form.append('resume', new Blob(['fake'], { type: 'application/pdf' }), 'scanned.pdf');
    const req = new NextRequest('http://localhost:3000/api/ats-checker', {
      method: 'POST',
      body: form,
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('too short');
  });

  it('accepts job_description alongside file upload', async () => {
    const form = new FormData();
    form.append('resume', new Blob(['fake-docx'], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }), 'resume.docx');
    form.append('job_description', 'Need TypeScript and React.');
    const req = new NextRequest('http://localhost:3000/api/ats-checker', {
      method: 'POST',
      body: form,
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.jdMatch).toBeDefined();
  });
});

/* ------------------------------------------------------------------ */
/*  File size limit tests                                              */
/* ------------------------------------------------------------------ */

describe('POST /api/ats-checker (file size limits)', () => {
  it('returns 400 when file exceeds 10MB', async () => {
    const largeBlob = new Blob(['x'.repeat(11 * 1024 * 1024)], { type: 'text/plain' });
    const form = new FormData();
    form.append('resume', largeBlob, 'large-file.txt');
    const req = new NextRequest('http://localhost:3000/api/ats-checker', {
      method: 'POST',
      body: form,
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('too large');
  });
});
