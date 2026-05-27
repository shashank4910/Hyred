import { LoginForm } from './LoginForm';

export const metadata = { title: 'Sign in · JobRadar' };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const sp = await searchParams;
  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center">
          <div className="inline-flex items-center justify-center h-14 w-14 rounded-card bg-amber/10 text-amber text-subheading font-semibold mx-auto">
            JR
          </div>
          <h1 className="text-heading-sm font-semibold text-ink mt-4">JobRadar</h1>
          <p className="text-body-sm text-stone mt-1">AI-curated job matches from across the web.</p>
        </div>
        <LoginForm next={sp.next} />
      </div>
    </div>
  );
}
