import { ImportForm } from './ImportForm';
import { PageHeader } from '../_components/PageHeader';

export const metadata = { title: 'Import job' };

export default function ImportPage() {
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Import a job"
        description="Paste any job URL — Naukri, Wellfound, Greenhouse, Lever, company career pages — and we fetch it, score it against your resume, and add it to your matches."
      />
      <ImportForm />
    </div>
  );
}
