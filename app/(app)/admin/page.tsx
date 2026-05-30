import { redirect } from 'next/navigation';
import { isCurrentUserAdmin } from '@/lib/current-user';
import { AdminDashboard } from './AdminDashboard';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Admin Center' };

export default async function AdminPage() {
  if (!(await isCurrentUserAdmin())) {
    redirect('/');
  }
  return <AdminDashboard />;
}
