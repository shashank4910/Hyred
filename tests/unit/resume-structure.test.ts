import { describe, expect, it } from 'vitest';
import { extractResumeStructure } from '@/lib/extension/resume-structure';

const SAMPLE = `SHASHANK SINGH
Senior Performance Engineer
Bangalore, India | +91 9876543210 | test@email.com

EXPERIENCE
Acme Corp | Senior Engineer
Jan 2020 - Present
- Built load testing platform

EDUCATION
IIT Delhi
B.Tech Computer Science | 2018
`;

describe('extractResumeStructure', () => {
  it('parses work history and education from resume text', () => {
    const s = extractResumeStructure(SAMPLE);
    expect(s.work_history[0]?.company).toMatch(/Acme/i);
    expect(s.work_history[0]?.title).toMatch(/Senior Engineer/i);
    expect(s.education[0]?.school).toMatch(/IIT/i);
    expect(s.latest_company).toMatch(/Acme/i);
  });

  it('does not swap title into company when pipe order is title | company', () => {
    const text = `SHASHANK SINGH
Senior Performance Engineer

EXPERIENCE
Senior Performance Engineer | Paytm
Jan 2020 - Present
- Load testing and performance engineering for payments platform at scale

EDUCATION
IIT Delhi
B.Tech 2018
`;
    const s = extractResumeStructure(text);
    expect(s.work_history[0]?.company).toMatch(/Paytm/i);
    expect(s.work_history[0]?.title).toMatch(/Performance Engineer/i);
    expect(s.latest_company).toMatch(/Paytm/i);
  });
});
