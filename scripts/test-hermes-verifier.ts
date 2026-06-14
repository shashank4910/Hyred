import { verifyWithHermes } from '../lib/hermes-verifier';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load local environment variables (.env.local or .env)
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const sampleResumePerformanceEngineer = `
Shashank Shekhar
Email: shashank@example.com
Role: Senior Performance Engineer

Summary:
Over 8 years of experience in Software Performance Engineering, load testing, performance tuning, and capacity planning. Specialized in bottleneck identification, database query optimization, JVM tuning, and low-latency infrastructure design.

Skills:
- Performance Testing: JMeter, Gatling, LoadRunner, K6, Locust
- APM & Profiling: Dynatrace, New Relic, JProfiler, YourKit, Datadog
- Databases: PostgreSQL query tuning, Redis caching, indexing strategies
- Languages: Java, Python, Go, Bash
- Cloud & Infrastructure: AWS, Docker, Kubernetes, Linux system internals

Experience:
- Staff Performance Engineer at Tech Solutions (2022 - Present)
  * Architected performance testing strategy for core microservices, increasing throughput by 40% and reducing 95th percentile latency from 1.2s to 150ms.
  * Optimized database query execution plans, saving $12k/month in AWS RDS costs.
  * Diagnosed and fixed critical JVM memory leaks under heavy load conditions.
`;

const sampleJdQaAutomation = `
Job Title: FX Automation - QA Engineer
Company: Barclays
Location: Pune, India

About the Role:
We are looking for a QA Automation Engineer to join our FX Trading tech team. You will be responsible for writing functional UI and API automation test scripts, maintaining our Selenium and Cypress test suites, and executing regression tests.

Responsibilities:
- Write clean, maintainable automation code for UI and API tests.
- Integrate automated functional tests into the Jenkins CI/CD pipeline.
- Collaborate with developers to identify and log functional bugs.
- Perform manual regression testing when necessary.

Requirements:
- 5+ years of experience in software test automation.
- Proficient with Java, Selenium WebDriver, and Cucumber.
- Experience with Cypress or Playwright for modern web app testing.
- Strong understanding of functional test design patterns and QA methodologies.
`;

async function runTest() {
  console.log('--- RUNNING HERMES VERIFIER PLAYGROUND TEST ---');
  console.log('Testing: Performance Engineer candidate vs. general QA Automation role...\n');

  try {
    const result = await verifyWithHermes({
      jobTitle: 'FX Automation - QA Engineer',
      jobCompany: 'Barclays',
      jobLocation: 'Pune, India',
      jobDescription: sampleJdQaAutomation,
      resumeText: sampleResumePerformanceEngineer,
      insights: {
        years_experience: 8,
        seniority: 'senior',
        top_skills: ['JMeter', 'Gatling', 'Load Testing', 'JVM Tuning', 'PostgreSQL profiling', 'Java', 'Python'],
        suggested_roles: ['Performance Engineer', 'SRE', 'Backend Engineer'],
      },
    });

    console.log('Verification Result:');
    console.log(JSON.stringify(result, null, 2));

    if (result.action === 'filter') {
      console.log('\n✅ SUCCESS: Hermes correctly identified the sub-specialty mismatch and recommended filtering.');
    } else {
      console.log('\n❌ FAILURE: Hermes kept the job despite the mismatch.');
    }
  } catch (error) {
    console.error('Test run error:', error);
  }
}

runTest();
