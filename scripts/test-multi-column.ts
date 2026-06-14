/**
 * Test: Multi-column layout detection in the ATS checker.
 *
 * Validates that detectMultiColumnLayout correctly identifies multi-column
 * resumes and produces appropriate severity levels.
 */

import { checkAtsCompatibility } from '../lib/ats-checker';

function makeSingleColumnResume(): string {
  return `John Smith
john.smith@email.com | (555) 123-4567

PROFESSIONAL SUMMARY

Senior Software Engineer with 8+ years of experience building scalable web applications using React, Node.js, and TypeScript.

PROFESSIONAL EXPERIENCE

TechCorp Inc. — Senior Software Engineer
Jan 2020 - Present

- Led a team of 5 engineers to build a real-time analytics platform serving 2M+ users
- Reduced API response times by 40% through query optimization and caching
- Designed and implemented a microservices architecture using Docker and Kubernetes
- Mentored 3 junior engineers through structured code review and pair programming
- Migrated legacy monolith to React-based SPA, improving developer velocity by 60%

StartupXYZ — Software Engineer
Jun 2017 - Dec 2019

- Built RESTful APIs serving 500K+ daily active users using Node.js and PostgreSQL
- Implemented CI/CD pipeline reducing deployment time from 2 hours to 15 minutes
- Developed real-time notification system using WebSockets and Redis pub/sub
- Wrote comprehensive unit and integration tests achieving 95% code coverage
- Collaborated with product team to ship 3 major features ahead of schedule

EDUCATION

Master of Science in Computer Science
University of Technology, 2015 - 2017

Bachelor of Science in Computer Engineering
State University, 2011 - 2015

TECHNICAL SKILLS

Languages: TypeScript, JavaScript, Python, Java, SQL
Frontend: React, Next.js, Redux, HTML/CSS, Tailwind
Backend: Node.js, Express, PostgreSQL, Redis, GraphQL
DevOps: Docker, Kubernetes, AWS, CI/CD, Terraform
Tools: Git, Webpack, Jest, Cypress, Datadog

CERTIFICATIONS

AWS Solutions Architect — Professional
Kubernetes Administrator (CKA)`;
}

function makeMultiColumnResume(): string {
  // Simulates what a 2-column resume looks like after parsing
  // Left column has job titles/companies, right column has dates/locations
  // The parsed text interleaves them
  return `John Smith
john.smith@email.com | (555) 123-4567

PROFESSIONAL SUMMARY

Senior Software Engineer with 8+ years of experience.

PROFESSIONAL EXPERIENCE

Senior Software Engineer
Jan 2020 - Present
TechCorp Inc.
San Francisco, CA
React, Node.js
AWS, Docker

Software Engineer
Jun 2017 - Dec 2019
StartupXYZ
New York, NY
Python, PostgreSQL
Redis, Kafka

Junior Developer
Jan 2015 - May 2017
WebAgency
Chicago, IL
JavaScript, PHP
MySQL, Linux

EDUCATION

M.S. Computer Science
University of Technology
2015 - 2017
GPA: 3.8

B.S. Computer Engineering
State University
2011 - 2015
GPA: 3.6

TECHNICAL SKILLS

JavaScript, TypeScript
React, Node.js, Python
Docker, Kubernetes, AWS
PostgreSQL, Redis, MongoDB`;
}

function makeTabularMultiColumnResume(): string {
  // Simulates what happens when a table-based multi-column resume is parsed
  // Tab characters are preserved between columns
  return `John Smith\tjohn.smith@email.com\t(555) 123-4567

PROFESSIONAL SUMMARY

Senior Software Engineer with 8+ years of experience.

PROFESSIONAL EXPERIENCE

Senior Software Engineer\tTechCorp Inc.\t2020 - Present
\tReact, Node.js, TypeScript\tSan Francisco, CA
Led team of 5 engineers\tReduced latency by 40%\tAWS migration
Built analytics platform\tMentored 3 juniors\tCI/CD pipeline

Software Engineer\tStartupXYZ\t2017 - 2019
\tPython, PostgreSQL\tNew York, NY
Built REST APIs\tRedis caching\t95% test coverage
WebSocket notifications\t3 major features\tAgile team

Junior Developer\tWebAgency\t2015 - 2017
\tJavaScript, PHP\tChicago, IL
WordPress plugins\tMySQL optimization\tLinux admin
Client integrations\tPerformance audits\tTechnical docs

EDUCATION

M.S. Computer Science\tUniversity of Technology\t2017
B.S. Computer Engineering\tState University\t2015`;
}

