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
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-1">
          <div className="inline-flex items-center justify-center h-12 w-12 rounded-full bg-primary/10 text-primary text-xl font-bold">
            JR
          </div>
          <h1 className="text-2xl font-semibold">JobRadar</h1>
          <p className="text-sm text-muted">
            AI-curated job matches from across the web.
          </p>
        </div>
        <LoginForm next={sp.next} />
      </div>
    </div>
  );
}
