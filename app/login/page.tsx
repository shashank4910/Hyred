import { LoginForm } from './LoginForm';
import { ToastCleanupOnLogin } from './ToastCleanupOnLogin';
import { LegalFooterLinks } from '@/app/_components/LegalFooterLinks';

export const metadata = { title: 'Sign in' };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const sp = await searchParams;
  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-background">
      <ToastCleanupOnLogin />
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-3">
          <div className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-full bg-primary text-on-primary">
            <span className="text-xl font-bold">H</span>
          </div>
          <h1 className="text-headline-md font-bold text-on-surface">Hyred</h1>
          <p className="text-body-sm text-on-surface-variant">
            AI Career Engine — match smarter, apply faster.
          </p>
        </div>
        <LoginForm next={sp.next} />
        <div className="text-center">
          <LegalFooterLinks />
        </div>
      </div>
    </div>
  );
}
