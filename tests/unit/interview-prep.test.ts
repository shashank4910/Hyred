import { describe, expect, it } from 'vitest';
import { normalizeInterviewPrep } from '@/lib/interview-prep';

describe('normalizeInterviewPrep', () => {
  it('ensures arrays are present even when the model omits them', () => {
    const result = normalizeInterviewPrep({ quickSummary: 'Summary only' });
    expect(result.likelyQuestions).toEqual([]);
    expect(result.technicalQuestions).toEqual([]);
    expect(result.questionsToAsk).toEqual([]);
  });

  it('trims long arrays to keep the pack focused', () => {
    const result = normalizeInterviewPrep({
      quickSummary: 'Summary',
      likelyQuestions: ['1', '2', '3', '4', '5', '6'],
      technicalQuestions: ['a', 'b', 'c', 'd', 'e', 'f'],
      behavioralQuestions: ['x', 'y', 'z', 'm', 'n', 'o'],
      gapDefenseQuestions: ['g1', 'g2', 'g3', 'g4'],
      starAnswerHints: [
        { question: 'q1', answerHint: 'a1' },
        { question: 'q2', answerHint: 'a2' },
        { question: 'q3', answerHint: 'a3' },
        { question: 'q4', answerHint: 'a4' },
      ],
      questionsToAsk: ['qa1', 'qa2', 'qa3', 'qa4'],
    });

    expect(result.likelyQuestions).toHaveLength(5);
    expect(result.starAnswerHints).toHaveLength(3);
    expect(result.questionsToAsk).toHaveLength(3);
  });
});
