/**
 * Synthetic Resume Generator — generates realistic full resumes across
 * multiple industries and experience levels, then batch-scans them
 * through the ATS checker to identify scoring gaps and biases.
 *
 * Run: npx tsx scripts/synthetic-resume-generator.ts
 */

import { checkAtsCompatibility, AtsCheckResult } from '../lib/ats-checker';
import * as fs from 'fs';
import * as path from 'path';

/* ------------------------------------------------------------------ */
/*  Data pools — randomized for realistic resume content               */
/* ------------------------------------------------------------------ */

const FIRST_NAMES = [
  'James', 'Mary', 'Robert', 'Patricia', 'Michael', 'Jennifer', 'David', 'Linda',
  'William', 'Elizabeth', 'Richard', 'Susan', 'Joseph', 'Jessica', 'Thomas', 'Sarah',
  'Christopher', 'Karen', 'Daniel', 'Nancy', 'Matthew', 'Lisa', 'Anthony', 'Margaret',
  'Mark', 'Betty', 'Donald', 'Sandra', 'Steven', 'Ashley', 'Andrew', 'Kimberly',
  'Paul', 'Donna', 'Joshua', 'Emily', 'Kenneth', 'Carol', 'Kevin', 'Amanda',
  'Brian', 'Stephanie', 'George', 'Melissa', 'Timothy', 'Deborah', 'Ronald', 'Dorothy',
];

const LAST_NAMES = [
  'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis',
  'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson',
  'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin', 'Lee', 'Perez', 'Thompson',
  'White', 'Harris', 'Sanchez', 'Clark', 'Ramirez', 'Lewis', 'Robinson', 'Walker',
  'Young', 'Allen', 'King', 'Wright', 'Scott', 'Torres', 'Hill', 'Green', 'Adams',
];

const CITIES = [
  'San Francisco', 'New York', 'Austin', 'Seattle', 'Boston', 'Chicago', 'Denver',
  'Los Angeles', 'Portland', 'Atlanta', 'Miami', 'Dallas', 'Raleigh', 'Minneapolis',
  'San Diego', 'Pittsburgh', 'Philadelphia', 'Phoenix', 'Houston', 'Washington',
];

const STATES = ['CA', 'NY', 'TX', 'WA', 'MA', 'IL', 'CO', 'CA', 'OR', 'GA', 'FL', 'TX', 'NC', 'MN', 'CA', 'PA', 'PA', 'AZ', 'TX', 'DC'];

const EMAIL_DOMAINS = ['gmail.com', 'outlook.com', 'yahoo.com', 'proton.me', 'icloud.com'];

/* ------------------------------------------------------------------ */
/*  Industry definitions — each has skills, titles, companies, etc.   */
/* ------------------------------------------------------------------ */

interface IndustryDef {
  name: string;
  titles: string[];
  companies: string[];
  technicalSkills: string[];
  softSkills: string[];
  summaryTemplates: string[];
  achievements: string[];
  certs: string[];
}

