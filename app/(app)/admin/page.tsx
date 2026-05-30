import { redirect } from 'next/navigation';
import { getCurrentUser, isAdminEmail } from '@/lib/current-user';
import { AdminDashboard } from './AdminDashboard';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Admin Center · JobRadar' };

export default async function AdminPage() {
  const user = await getCurrentUser();
  if (!isAdminEmail(user?.email)) {
    redirect('/');
  }
  return <AdminDashboard />;
}
