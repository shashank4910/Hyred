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
      <div className="flex min-h-[50vh] items-center justify-center text-on-surface-variant">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="mx-auto max-w-lg space-y-4 px-4 py-16 text-center">
        <h1 className="font-headline text-xl font-bold text-on-surface">Fix Studio session expired</h1>
        <p className="text-sm text-on-surface-variant">
          Open your ATS report again and click <strong>Upgrade resume with AI</strong> to start a new
          session in this tab.
        </p>
        <Link
          href="/ats-checker"
          className="inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-on-primary"
        >
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