const INDUSTRIES: IndustryDef[] = [
  {
    name: 'Software Engineering',
    titles: ['Software Engineer', 'Full Stack Developer', 'Backend Engineer', 'Frontend Engineer', 'DevOps Engineer', 'Engineering Manager', 'Senior Software Engineer', 'Staff Engineer', 'Platform Engineer', 'Site Reliability Engineer'],
    companies: ['Google', 'Amazon', 'Microsoft', 'Stripe', 'Meta', 'Uber', 'Airbnb', 'Pinterest', 'Twitter', 'Shopify', 'GitHub', 'Netflix', 'LinkedIn', 'Twilio', 'Datadog'],
    technicalSkills: ['JavaScript', 'TypeScript', 'React', 'Node.js', 'Python', 'Go', 'Rust', 'PostgreSQL', 'MongoDB', 'Redis', 'Docker', 'Kubernetes', 'AWS', 'GCP', 'GraphQL', 'REST API', 'gRPC', 'Microservices', 'CI/CD', 'Terraform', 'Jest', 'Cypress', 'Next.js', 'Express', 'Kafka', 'Postgres', 'SQL', 'Git', 'Linux'],
    softSkills: ['Communication', 'Leadership', 'Problem Solving', 'Mentoring', 'Cross-functional Collaboration', 'Technical Writing', 'Code Review'],
    summaryTemplates: [
      'Experienced software engineer with {Y} years of experience building scalable distributed systems. Passionate about clean architecture, developer experience, and delivering impact.',
      'Full-stack engineer with a track record of delivering high-quality products from concept to launch. Skilled in {SKILLS}.',
      'Senior engineer specializing in backend systems and cloud infrastructure. Led multiple 0-to-1 initiatives serving {SCALE}+ users.',
    ],
    achievements: [
      'Led migration of {LEGACY} to {MODERN}, reducing latency by {PCT}% and infrastructure costs by ${AMT}K annually',
      'Designed and built a real-time data pipeline processing {SCALE} events/day using {TECH}',
      'Implemented CI/CD pipeline reducing deployment time from {OLD} hours to {NEW} minutes',
      'Optimized database queries resulting in {PCT}% improvement in API response times',
      'Built monitoring dashboard tracking {SCALE}+ metrics across {COUNT} microservices',
      'Mentored {COUNT} junior engineers through structured onboarding program',
      'Reduced p99 latency from {OLD}ms to {NEW}ms through caching and query optimization',
      'Architected event-driven system handling {SCALE} concurrent users',
      'Automated infrastructure provisioning reducing new service setup from {OLD} weeks to {NEW} days',
      'Led squad of {COUNT} engineers delivering {PROJECT} in {MONTHS} months',
    ],
    certs: ['AWS Solutions Architect', 'AWS Developer Associate', 'Google Cloud Professional Architect', 'Kubernetes CKA', 'Terraform Associate', 'HashiCorp Vault Associate'],
  },
  {
    name: 'Data Science',
    titles: ['Data Scientist', 'Machine Learning Engineer', 'Data Analyst', 'ML Ops Engineer', 'AI Engineer', 'Research Scientist', 'Senior Data Scientist', 'Analytics Lead', 'Data Science Manager', 'NLP Engineer'],
    companies: ['Spotify', 'Netflix', 'Airbnb', 'Uber', 'Stripe', 'Pinterest', 'HubSpot', 'Zoom', 'Snowflake', 'Databricks', 'Palantir', 'Coursera', 'Duolingo', 'PagerDuty', 'Asana'],
    technicalSkills: ['Python', 'TensorFlow', 'PyTorch', 'scikit-learn', 'Pandas', 'NumPy', 'SQL', 'Spark', 'Airflow', 'MLflow', 'Docker', 'PostgreSQL', 'BigQuery', 'Jupyter', 'Statistics', 'A/B Testing', 'NLP', 'Computer Vision', 'LLM', 'LangChain', 'R', 'Tableau'],
    softSkills: ['Analytical Thinking', 'Statistical Reasoning', 'Storytelling with Data', 'Cross-functional Communication', 'Problem Formulation', 'Experimental Design'],
    summaryTemplates: [
      'Data scientist with {Y} years of experience building ML models that drive business impact. Proficient in {SKILLS}.',
      'Machine learning engineer focused on productionizing models at scale. Built systems serving {SCALE}+ predictions daily.',
      'Analytics leader with expertise in experimental design and causal inference. Track record of translating data insights into product strategy.',
    ],
    achievements: [
      'Built ML model achieving {PCT}% accuracy that saved ${AMT}K/month in fraud losses',
      'Designed A/B testing framework used by {COUNT} product teams across the organization',
      'Increased model inference speed by {PCT}% through quantization and pruning techniques',
      'Developed recommendation system that improved user engagement by {PCT}%',
      'Created automated anomaly detection pipeline monitoring {SCALE}+ metrics in real-time',
      'Reduced feature engineering time by {PCT}% through automated feature store',
      'Built NLP pipeline processing {SCALE} documents/day for information extraction',
      'Implemented ML Ops infrastructure reducing model deployment from {OLD} weeks to {NEW} hours',
      'Led data science team of {COUNT} delivering insights that drove ${AMT}M in revenue',
      'Developed customer churn prediction model with {PCT}% precision, reducing churn by {PCT}%',
    ],
    certs: ['TensorFlow Developer Certificate', 'AWS ML Specialty', 'Google Cloud ML Engineer', 'Databricks ML Practitioner', 'Deep Learning Specialization'],
  },
  {
    name: 'Product Management',
    titles: ['Product Manager', 'Senior Product Manager', 'Product Lead', 'Director of Product', 'Product Owner', 'Associate Product Manager', 'Group Product Manager', 'Product Manager II', 'Technical Product Manager', 'Growth Product Manager'],
    companies: ['Google', 'Meta', 'Amazon', 'Apple', 'Slack', 'Notion', 'Figma', 'Canva', 'Zoom', 'Loom', 'Airtable', 'Linear', 'Vercel', 'Supabase', 'Railway'],
    technicalSkills: ['Product Strategy', 'Roadmapping', 'A/B Testing', 'Data Analysis', 'User Research', 'Wireframing', 'SQL', 'JIRA', 'Confluence', 'Figma', 'Product Analytics', 'OKR Planning', 'Stakeholder Management', 'Agile Methodologies'],
    softSkills: ['Strategic Thinking', 'User Empathy', 'Cross-functional Leadership', 'Communication', 'Negotiation', 'Storytelling', 'Prioritization'],
    summaryTemplates: [
      'Product manager with {Y} years of experience delivering impactful features across the full product lifecycle. Skilled in {SKILLS}.',
      'Results-driven PM who bridges engineering, design, and business to ship products users love.',
      'Senior product leader with a track record of growing products from $0 to ${AMT}M ARR and leading cross-functional teams of {COUNT}+.',
    ],
    achievements: [
      'Led product initiative that grew monthly active users by {PCT}% to {SCALE}+',
      'Shipped {COUNT} major features across {MONTHS} quarters, driving ${AMT}M in incremental revenue',
      'Developed product strategy that increased conversion rate by {PCT}%',
      'Led cross-functional team of {COUNT} engineers, designers, and data scientists',
      'Reduced time-to-market for new features from {OLD} weeks to {NEW} weeks through process improvements',
      'Defined and tracked OKRs for {COUNT} product teams, achieving {PCT}% on key metrics',
      'Conducted {SCALE}+ user research sessions informing product direction',
      'Launched in {COUNT} new markets through strategic partnerships',
      'Improved NPS score by {PCT} points through UX improvements',
      'Built product analytics framework adopted by {COUNT} teams across the org',
    ],
    certs: ['CSPO Certification', 'Pragmatic Institute Certified', 'SAFe Product Owner', 'Google Project Management Certificate'],
  },
  {
    name: 'Design',
    titles: ['Product Designer', 'UX Designer', 'UI Designer', 'Senior Designer', 'Design Lead', 'Principal Designer', 'UX Researcher', 'Interaction Designer', 'Visual Designer', 'Design Manager'],
    companies: ['Figma', 'Airbnb', 'Apple', 'Netflix', 'Spotify', 'Duolingo', 'Headspace', 'Notion', 'Linear', 'Stripe', 'Pinterest', 'Etsy', 'Discord', 'Reddit', 'Shopify'],
    technicalSkills: ['Figma', 'Sketch', 'Adobe Creative Suite', 'Prototyping', 'User Research', 'Design Systems', 'Wireframing', 'Information Architecture', 'Interaction Design', 'Responsive Design', 'Design Tokens', 'Framer', 'Principle'],
    softSkills: ['Visual Storytelling', 'User Empathy', 'Collaboration', 'Design Critique', 'Presentation Skills', 'Creative Problem Solving'],
    summaryTemplates: [
      'Product designer with {Y} years of experience crafting intuitive, accessible digital experiences. Proficient in {SKILLS}.',
      'Designer passionate about design systems and creating cohesive user experiences across platforms.',
      'Senior design lead who has shipped products used by millions, with expertise in end-to-end product design.',
    ],
    achievements: [
      'Designed and shipped design system used by {COUNT} product teams across {SCALE}+ components',
      'Redesigned core user flow increasing task completion rate by {PCT}%',
      'Led user research with {SCALE}+ participants informing product strategy',
      'Improved accessibility score from {OLD}/100 to {NEW}/100 achieving WCAG 2.1 AA compliance',
      'Reduced design-to-dev handoff time by {PCT}% through improved documentation and design specs',
      'Created interactive prototypes tested with {SCALE} users, iterating based on feedback',
      'Established design review process adopted by {COUNT} product teams',
      'Increased trial-to-paid conversion by {PCT}% through redesigned onboarding flow',
      'Collaborated with engineering to implement design token system',
      'Mentored {COUNT} junior designers through structured growth program',
    ],
    certs: ['Google UX Design Certificate', 'NN/g UX Certification', 'Interaction Design Foundation'],
  },
  {
    name: 'Marketing',
    titles: ['Marketing Manager', 'Growth Marketing Manager', 'Digital Marketing Specialist', 'Content Marketing Manager', 'SEO Specialist', 'Marketing Director', 'Brand Manager', 'Demand Gen Manager', 'Marketing Analyst', 'Product Marketing Manager'],
    companies: ['HubSpot', 'Mailchimp', 'Salesforce', 'Adobe', 'Shopify', 'WordPress', 'Wix', 'Canva', 'WeWork', 'Uber', 'Lyft', 'Instacart', 'Doordash', 'Yelp', 'Zillow'],
    technicalSkills: ['SEO', 'SEM', 'Google Analytics', 'Content Strategy', 'Email Marketing', 'Social Media Marketing', 'Marketing Automation', 'CRM', 'A/B Testing', 'Data Analysis', 'HubSpot', 'Salesforce', 'Google Ads', 'Meta Ads', 'Looker'],
    softSkills: ['Creativity', 'Strategic Planning', 'Communication', 'Storytelling', 'Campaign Management', 'Brand Strategy'],
    summaryTemplates: [
      'Marketing professional with {Y} years of experience driving growth through data-driven campaigns. Skilled in {SKILLS}.',
      'Growth marketer specializing in acquisition and retention strategies that deliver measurable ROI.',
      'Senior marketing leader who has built and scaled marketing programs generating ${AMT}M in pipeline annually.',
    ],
    achievements: [
      'Developed content strategy that increased organic traffic by {PCT}% to {SCALE}+ monthly visitors',
      'Launched email campaign with {PCT}% open rate driving ${AMT}K in attributed revenue',
      'Optimized paid acquisition reducing CPA by {PCT}% while maintaining volume',
      'Built marketing automation workflows nurturing {SCALE}+ leads through pipeline',
      'Led SEO overhaul improving domain authority from {OLD} to {NEW} and rankings for {COUNT} keywords',
      'Managed ${AMT}M marketing budget across {COUNT} channels with {PCT}% ROAS',
      'Increased social media following from {SCALE} to {SCALE2} across platforms',
      'Reduced customer acquisition cost by {PCT}% through channel mix optimization',
      'Launched {COUNT} successful product marketing campaigns',
      'Built attribution model tracking {SCALE}+ touchpoints across buyer journey',
    ],
    certs: ['Google Analytics Certification', 'HubSpot Inbound Marketing', 'Meta Certified Digital Marketing Associate', 'Google Ads Certification'],
  },
  {
    name: 'Finance',
    titles: ['Financial Analyst', 'Investment Banker', 'Portfolio Manager', 'Risk Analyst', 'Quantitative Analyst', 'Financial Manager', 'Accountant', 'Auditor', 'Financial Controller', 'FP&A Manager'],
    companies: ['Goldman Sachs', 'JPMorgan', 'Morgan Stanley', 'BlackRock', 'Vanguard', 'Fidelity', 'Citadel', 'Two Sigma', 'Bridgewater', 'KPMG', 'Deloitte', 'PwC', 'EY', 'Bloomberg', 'S&P Global'],
    technicalSkills: ['Financial Modeling', 'Excel', 'VBA', 'SQL', 'Python', 'Bloomberg Terminal', 'Risk Management', 'Valuation', 'Financial Analysis', 'GAAP', 'IFRS', 'QuickBooks', 'SAP', 'Tableau'],
    softSkills: ['Analytical Rigor', 'Attention to Detail', 'Client Management', 'Presentation', 'Negotiation', 'Regulatory Compliance'],
    summaryTemplates: [
      'Finance professional with {Y} years of experience in financial modeling, valuation, and strategic analysis. Proficient in {SKILLS}.',
      'Quantitative analyst with expertise in risk models and algorithmic trading strategies.',
      'Senior financial manager who has overseen ${AMT}B in assets and led teams of {COUNT}+ analysts.',
    ],
    achievements: [
      'Built financial model projecting ${AMT}M revenue with {PCT}% accuracy over {COUNT} quarters',
      'Reduced operational costs by ${AMT}M ({PCT}%) through process optimization and automation',
      'Managed portfolio of ${AMT}M achieving {PCT}% returns above benchmark',
      'Led due diligence on {COUNT} acquisitions totaling ${AMT}M in enterprise value',
      'Developed risk assessment framework reducing exposure by {PCT}%',
      'Automated financial reporting reducing close time from {OLD} days to {NEW} days',
      'Prepared quarterly earnings reports presented to executive team and board',
      'Led team of {COUNT} analysts in annual budgeting and forecasting process',
      'Identified tax savings of ${AMT}K through strategic restructuring',
      'Implemented new ERP system improving financial data accuracy by {PCT}%',
    ],
    certs: ['CFA Charterholder', 'CPA', 'FRM', 'CAIA', 'Series 7', 'Series 63'],
  },
];

