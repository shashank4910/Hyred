import { ImportForm } from './ImportForm';

export const metadata = { title: 'Import job' };

export default function ImportPage() {
  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div>
        <h1 className="font-headline text-heading-sm font-bold text-on-background">Import a job</h1>
        <p className="text-body-md text-on-surface-variant mt-1">
          Paste any job URL — Naukri, Wellfound, Greenhouse, Lever, company
          career pages — and the AI will fetch it, score it against your resume,
          and add it to your matches.
        </p>
      </div>
      <ImportForm />
    </div>
  );
}
