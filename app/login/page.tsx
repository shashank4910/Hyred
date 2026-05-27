import { LoginForm } from './LoginForm';

export const metadata = { title: 'Sign in · JobRadar' };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const sp = await searchParams;
  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-off-white">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center h-14 w-14 rounded-card bg-amber/10 text-amber text-xl font-bold mx-auto">
            JR
          </div>
          <h1 className="text-heading-sm font-semibold text-ink">JobRadar</h1>
          <p className="text-body-sm text-stone">
            AI-curated job matches from across the web.
          </p>
        </div>
        <LoginForm next={sp.next} />
      </div>
    </div>
  );
}