/* ------------------------------------------------------------------ */
/*  Experience level ranges                                             */
/* ------------------------------------------------------------------ */

const EXP_LEVELS = [
  { label: 'Entry', years: 2, bulletCount: 3, detailLevel: 'basic' as const, numJobs: 1 },
  { label: 'Mid', years: 5, bulletCount: 4, detailLevel: 'moderate' as const, numJobs: 2 },
  { label: 'Senior', years: 9, bulletCount: 6, detailLevel: 'detailed' as const, numJobs: 3 },
  { label: 'Lead', years: 14, bulletCount: 7, detailLevel: 'detailed' as const, numJobs: 4 },
];

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function pickN<T>(arr: T[], n: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(n, arr.length));
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function fmtScaled(n: number): string {
  if (n >= 1000) return '1M+';
  if (n >= 100) return '500+';
  return String(n);
}

function fmtAmtK(n: number): string {
  if (n >= 1000) return '5';
  if (n >= 500) return '3';
  if (n >= 100) return '1.5';
  return '0.5';
}

/* ------------------------------------------------------------------ */
/*  Resume generation                                                   */
/* ------------------------------------------------------------------ */

interface GeneratedResume {
  category: string;
  expLevel: string;
  text: string;
  meta: {
    industry: string;
    title: string;
    yearsExp: number;
    wordCount: number;
    hasBullets: boolean;
    hasQuantified: boolean;
    hasDates: boolean;
  };
}

