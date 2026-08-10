import type { Difficulty, TopicId } from './types';

export interface TopicMeta {
  id: TopicId;
  title: string;
  minLevel: Difficulty;
  blurb: string;
}

export const TOPICS: TopicMeta[] = [
  {
    id: 'fundamentals',
    title: 'Performance testing fundamentals',
    minLevel: 1,
    blurb: 'What perf testing is, why it matters, vs functional testing',
  },
  {
    id: 'metrics',
    title: 'Core metrics',
    minLevel: 1,
    blurb: 'Latency, throughput, error rate, percentiles, Apdex',
  },
  {
    id: 'load_types',
    title: 'Load types & test kinds',
    minLevel: 2,
    blurb: 'Smoke, load, stress, spike, soak, breakpoint',
  },
  {
    id: 'tools',
    title: 'Tools & scripting',
    minLevel: 2,
    blurb: 'JMeter, k6, Gatling, Locust, Locust/k6 patterns',
  },
  {
    id: 'test_design',
    title: 'Test design & workload modeling',
    minLevel: 3,
    blurb: 'User journeys, think time, pacing, data, environments',
  },
  {
    id: 'bottlenecks',
    title: 'Finding bottlenecks',
    minLevel: 4,
    blurb: 'CPU, memory, I/O, locks, GC, network, saturation',
  },
  {
    id: 'profiling',
    title: 'Profiling & observability',
    minLevel: 5,
    blurb: 'APM, traces, flame graphs, logs, correlating metrics',
  },
  {
    id: 'databases',
    title: 'Database performance',
    minLevel: 5,
    blurb: 'Indexes, N+1, connection pools, locks, slow queries',
  },
  {
    id: 'caching',
    title: 'Caching & CDNs',
    minLevel: 5,
    blurb: 'Cache hit ratio, TTLs, stampede, Redis patterns',
  },
  {
    id: 'apis_protocols',
    title: 'APIs & protocols',
    minLevel: 4,
    blurb: 'HTTP/1.1 vs 2 vs 3, keep-alive, gRPC, WebSockets',
  },
  {
    id: 'cloud_scale',
    title: 'Cloud & horizontal scale',
    minLevel: 6,
    blurb: 'Autoscaling, queues, backpressure, multi-region',
  },
  {
    id: 'sre_slo',
    title: 'SLIs / SLOs / error budgets',
    minLevel: 6,
    blurb: 'Defining good targets and capacity planning',
  },
  {
    id: 'chaos_resilience',
    title: 'Resilience & chaos',
    minLevel: 7,
    blurb: 'Timeouts, retries, circuit breakers, failure injection',
  },
  {
    id: 'interview_scenarios',
    title: 'Interview / real-world scenarios',
    minLevel: 3,
    blurb: 'Whiteboard cases: diagnose a slow checkout, plan a sale-day test',
  },
];

export function levelLabel(level: Difficulty): string {
  if (level <= 2) return 'Beginner';
  if (level <= 4) return 'Junior';
  if (level <= 6) return 'Mid';
  if (level <= 8) return 'Senior';
  return 'Expert / Architect';
}

export function topicsForLevel(level: Difficulty): TopicMeta[] {
  const eligible = TOPICS.filter((t) => t.minLevel <= level);
  const near = eligible.filter((t) => level - t.minLevel <= 3);
  return near.length > 0 ? near : eligible;
}

export function pickTopic(
  level: Difficulty,
  topicsSeen: TopicId[],
  weaknesses: string[],
): TopicMeta {
  const pool = topicsForLevel(level);
  const weakHint = weaknesses.join(' ').toLowerCase();

  const weakMatch = pool.find(
    (t) =>
      weakHint.includes(t.id.replace(/_/g, ' ')) ||
      weakHint.includes(t.title.toLowerCase().slice(0, 12)),
  );
  if (weakMatch && Math.random() < 0.45) return weakMatch;

  const unseen = pool.filter((t) => !topicsSeen.includes(t.id));
  if (unseen.length > 0) {
    return unseen[Math.floor(Math.random() * unseen.length)]!;
  }
  return pool[Math.floor(Math.random() * pool.length)]!;
}
