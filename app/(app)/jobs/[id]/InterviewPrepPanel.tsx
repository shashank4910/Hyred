'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ClipboardList, Loader2, RotateCw, Sparkles, Copy } from 'lucide-react';
import type { InterviewPrepPack } from '@/lib/types';

function PrepSection({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <p className="text-xs font-medium text-on-surface mb-1.5">{title}</p>
      <ul className="space-y-1">
        {items.map((item, i) => (
          <li key={i} className="text-sm text-on-surface-variant flex gap-2">
            <span className="text-primary mt-0.5 shrink-0">›</span> {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function InterviewPrepPanel({ matchId }: { matchId: string }) {
  const [loading, setLoading] = useState(false);
  const [prepPack, setPrepPack] = useState<InterviewPrepPack | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/match/${matchId}/prep`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        setPrepPack(d.result ?? null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [matchId]);

  async function generate() {
    setLoading(true);
    const tid = toast.loading('Building interview prep...');
    try {
      const res = await fetch(`/api/match/${matchId}/prep`, { method: 'POST' });
      const data = await res.json();
      if (res.status === 402) {
        toast.error('Premium upgrade required to generate Interview Prep Pack.', { id: tid });
        return;
      }
      if (!res.ok) throw new Error(data.error || 'Could not generate prep');
      setPrepPack(data.result);
      toast.success('Interview Prep Pack ready', { id: tid });
    } catch (e) {
      toast.error((e as Error).message, { id: tid });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-semibold text-on-surface flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-primary" /> Interview Prep Pack
          </h2>
          <p className="text-xs text-on-surface-variant mt-0.5">
            Likely questions, gap defense, and talking points for this job.
          </p>
        </div>
        <button onClick={generate} disabled={loading} className="btn-primary">
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : prepPack ? (
            <RotateCw className="h-3.5 w-3.5" />
          ) : (
            <Sparkles className="h-3.5 w-3.5" />
          )}
          {loading ? 'Building…' : prepPack ? 'Refresh' : 'Generate prep pack'}
        </button>
      </div>

      {prepPack ? (
        <div className="mt-4 space-y-4">
          {prepPack.quickSummary && (
            <p className="text-sm text-on-surface-variant rounded-lg bg-surface-container-low border border-outline-variant p-3">
              {prepPack.quickSummary}
            </p>
          )}

          {prepPack.likelyQuestions.length > 0 && (
            <PrepSection title="Likely interview questions" items={prepPack.likelyQuestions} />
          )}
          {prepPack.technicalQuestions.length > 0 && (
            <PrepSection title="Technical questions" items={prepPack.technicalQuestions} />
          )}
          {prepPack.behavioralQuestions.length > 0 && (
            <PrepSection title="Behavioral questions" items={prepPack.behavioralQuestions} />
          )}
          {prepPack.gapDefenseQuestions.length > 0 && (
            <PrepSection title="Gap defense" items={prepPack.gapDefenseQuestions} />
          )}
          {prepPack.starAnswerHints.length > 0 && (
            <div>
              <p className="text-xs font-medium text-on-surface mb-2">STAR answer hints</p>
              <div className="space-y-2">
                {prepPack.starAnswerHints.map((h, i) => (
                  <div
                    key={i}
                    className="rounded-lg bg-surface-container-low border border-outline-variant p-3"
                  >
                    <p className="text-xs font-medium text-on-surface mb-1">Q: {h.question}</p>
                    <p className="text-xs text-on-surface-variant">{h.answerHint}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
          {prepPack.questionsToAsk.length > 0 && (
            <PrepSection title="Questions to ask the interviewer" items={prepPack.questionsToAsk} />
          )}

          <button
            onClick={async () => {
              const text = [
                prepPack.quickSummary,
                '\n\nLikely questions:\n' + prepPack.likelyQuestions.map((q) => `• ${q}`).join('\n'),
                '\n\nTechnical:\n' + prepPack.technicalQuestions.map((q) => `• ${q}`).join('\n'),
                '\n\nBehavioral:\n' + prepPack.behavioralQuestions.map((q) => `• ${q}`).join('\n'),
                '\n\nGap defense:\n' + prepPack.gapDefenseQuestions.map((q) => `• ${q}`).join('\n'),
                '\n\nQuestions to ask:\n' + prepPack.questionsToAsk.map((q) => `• ${q}`).join('\n'),
              ].join('\n');
              await navigator.clipboard.writeText(text);
              toast.success('Prep pack copied to clipboard');
            }}
            className="btn text-xs w-full"
          >
            <Copy className="h-3 w-3" /> Copy all to clipboard
          </button>
        </div>
      ) : (
        !loading && (
          <p className="mt-3 text-sm text-on-surface-variant">
            Generate a personalized prep pack with questions tailored to your skills and this JD.
          </p>
        )
      )}
    </div>
  );
}