function generateResume(industry: IndustryDef, expIdx: number, formatVariant: string): GeneratedResume {
  const exp = EXP_LEVELS[expIdx];
  const firstName = pick(FIRST_NAMES);
  const lastName = pick(LAST_NAMES);
  const cityIdx = randInt(0, CITIES.length - 1);
  const city = CITIES[cityIdx];
  const state = STATES[cityIdx];
  const email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}${randInt(1, 99)}@${pick(EMAIL_DOMAINS)}`;
  const phone = `(${randInt(200, 999)}) ${randInt(200, 999)}-${randInt(1000, 9999)}`;
  const linkedIn = `linkedin.com/in/${firstName.toLowerCase()}-${lastName.toLowerCase()}`;

  const title = pick(industry.titles);
  const summary = pick(industry.summaryTemplates)
    .replace('{Y}', String(exp.years))
    .replace('{SKILLS}', pickN(industry.technicalSkills, 3).join(', '))
    .replace('{SCALE}', fmtScaled(randInt(100, 5000)))
    .replace('{AMT}', fmtAmtK(randInt(100, 5000)))
    .replace('{COUNT}', String(randInt(3, 20)));

  const skills = pickN(industry.technicalSkills, randInt(8, 18)).join(', ');
  const softSkills = pickN(industry.softSkills, randInt(3, 5)).join(', ');

  // Experience generation
  const experiences: string[] = [];
  const currentYear = 2026;
  let expYearCounter = currentYear;

  for (let j = 0; j < exp.numJobs; j++) {
    const company = pick(industry.companies);
    const jobTitle = j === 0 ? title : pick(industry.titles);
    const isCurrent = j === 0;
    const startYear = expYearCounter - randInt(1, 3);
    const endYear = isCurrent ? 'Present' : expYearCounter - 1;
    const startMonth = pick(['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']);

    const bullets: string[] = [];
    for (let b = 0; b < exp.bulletCount; b++) {
      let ach = pick(industry.achievements)
        .replace('{LEGACY}', pick(['monolithic app', 'legacy system', 'manual process', 'monolith', 'on-prem infrastructure']))
        .replace('{MODERN}', pick(['microservices', 'cloud-native solution', 'automated pipeline', 'event-driven architecture', 'serverless platform']))
        .replace('{PCT}', String(randInt(20, 80)))
        .replace('{AMT}', fmtAmtK(randInt(100, 5000)))
        .replace('{SCALE}', fmtScaled(randInt(100, 10000)))
        .replace('{SCALE2}', fmtScaled(randInt(1000, 50000)))
        .replace('{TECH}', pick(industry.technicalSkills))
        .replace('{OLD}', String(randInt(2, 12)))
        .replace('{NEW}', String(randInt(1, 3)))
        .replace('{COUNT}', String(randInt(2, 15)))
        .replace('{MONTHS}', String(randInt(3, 12)))
        .replace('{PROJECT}', pick(['platform migration', 'new product launch', 'analytics dashboard', 'feature rollout', 'infrastructure upgrade']));
      bullets.push(bulletFormat(ach, formatVariant));
    }

    const expBlock = [
      `${jobTitle} | ${company}`,
      `${startMonth} ${startYear} – ${endYear}`,
      ...bullets,
    ].join('\n');

    experiences.push(expBlock);
    expYearCounter = startYear - 1;
  }

  // Education
  const degrees = ['Bachelor of Science', 'Bachelor of Arts', 'Master of Science', 'Master of Business Administration', 'Master of Arts'];
  const majors = ['Computer Science', 'Data Science', 'Business Administration', 'Marketing', 'Finance', 'Information Systems', 'Design', 'Economics', 'Mathematics', 'Statistics'];
  const universities = ['Stanford University', 'MIT', 'UC Berkeley', 'University of Michigan', 'University of Texas', 'Georgia Tech', 'Cornell University', 'University of Washington', 'Carnegie Mellon', 'University of Illinois', 'UCLA', 'NYU', 'University of Chicago', 'Northwestern University', 'Purdue University'];
  const education = [
    `Education`,
    `${pick(degrees)} in ${pick(majors)}`,
    `${pick(universities)} | ${randInt(2010, 2022)}`,
  ].join('\n');

  // Certifications
  const certCount = randInt(0, 2);
  let certBlock = '';
  if (certCount > 0) {
    certBlock = '\n\nCertifications\n' + pickN(industry.certs, certCount).map(c => `- ${c}`).join('\n');
  }

  // Assemble resume
  const sections: string[] = [
    `${firstName} ${lastName}`,
    `${city}, ${state} | ${email} | ${phone}`,
    linkedIn ? linkedIn : '',
    '',
    'Professional Summary',
    summary,
    '',
    'Professional Experience',
    experiences.join('\n\n'),
    '',
    education,
    '',
    `Technical Skills\n${skills}`,
    `\nSoft Skills\n${softSkills}`,
    certBlock,
  ];

  const text = sections.join('\n');

  return {
    category: industry.name,
    expLevel: exp.label,
    text,
    meta: {
      industry: industry.name,
      title,
      yearsExp: exp.years,
      wordCount: text.split(/\s+/).filter(Boolean).length,
      hasBullets: text.includes('- ') || text.includes('•'),
      hasQuantified: /%|\$\d/.test(text),
      hasDates: /\b(19|20)\d{2}\b/.test(text),
    },
  };
}

function bulletFormat(text: string, format: string): string {
  switch (format) {
    case 'dash':
      return `  - ${text}`;
    case 'unicode':
      return `  • ${text}`;
    case 'paragraph':
      return `  ${text}.`;
    default:
      return `  - ${text}`;
  }
}

/* ------------------------------------------------------------------ */
/*  Main — generate, score, analyze                                    */
/* ------------------------------------------------------------------ */

interface BatchResult {
  resume: GeneratedResume;
  result: AtsCheckResult;
}

function analyzeResults(results: BatchResult[]): void {
  const total = results.length;
  const scores = results.map(r => r.result.overallScore);
  const avg = scores.reduce((a, b) => a + b, 0) / total;
  const sorted = [...scores].sort((a, b) => a - b);
  const median = sorted[Math.floor(total / 2)];
  const min = sorted[0];
  const max = sorted[total - 1];

  console.log('\n========== OVERALL SCORING STATISTICS ==========');
  console.log(`Total resumes generated: ${total}`);
  console.log(`Average score: ${avg.toFixed(1)}`);
  console.log(`Median score: ${median}`);
  console.log(`Range: ${min} – ${max}`);
  console.log('');

  // Score distribution
  const buckets = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
  const dist = new Array(buckets.length - 1).fill(0);
  for (const s of scores) {
    for (let i = 0; i < buckets.length - 1; i++) {
      if (s >= buckets[i] && s < buckets[i + 1]) {
        dist[i]++;
        break;
      }
      if (s === 100) dist[dist.length - 1]++;
    }
  }
  console.log('Score Distribution:');
  for (let i = 0; i < buckets.length - 1; i++) {
    const pct = (dist[i] / total * 100).toFixed(1);
    const bar = '█'.repeat(Math.round(dist[i] / total * 100));
    console.log(`  ${buckets[i]}-${buckets[i + 1]}: ${dist[i]} (${pct}%) ${bar}`);
  }
  console.log('');

  // By industry
  console.log('By Industry:');
  const byIndustry = new Map<string, number[]>();
  for (const r of results) {
    const ind = r.resume.meta.industry;
    if (!byIndustry.has(ind)) byIndustry.set(ind, []);
    byIndustry.get(ind)!.push(r.result.overallScore);
  }
  for (const [ind, scs] of byIndustry) {
    const avgInd = scs.reduce((sum, b) => sum + b, 0) / scs.length;
    console.log(`  ${ind.padEnd(25)}: avg ${avgInd.toFixed(1).padStart(5)}  range [${Math.min(...scs)}-${Math.max(...scs)}]  n=${scs.length}`);
  }
  console.log('');

  // By experience level
  console.log('By Experience Level:');
  const byExp = new Map<string, number[]>();
  for (const r of results) {
    const lvl = r.resume.expLevel;
    if (!lvl) continue;
    if (!byExp.has(lvl)) byExp.set(lvl, []);
    byExp.get(lvl)!.push(r.result.overallScore);
  }
  for (const [lv, scs] of byExp) {
    if (lv === undefined) continue;
    const avgExp = scs.reduce((sum, b) => sum + b, 0) / scs.length;
    console.log(`  ${lv.padEnd(10)}: avg ${avgExp.toFixed(1).padStart(5)}  range [${Math.min(...scs)}-${Math.max(...scs)}]  n=${scs.length}`);
  }
  console.log('');

  // Criterion-level analysis
  const criteriaKeys: (keyof AtsCheckResult['breakdown'])[] = [
    'sectionStructure', 'contactInfo', 'bulletQuality', 'quantifiableAchievements',
    'skillsOptimization', 'lengthReadability', 'formatCleanliness', 'dateConsistency',
  ];
  const criterionNames: Record<string, string> = {
    sectionStructure: 'Section Structure',
    contactInfo: 'Contact Info',
    bulletQuality: 'Bullet Quality',
    quantifiableAchievements: 'Quantified Achievements',
    skillsOptimization: 'Skills Optimization',
    lengthReadability: 'Length & Readability',
    formatCleanliness: 'Format Cleanliness',
    dateConsistency: 'Date Consistency',
  };

  console.log('Criterion-Level Averages:');
  for (const key of criteriaKeys) {
    const vals = results.map(r => r.result.breakdown[key].score);
    const avgCrit = vals.reduce((sum, b) => sum + b, 0) / vals.length;
    const lowPct = (vals.filter(v => v < 50).length / total * 100).toFixed(1);
    console.log(`  ${(criterionNames[key] || key).padEnd(25)}: avg ${avgCrit.toFixed(1).padStart(5)}  |  ${lowPct}% scoring < 50`);
  }
  console.log('');

  // Top & bottom outliers
  const byScore = [...results].sort((a, b) => a.result.overallScore - b.result.overallScore);
  console.log('--- LOWEST SCORERS (possible gaps) ---');
  for (const r of byScore.slice(0, 5)) {
    console.log(`  Score ${r.result.overallScore} | ${r.resume.meta.industry.padEnd(20)} | ${r.resume.expLevel.padEnd(8)} | ${r.resume.meta.title}`);
  }
  console.log('');
  console.log('--- HIGHEST SCORERS (validation) ---');
  for (const r of byScore.slice(-5).reverse()) {
    console.log(`  Score ${r.result.overallScore} | ${r.resume.meta.industry.padEnd(20)} | ${r.resume.expLevel.padEnd(8)} | ${r.resume.meta.title}`);
  }
  console.log('');

  // Cross-reference word count vs score
  console.log('Word Count vs Score (buckets):');
  const wcBuckets = [0, 200, 400, 600, 800, 1000, 1200, 1500, 2000];
  for (let i = 0; i < wcBuckets.length - 1; i++) {
    const inRange = results.filter(r => r.resume.meta.wordCount >= wcBuckets[i] && r.resume.meta.wordCount < wcBuckets[i + 1]);
    if (inRange.length === 0) continue;
    const a = inRange.reduce((s, r) => s + r.result.overallScore, 0) / inRange.length;
    console.log(`  ${wcBuckets[i]}-${wcBuckets[i + 1]} words (n=${inRange.length}): avg ${a.toFixed(1)}`);
  }
}

/* ------------------------------------------------------------------ */
/*  Run                                                               */
/* ------------------------------------------------------------------ */

const RESULTS_DIR = path.join(__dirname, '..', 'synthetic-results');

async function main() {
  console.log('=== Synthetic Resume Generator & ATS Validator ===\n');
  console.log('Generating 1000+ realistic full resumes...\n');

  // Ensure output dir
  if (!fs.existsSync(RESULTS_DIR)) fs.mkdirSync(RESULTS_DIR, { recursive: true });

  const allResults: BatchResult[] = [];
  const formats = ['dash', 'unicode', 'paragraph'];
  const totalPerIndustry = 50; // 6 industries * 50 = 300 base, plus variations

  // Generate 1200 resumes: 6 industries * 4 exp levels * 50 variations
  let generated = 0;
  for (let i = 0; i < 50; i++) {
    for (let ei = 0; ei < 4; ei++) { // 4 exp levels
      for (const industry of INDUSTRIES) {
        const fmt = pick(formats);
        const resume = generateResume(industry, ei, fmt);
        const result = checkAtsCompatibility(resume.text, `synthetic-${generated}.txt`);

        // Vary some resumes with format/quality tweaks
        allResults.push({ resume, result });
        generated++;
      }
    }
  }

  console.log(`Generated ${generated} resumes.\n`);
  console.log('Scoring complete. Analyzing results...\n');

  // Save raw results
  const resultsPath = path.join(RESULTS_DIR, 'synthetic-scores.json');
  const summaryData = allResults.map(r => ({
    score: r.result.overallScore,
    breakdown: Object.fromEntries(
      Object.entries(r.result.breakdown).map(([k, v]) => [k, { score: v.score, feedback: v.feedback }])
    ),
    industry: r.resume.meta.industry,
    expLevel: r.resume.expLevel,
    title: r.resume.meta.title,
    wordCount: r.resume.meta.wordCount,
    hasBullets: r.resume.meta.hasBullets,
    hasQuantified: r.resume.meta.hasQuantified,
    hasDates: r.resume.meta.hasDates,
  }));
  fs.writeFileSync(resultsPath, JSON.stringify(summaryData, null, 2));
  console.log(`Results saved to: ${resultsPath}\n`);

  // Analyze
  analyzeResults(allResults);

  // Save a few sample resumes for manual inspection
  const samplesDir = path.join(RESULTS_DIR, 'samples');
  if (!fs.existsSync(samplesDir)) fs.mkdirSync(samplesDir, { recursive: true });
  
  const diverse = [...allResults].sort((a, b) => Math.random() - 0.5).slice(0, 10);
  for (const r of diverse) {
    const safeName = `${r.resume.meta.industry.replace(/\s+/g, '-')}_${r.resume.expLevel}_score${r.result.overallScore}`;
    fs.writeFileSync(path.join(samplesDir, `${safeName}.txt`), r.resume.text);
  }
  console.log(`10 sample resumes saved to: ${samplesDir}/`);
  console.log('\n=== Generation & Analysis Complete ===');
}

main().catch(console.error);
