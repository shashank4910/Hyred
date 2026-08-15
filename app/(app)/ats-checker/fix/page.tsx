'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { AtsFixStudio } from '../AtsFixStudio';
import {
  clearAtsFixSession,
  readAtsFixSession,
  type AtsFixSessionPayload,
} from '@/lib/ats-fix-session';

/**
 * Full Fix Studio in its own tab.
 * Payload is written by the ATS report page before window.open().
 */
export default function AtsFixStudioPage() {
  const [session, setSession] = useState<AtsFixSessionPayload | null | undefined>(undefined);

  useEffect(() => {
    setSession(readAtsFixSession());
  }, []);

  if (session === undefined) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-on-surface-variant">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <p className="text-sm">Loading your scan…</p>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="mx-auto max-w-lg space-y-4 px-4 py-16 text-center">
        <h1 className="font-headline text-xl font-bold text-on-surface">No resume loaded in this tab</h1>
        <p className="text-sm text-on-surface-variant">
          Open your ATS report and click <strong>Upgrade with AI</strong> (or <strong>Polish with AI</strong>
          ) so this tab can load the scan.
        </p>
        <Link href="/ats-checker" className="btn-primary inline-flex h-11">
          <ArrowLeft className="h-4 w-4" />
          Back to ATS Checker
        </Link>
      </div>
    );
  }

  const originalFile =
    session.originalFileDataUrl && session.originalFileKind
      ? { url: session.originalFileDataUrl, kind: session.originalFileKind }
      : null;

  return (
    <div className="mx-auto max-w-[1600px] animate-fade-in">
      <AtsFixStudio
        initialResume={session.resume}
        initialResult={session.result}
        jobDescription={session.jobDescription}
        originalFile={originalFile}
        originalFilename={session.filename}
        onClose={() => {
          clearAtsFixSession();
          // Prefer closing this tab if it was opened from the report; otherwise go back.
          if (window.opener && !window.opener.closed) {
            window.close();
            // If the browser blocks close, fall through:
          }
          window.location.href = '/ats-checker';
        }}
      />
    </div>
  );
}
