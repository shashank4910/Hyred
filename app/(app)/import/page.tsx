import { ImportForm } from './ImportForm';

export const metadata = { title: 'Import job · JobRadar' };

export default function ImportPage() {
  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-heading-sm font-semibold text-ink">Import a job</h1>
        <p className="text-body-sm text-stone mt-1">
          Paste any job URL and we&apos;ll fetch, score, and add it to your matches.
        </p>
      </div>
      <ImportForm />
    </div>
  );
}
