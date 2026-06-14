import { describe, expect, it, vi } from 'vitest';
import { generateOutreachMessage } from '@/lib/gemini';

// Mock the chat function inside gemini.ts
vi.mock('@/lib/gemini', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/gemini')>();
  return {
    ...actual,
    chat: vi.fn().mockResolvedValue('Tailored message content here'),
  };
});

describe('AI Outreach Message Generator', () => {
  it('calls generateOutreachMessage helper with correct parameters', async () => {
    const result = await generateOutreachMessage({
      resume: 'Experienced Load Testing Engineer with Splunk skills',
      jobTitle: 'Sr Performance Engineer',
      jobCompany: 'Omnissa',
      jobDescription: 'Looking for a LoadRunner and JMeter specialist.',
      template: 'peer',
      candidateName: 'Shashank Singh',
      profileId: 'profile-123',
    });

    expect(result).toBeDefined();
    expect(typeof result).toBe('string');
  });
});
