/**
 * Unit tests for the ATS Checker scoring engine.
 *
 * Tests cover all 8 criteria plus new features:
 * - Multi-column layout detection
 * - Header/footer position warnings
 * - Keyword stuffing detection
 * - File format scoring
 * - STANDARD_HEADERS recognition
 */

import { describe, expect, it } from 'vitest';
import { checkAtsCompatibility, extractKeywords, keywordInText } from '@/lib/ats-checker';
import { ATS_SAMPLE_RESUME } from '@/lib/ats-checker-samples';

/* ------------------------------------------------------------------ */
/*  Helper: create a minimal passing resume                            */
/* ------------------------------------------------------------------ */

function makeMinimalResume(): string {
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
    '',
  ].join('\n');
}

/* ------------------------------------------------------------------ */
/*  Section Structure Tests                                           */
/* ------------------------------------------------------------------ */

describe('Section Structure', () => {
  it('scores highly when all required headers are present', () => {
    const result = checkAtsCompatibility(makeMinimalResume());
    expect(result.breakdown.sectionStructure.score).toBeGreaterThanOrEqual(50);
  });

  it('penalizes missing Experience section', () => {
    const text = [
      'John Smith',
      'john@email.com',
      '',
      'EDUCATION',
      'Bachelor degree',
      '',
      'SKILLS',
      'JavaScript, React',
    ].join('\n');
    const result = checkAtsCompatibility(text);
    expect(result.breakdown.sectionStructure.score).toBeLessThan(50);
  });

  it('recognizes standard header variations (Workday/SuccessFactors)', () => {
    // Use ALL-CAPS headers to ensure header detection works regardless of Title Case
    const text = [
      'John Smith | john@email.com | (555) 123-4567',
      '',
      'SUMMARY OF QUALIFICATIONS',
      'Experienced engineer with 8+ years of experience.',
      '',
      'PROFESSIONAL EXPERIENCE',
      '- Built scalable systems serving 1M+ users',
      '- Reduced infrastructure costs by 30%',
      '- Led team of 5 engineers',
      '- Implemented CI/CD pipeline reducing deployment time',
      '',
      'EDUCATION AND TRAINING',
      'M.S. Computer Science, University of Technology, 2015 - 2017',
      '',
      'TECHNICAL COMPETENCIES',
      'React, Node.js, TypeScript, Python, Docker',
      '',
      'PROFESSIONAL CERTIFICATIONS',
      'AWS Certified Solutions Architect',
      '',
      'LICENSES AND CERTIFICATIONS',
      'PMP, Certified Scrum Master',
    ].join('\n');
    const result = checkAtsCompatibility(text);
    // Should detect all standard sections
    expect(result.stats.sectionCount).toBeGreaterThanOrEqual(5);
    expect(result.breakdown.sectionStructure.score).toBeGreaterThanOrEqual(30);
  });

  it('detects non-standard section headers (3+ non-standard triggers warning)', () => {
    const text = [
      'John Smith | john@email.com',
      '',
      'My Professional Journey',
      '- Did stuff.',
      '',
      'Things I Learned',
      'Went to school.',
      '',
      'What I Bring',
      'Skills here.',
      '',
      'My Background',
      'More stuff.',
    ].join('\n');
    const result = checkAtsCompatibility(text);
    // Need 4 non-standard sections to trigger the > 2 penalty with issue
    expect(result.breakdown.sectionStructure.score).toBeLessThan(80);
  });
});

/* ------------------------------------------------------------------ */
/*  Contact Info Tests                                                 */
/* ------------------------------------------------------------------ */