async function run() {
  console.log('='.repeat(70));
  console.log('📐 Testing Multi-Column Layout Detection');
  console.log('='.repeat(70));

  // Test 1: Single-column resume (should be clean)
  console.log('\n--- TEST 1: Single-Column Resume (control) ---');
  const singleCol = makeSingleColumnResume();
  const singleResult = checkAtsCompatibility(singleCol, 'resume.txt');
  console.log(`Format Cleanliness score: ${singleResult.breakdown.formatCleanliness.score}/100`);
  console.log(`Feedback: ${singleResult.breakdown.formatCleanliness.feedback}`);
  const hasMultiColumnIssue = singleResult.detectedIssues.some(i => i.toLowerCase().includes('multi-column') || i.toLowerCase().includes('column'));
  console.log(`Multi-column detected: ${hasMultiColumnIssue ? '❌ FALSE POSITIVE' : '✅ Correctly absent'}`);

  // Test 2: Staggered multi-column resume
  console.log('\n--- TEST 2: Staggered Multi-Column Resume ---');
  const multiCol = makeMultiColumnResume();
  const multiResult = checkAtsCompatibility(multiCol, 'resume.txt');
  console.log(`Format Cleanliness score: ${multiResult.breakdown.formatCleanliness.score}/100`);
  console.log(`Feedback: ${multiResult.breakdown.formatCleanliness.feedback}`);
  const staggerIssues = multiResult.breakdown.formatCleanliness.feedback;
  console.log(`Multi-column detected: ${staggerIssues.toLowerCase().includes('multi-column') || staggerIssues.toLowerCase().includes('column') ? '✅ Detected' : '❌ Missed'}`);
  console.log(`Score penalty applied: ${multiResult.breakdown.formatCleanliness.score < 90 ? '✅ Yes' : '❌ No'}`);

  // Test 3: Tab-based multi-column resume (strongest signal)
  console.log('\n--- TEST 3: Tab-Based Multi-Column Resume ---');
  const tabCol = makeTabularMultiColumnResume();
  const tabResult = checkAtsCompatibility(tabCol, 'resume.txt');
  console.log(`Format Cleanliness score: ${tabResult.breakdown.formatCleanliness.score}/100`);
  console.log(`Feedback: ${tabResult.breakdown.formatCleanliness.feedback}`);
  const tabIssues = tabResult.breakdown.formatCleanliness.feedback;
  console.log(`Multi-column detected: ${tabIssues.toLowerCase().includes('multi-column') || tabIssues.toLowerCase().includes('column') ? '✅ Detected' : '❌ Missed'}`);
  console.log(`Score penalty applied: ${tabResult.breakdown.formatCleanliness.score < 90 ? '✅ Yes' : '❌ No'}`);

  // Test 4: Empty/barely any content
  console.log('\n--- TEST 4: Minimal Content (edge case) ---');
  const minimalResult = checkAtsCompatibility('Hello World', 'resume.txt');
  console.log(`Format Cleanliness score: ${minimalResult.breakdown.formatCleanliness.score}/100`);
  console.log(`No false positives on minimal content: ${minimalResult.breakdown.formatCleanliness.score >= 95 ? '✅ Yes' : '❌ No'}`);

  // Summary
  console.log('\n' + '='.repeat(70));
  console.log('📊 SUMMARY');
  console.log('='.repeat(70));
  console.log(`Single-column (control):           ${!hasMultiColumnIssue ? '✅ Clean' : '❌ False positive'}`);
  console.log(`Staggered multi-column:             ${multiResult.breakdown.formatCleanliness.score < 90 ? '✅ Detected' : '❌ Missed'}`);
  console.log(`Tab-based multi-column:             ${tabResult.breakdown.formatCleanliness.score < 90 ? '✅ Detected' : '❌ Missed'}`);
  console.log(`Minimal content (no false positive): ${minimalResult.breakdown.formatCleanliness.score >= 95 ? '✅ Pass' : '❌ Fail'}`);

  const allPass =
    !hasMultiColumnIssue &&
    multiResult.breakdown.formatCleanliness.score < 90 &&
    tabResult.breakdown.formatCleanliness.score < 90 &&
    minimalResult.breakdown.formatCleanliness.score >= 95;

  console.log(`\n${allPass ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED'}`);
}

run().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
