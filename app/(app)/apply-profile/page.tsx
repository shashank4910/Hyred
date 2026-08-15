import { ApplyProfileForm } from './ApplyProfileForm';
import { PageHeader } from '../_components/PageHeader';

export const dynamic = 'force-dynamic';

export default function ApplyProfilePage() {
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Apply profile"
        description="Fill this once. The auto-apply agent and Chrome extension use these answers so you are not retyping the same screening questions."
      />
      <ApplyProfileForm />
    </div>
  );
}
