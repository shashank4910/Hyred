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

  it('parses pipe-separated jobs and does not treat date lines as employers', () => {
    const text = `PROFESSIONAL EXPERIENCE
Senior Performance Engineer  |  IRIS Software, Noida
Sep 2024 - Present
Client: Charles Schwab
- Built load tests

Performance Test Analyst  |  Coforge Ltd, Noida
Aug 2023 - Sep 2024
Client: Tokio Marine

Performance Engineer  |  Tata Consultancy Services, Bangalore
Dec 2021 - Aug 2023

Performance Tester  |  Cognizant Technology Solutions, Bangalore
Sep 2020 - Dec 2021
`;
    const s = extractResumeStructure(text);
    expect(s.work_history).toHaveLength(4);
    expect(s.work_history[0]?.company).toMatch(/IRIS/i);
    expect(s.work_history[0]?.start).toMatch(/Sep 2024/i);
    expect(s.work_history[1]?.company).toMatch(/Coforge/i);
    expect(s.work_history[2]?.company).toMatch(/Tata/i);
    expect(s.work_history[3]?.company).toMatch(/Cognizant/i);
    expect(s.work_history.some((j) => j.title === 'Present')).toBe(false);
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
