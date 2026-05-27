import { ApplyProfileForm } from './ApplyProfileForm';
import { Rocket } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default function ApplyProfilePage() {
  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div>
        <h1 className="text-heading-sm font-semibold text-ink flex items-center gap-2">
          <Rocket className="h-5 w-5 text-amber" /> Application Profile
        </h1>
        <p className="text-body-sm text-stone mt-1">
          Fill this once. The auto-apply agent reads these answers every time it applies to a job — 
          so you never have to answer the same question twice.
        </p>
      </div>
      <ApplyProfileForm />
    </div>
  );
}