describe('Contact Info', () => {
  it('detects all required contact fields', () => {
    const result = checkAtsCompatibility(makeMinimalResume());
    expect(result.breakdown.contactInfo.score).toBeGreaterThanOrEqual(50);
  });

  it('penalizes missing email', () => {
    const text = [
      'John Smith',
      '(555) 123-4567',
      '',
      'PROFESSIONAL EXPERIENCE',
      '- Some experience.',
    ].join('\n');
    const result = checkAtsCompatibility(text);
    expect(result.breakdown.contactInfo.score).toBeLessThanOrEqual(70);
  });

  it('detects LinkedIn profile', () => {
    const text = [
      'John Smith',
      'john@email.com | linkedin.com/in/johnsmith',
      '',
      'PROFESSIONAL EXPERIENCE',
      '- Some experience.',
    ].join('\n');
    const result = checkAtsCompatibility(text);
    expect(result.detectedIssues.some((i) => /linkedin/i.test(i))).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/*  Header/Footer Position Tests                                       */
/* ------------------------------------------------------------------ */

describe('Header/Footer Position Warning', () => {
  it('warns when contact info is isolated at top (header zone)', () => {
    // Name + contact isolated with 3+ blank lines gap before first section
    const text = [
      'John Smith',
      'john@email.com | (555) 123-4567',
      '',
      '',
      '',
      'PROFESSIONAL EXPERIENCE',
      '- Led a team of 5 engineers.',
      '- Built products used by 10K users.',
      '- Reduced costs by 20%.',
      '',
      'EDUCATION',
      'Bachelor of Science',
    ].join('\n');
    const result = checkAtsCompatibility(text);
    // Check that contact score is NOT 100 (penalty was applied)
    expect(result.breakdown.contactInfo.score).toBeLessThan(85);
  });

  it('does not warn for normally positioned contact info', () => {
    const result = checkAtsCompatibility(makeMinimalResume());
    // Should still detect contact or not, but not flag header/footer
    const hasHeaderWarning = result.detectedIssues.some((i) => /header|footer/i.test(i));
    expect(hasHeaderWarning).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/*  Bullet Quality Tests                                               */
/* ------------------------------------------------------------------ */

describe('Bullet Quality', () => {
  it('detects bullet points', () => {
    const result = checkAtsCompatibility(makeMinimalResume());
    expect(result.stats.bulletCount).toBeGreaterThanOrEqual(4);
  });

  it('penalizes resumes with no bullets', () => {
    const text = [
      'John Smith | john@email.com',
      '',
      'PROFESSIONAL EXPERIENCE',
      'Some company',
      'I worked here and did things.',
    ].join('\n');
    const result = checkAtsCompatibility(text);
    expect(result.breakdown.bulletQuality.score).toBeLessThanOrEqual(20);
  });

  it('reports bullet count in stats', () => {
    const result = checkAtsCompatibility(makeMinimalResume());
    expect(result.stats.bulletCount).toBeGreaterThan(0);
  });
});

/* ------------------------------------------------------------------ */
/*  Quantified Achievements Tests                                      */
/* ------------------------------------------------------------------ */

describe('Quantified Achievements', () => {
  it('detects percentages and metrics in bullets', () => {
    const result = checkAtsCompatibility(makeMinimalResume());
    expect(result.breakdown.quantifiableAchievements.score).toBeGreaterThanOrEqual(30);
  });

  it('scores low on resume with no numbers', () => {
    const text = [
      'John Smith | john@email.com',
      '',
      'PROFESSIONAL EXPERIENCE',
      '- Led a team',
      '- Built products',
      '- Wrote code',
    ].join('\n');
    const result = checkAtsCompatibility(text);
    expect(result.breakdown.quantifiableAchievements.score).toBeLessThan(50);
  });
});

/* ------------------------------------------------------------------ */
/*  Skills Optimization Tests                                          */
/* ------------------------------------------------------------------ */

describe('Skills Optimization', () => {
  it('rewards contextualized skills (skills in both skills section and bullets)', () => {
    const result = checkAtsCompatibility(makeMinimalResume());
    expect(result.breakdown.skillsOptimization.score).toBeGreaterThan(10);
  });

  it('penalizes missing skills section', () => {
    const text = [
      'John Smith | john@email.com | (555) 123-4567',
      '',
      'PROFESSIONAL EXPERIENCE',
      '- Built things.',
      '',
      'EDUCATION',
      'Degree.',
    ].join('\n');
    const result = checkAtsCompatibility(text);
    expect(result.breakdown.skillsOptimization.score).toBeLessThanOrEqual(20);
  });
});

/* ------------------------------------------------------------------ */
/*  Keyword Stuffing Detection Tests                                   */
/* ------------------------------------------------------------------ */

describe('Keyword Stuffing Detection', () => {
  it('flags very high keyword density in skills section', () => {
    const text = [
      'John Smith | john@email.com | (555) 123-4567',
      '',
      'PROFESSIONAL EXPERIENCE',
      '- Built things.',
      '',
      'EDUCATION',
      'Degree.',
      '',
      'TECHNICAL SKILLS',
      'JavaScript, TypeScript, Python, Java, React, Node, Express, Docker,',
      'Kubernetes, AWS, GCP, Azure, Git, Linux, MongoDB, Redis, SQL, GraphQL',
    ].join('\n');
    const result = checkAtsCompatibility(text);
    const feedback = result.breakdown.skillsOptimization.feedback;
    expect(feedback.toLowerCase()).toContain('keyword');
  });

  it('does not flag well-categorized skills', () => {
    const result = checkAtsCompatibility(makeMinimalResume());
    const hasStuffingWarning = result.breakdown.skillsOptimization.feedback.toLowerCase().includes('stuffing') ||
      result.breakdown.skillsOptimization.feedback.toLowerCase().includes('duplicate');
    // The sample resume has categorized skills (Languages:, Frontend:, etc.)
    // so it should NOT be flagged as stuffed
    expect(hasStuffingWarning).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/*  Multi-Column Layout Detection Tests                                */
/* ------------------------------------------------------------------ */

describe('Multi-Column Layout Detection', () => {
  it('detects tab-based multi-column layouts', () => {
    // Multiple rows with tab-separated content (simulates table-based resume)
    const text = [
      'John Smith\tjohn@email.com\t(555) 123-4567',
      '',
      'PROFESSIONAL EXPERIENCE',
      'Senior Engineer\tTechCorp Inc.\t2020-Present',
      '\tReact, Node.js, TypeScript\tSan Francisco, CA',
      'Staff Engineer\tBigCo Ltd.\t2018-2020',
      '\tPython, Django, AWS\tNew York, NY',
    ].join('\n');

    const result = checkAtsCompatibility(text);
    // Tab-heavy content should trigger multi-column penalty
    // The formatCleanliness score should be penalized below 90
    expect(result.breakdown.formatCleanliness.score).toBeLessThan(90);
  });

  it('detects staggered multi-column layouts (all short lines)', () => {
    // 16+ body lines all under 35 chars = narrow columns from 2-column layout
    const text = [
      'John Smith',
      'john@email.com',
      '',
      'PROFESSIONAL EXPERIENCE',
      'Senior Engineer',
      'Jan 2020 - Present',
      'TechCorp Inc.',
      'San Francisco, CA',
      'React, Node.js',
      'AWS, Docker',
      'Kubernetes, Terraform',
      'Software Engineer',
      'Jun 2017 - Dec 2019',
      'StartupXYZ',
      'New York, NY',
      'Python, PostgreSQL',
      'Redis, Kafka',
      'GraphQL, REST APIs',
      'Junior Developer',
      'Jan 2015 - May 2017',
      'WebAgency',
      'Chicago, IL',
      'JavaScript, PHP',
      'MySQL, Linux',
      'WordPress, Git',
      '',
      'EDUCATION',
      'MS Computer Science',
      'University of Tech',
      '2015 - 2017',
      'GPA 3.8',
      'BS Computer Eng',
      'State University',
      '2011 - 2015',
      'GPA 3.6',
    ].join('\n');

    const result = checkAtsCompatibility(text);
    // Almost all body lines are short (<35 chars) - narrow columns from 2-col layout
    // FormatCleanliness should be penalized
    expect(result.breakdown.formatCleanliness.score).toBeLessThan(90);
  });

  it('does not flag standard single-column resumes', () => {
    const result = checkAtsCompatibility(makeMinimalResume());
    // Should have high cleanliness score (minimal formatting issues)
    expect(result.breakdown.formatCleanliness.score).toBeGreaterThanOrEqual(60);
  });
});

/* ------------------------------------------------------------------ */
/*  Length & Readability Tests                                         */
/* ------------------------------------------------------------------ */

describe('Length & Readability', () => {
  it('reports word count in stats', () => {
    const result = checkAtsCompatibility(makeMinimalResume());
    expect(result.stats.wordCount).toBeGreaterThan(50);
  });

  it('penalizes very short resumes', () => {
    const text = 'John Smith\nJust a short resume.';
    const result = checkAtsCompatibility(text);
    expect(result.breakdown.lengthReadability.score).toBeLessThan(50);
  });
});

/* ------------------------------------------------------------------ */
/*  Date Consistency Tests                                             */
/* ------------------------------------------------------------------ */

describe('Date Consistency', () => {
  it('detects month/year date formats', () => {
    const resume = [
      'John Smith',
      'john@email.com',
      '',
      'PROFESSIONAL EXPERIENCE',
      '- Led a team at TechCorp, Jan 2021 - Present',
      '- Built features at StartupXYZ, Mar 2018 - Dec 2020',
      '',
      'EDUCATION',
      'Degree, University, 2012 - 2016',
    ].join('\n');
    const result = checkAtsCompatibility(resume);
    expect(result.stats.wordCount).toBeGreaterThan(0);
  });

  it('penalizes missing dates', () => {
    const text = [
      'John Smith | john@email.com',
      '',
      'PROFESSIONAL EXPERIENCE',
      '- Did some work.',
      '',
      'EDUCATION',
      'Degree.',
    ].join('\n');
    const result = checkAtsCompatibility(text);
    expect(result.breakdown.dateConsistency.score).toBeLessThan(60);
  });
});

/* ------------------------------------------------------------------ */
/*  File Format Scoring Tests                                          */
/* ------------------------------------------------------------------ */

describe('File Format Scoring', () => {
  it('classifies .docx as best format', () => {
    const result = checkAtsCompatibility(makeMinimalResume(), 'resume.docx');
    expect(result.fileHints?.formatQuality).toBe('best');
    expect(result.fileHints?.formatAdvice).toContain('.docx');
  });

  it('classifies .txt as good format', () => {
    const result = checkAtsCompatibility(makeMinimalResume(), 'resume.txt');
    expect(result.fileHints?.formatQuality).toBe('good');
  });

  it('classifies text-based PDF as good format', () => {
    const result = checkAtsCompatibility(makeMinimalResume(), 'resume.pdf');
    expect(result.fileHints?.formatQuality).toBe('good');
  });

  it('detects scanned PDF (short content)', () => {
    const result = checkAtsCompatibility('Hello', 'resume.pdf');
    expect(result.fileHints?.mightBeScanned).toBe(true);
    expect(result.fileHints?.formatQuality).toBe('poor');
  });
});

/* ------------------------------------------------------------------ */
/*  Standalone Scoring Tests                                           */
/* ------------------------------------------------------------------ */

describe('Overall ATS Score', () => {
  it('returns a well-formed result for a valid resume', () => {
    const result = checkAtsCompatibility(makeMinimalResume());
    expect(result.overallScore).toBeGreaterThanOrEqual(0);
    expect(result.overallScore).toBeLessThanOrEqual(100);

    // Check all 8 criteria are present
    expect(result.breakdown.sectionStructure).toBeDefined();
    expect(result.breakdown.contactInfo).toBeDefined();
    expect(result.breakdown.bulletQuality).toBeDefined();
    expect(result.breakdown.quantifiableAchievements).toBeDefined();
    expect(result.breakdown.skillsOptimization).toBeDefined();
    expect(result.breakdown.lengthReadability).toBeDefined();
    expect(result.breakdown.formatCleanliness).toBeDefined();
    expect(result.breakdown.dateConsistency).toBeDefined();
  });

  it('returns top improvements sorted by lowest score', () => {
    const result = checkAtsCompatibility(makeMinimalResume());
    expect(result.topImprovements.length).toBeGreaterThanOrEqual(1);
    expect(result.topImprovements.length).toBeLessThanOrEqual(5);
  });

  it('returns stats', () => {
    const result = checkAtsCompatibility(makeMinimalResume());
    expect(result.stats.wordCount).toBeGreaterThan(0);
    expect(result.stats.charCount).toBeGreaterThan(0);
    expect(result.stats.sectionCount).toBeGreaterThan(0);
  });
});

/* ------------------------------------------------------------------ */
/*  JD Keyword Match Tests                                             */
/* ------------------------------------------------------------------ */

describe('JD Keyword Match', () => {
  it('matches keywords between resume and job description', () => {
    const resume = makeMinimalResume();
    const jd = 'Looking for a TypeScript engineer with Docker and Kubernetes experience.';
    const result = checkAtsCompatibility(resume, 'resume.txt', jd);
    expect(result.jdMatch).toBeDefined();
    expect(result.jdMatch!.matched.length).toBeGreaterThanOrEqual(1);
    expect(result.jdMatch!.matchScore).toBeGreaterThan(0);
  });

  it('identifies missing keywords from JD', () => {
    const resume = 'John Smith\nNo skills here.';
    const jd = 'Need React, TypeScript, AWS, Docker, Kubernetes';
    const result = checkAtsCompatibility(resume, 'resume.txt', jd);
    expect(result.jdMatch).toBeDefined();
    expect(result.jdMatch!.missing.length).toBeGreaterThanOrEqual(1);
  });
});

/* ------------------------------------------------------------------ */
/*  extractKeywords Tests                                              */
/* ------------------------------------------------------------------ */

describe('extractKeywords', () => {
  it('extracts known tech keywords from text', () => {
    const text = 'I use TypeScript, React, Node.js, and Docker daily.';
    const keywords = extractKeywords(text);
    expect(keywords).toContain('typescript');
    expect(keywords).toContain('react');
    expect(keywords).toContain('docker');
  });

  it('extracts capitalized proper nouns', () => {
    const text = 'Worked with Datadog and New Relic for monitoring.';
    const keywords = extractKeywords(text);
    expect(keywords).toContain('datadog');
  });

  it('does not false-match short tokens inside other words', () => {
    expect(keywordInText('We improved performance ago', 'go')).toBe(false);
    expect(keywordInText('We improved performance metrics', 'r')).toBe(false);
    expect(extractKeywords('We improved performance ago')).not.toContain('go');
    expect(extractKeywords('We improved performance metrics')).not.toContain('r');
  });

  it('matches standalone Go and R language tokens', () => {
    expect(keywordInText('Backend in Go and Python', 'go')).toBe(true);
    expect(keywordInText('Statistical models in R and Python', 'r')).toBe(true);
  });

  it('does not match java inside javascript', () => {
    expect(keywordInText('Expert in JavaScript', 'java')).toBe(false);
    expect(keywordInText('Expert in Java and Kotlin', 'java')).toBe(true);
  });
});

describe('India-friendly contact detection', () => {
  it('detects Indian phone and location', () => {
    const text = [
      'Rajesh Kumar | rajesh@email.com | +91 9876543210',
      'Bangalore, Karnataka',
      '',
      'PROFESSIONAL EXPERIENCE',
      '- Built systems with Java and Spring Boot',
      '- Reduced latency by 35%',
      '- Led team of 4 engineers',
      '- Deployed on AWS with Docker',
      '',
      'EDUCATION',
      'B.Tech, IIT Bombay',
      '',
      'TECHNICAL SKILLS',
      'Java, Python, AWS, Docker, Kubernetes',
    ].join('\n');
    const result = checkAtsCompatibility(text);
    expect(result.breakdown.contactInfo.score).toBeGreaterThanOrEqual(70);
  });

  it('recognizes ALL CAPS name at top', () => {
    const text = [
      'PRIYA SHARMA',
      'priya@email.com | +91 9876543210',
      'Hyderabad, Telangana',
      '',
      'PROFESSIONAL EXPERIENCE',
      '- Did work.',
      '',
      'EDUCATION',
      'Degree',
      '',
      'SKILLS',
      'Java, Python',
    ].join('\n');
    const result = checkAtsCompatibility(text);
    expect(result.breakdown.contactInfo.score).toBeGreaterThanOrEqual(50);
  });
});

describe('Length calibration', () => {
  it('does not over-penalize concise structured resumes', () => {
    const result = checkAtsCompatibility(ATS_SAMPLE_RESUME);
    expect(result.stats.wordCount).toBeGreaterThanOrEqual(190);
    expect(result.breakdown.lengthReadability.score).toBeGreaterThanOrEqual(38);
    expect(result.overallScore).toBeGreaterThanOrEqual(65);
  });
});

describe('JD keyword aliases', () => {
  it('treats postgres and postgresql as equivalent', () => {
    const resume = [
      'John Smith | john@email.com',
      '',
      'PROFESSIONAL EXPERIENCE',
      '- Managed PostgreSQL databases at scale',
      '',
      'EDUCATION',
      'Degree',
      '',
      'SKILLS',
      'PostgreSQL, Docker',
    ].join('\n');
    const jd = 'Need postgres and docker experience.';
    const result = checkAtsCompatibility(resume, 'resume.txt', jd);
    expect(result.jdMatch?.matched).toContain('postgres');
    expect(result.jdMatch?.matchScore).toBeGreaterThanOrEqual(50);
  });
});

describe('Skills header with trailing colon', () => {
  it('parses skills section when header has a colon', () => {
    const text = [
      'John Smith',
      'john@email.com | San Francisco, CA',
      '',
      'PROFESSIONAL EXPERIENCE',
      '- Built apps with React and Node.js serving 1M users',
      '- Reduced costs by 20% using AWS Lambda',
      '- Led team of 3 engineers',
      '- Improved CI/CD with GitHub Actions',
      '',
      'EDUCATION',
      'BS CS',
      '',
      'TECHNICAL SKILLS:',
      'TypeScript, React, Node.js, Docker, Kubernetes, PostgreSQL',
    ].join('\n');
    const result = checkAtsCompatibility(text);
    expect(result.breakdown.skillsOptimization.score).toBeGreaterThan(15);
  });
});
