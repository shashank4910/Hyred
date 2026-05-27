import { ImportForm } from './ImportForm';

export const metadata = { title: 'Import job · JobRadar' };

export default function ImportPage() {
  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div>
        <h1 className="text-heading-sm font-semibold text-ink">Import a job</h1>
        <p className="text-body-sm text-stone mt-1">
          Paste any job URL — Naukri, Wellfound, Greenhouse, Lever, company
          career pages — and the AI will fetch it, score it against your resume,
          and add it to your matches.
        </p>
      </div>
      <ImportForm />
    </div>
  );
}
