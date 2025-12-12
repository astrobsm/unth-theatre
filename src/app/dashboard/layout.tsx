'use client';

import { useSession, signOut } from 'next-auth/react';
import { useRouter, usePathname } from 'next/navigation';
import { useEffect } from 'react';
import Link from 'next/link';
import {
  LayoutDashboard,
  Package,
  Calendar,
  ClipboardList,
  FileText,
  Users,
  ArrowLeftRight,
  XCircle,
  LogOut,
  Settings,
  Building2,
  Heart,
  Stethoscope,
  UserCheck,
  Bed,
  AlertTriangle,
} from 'lucide-react';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/login');
    }
  }, [status, router]);

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-xl">Loading...</div>
      </div>
    );
  }

  if (!session) {
    return null;
  }

  const menuItems = [
    { href: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { href: '/dashboard/inventory', icon: Package, label: 'Inventory' },
    { href: '/dashboard/theatres', icon: Building2, label: 'Theatre Allocation' },
    { href: '/dashboard/theatre-setup', icon: Stethoscope, label: 'Theatre Setup' },
    { href: '/dashboard/surgeries', icon: Calendar, label: 'Surgeries' },
    { href: '/dashboard/patients', icon: Users, label: 'Patients' },
    { href: '/dashboard/holding-area', icon: UserCheck, label: 'Holding Area' },
    { href: '/dashboard/pacu', icon: Bed, label: 'PACU' },
    { href: '/dashboard/alerts', icon: AlertTriangle, label: 'Alerts' },
    { href: '/dashboard/transfers', icon: ArrowLeftRight, label: 'Transfers' },
    { href: '/dashboard/mortality', icon: Heart, label: 'Mortality' },
    { href: '/dashboard/checklists', icon: ClipboardList, label: 'WHO Checklists' },
    { href: '/dashboard/cancellations', icon: XCircle, label: 'Cancellations' },
    { href: '/dashboard/reports', icon: FileText, label: 'Reports' },
  ];

  // Add admin-only menu items
  if (session.user.role === 'ADMIN' || session.user.role === 'THEATRE_MANAGER') {
    menuItems.push({ href: '/dashboard/users', icon: Settings, label: 'User Management' });
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className="fixed inset-y-0 left-0 w-64 bg-gradient-to-b from-primary-800 to-primary-900 text-white shadow-2xl">
        <div className="p-6 border-b border-primary-700">
          {/* Logo */}
          <div className="flex items-center justify-center mb-4">
            <img 
              src="/logo.png" 
              alt="UNTH Logo" 
              className="logo"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
          </div>
          <h1 className="text-2xl font-bold text-center">Operative Resource Manager-ORM</h1>
          <p className="text-xs text-primary-200 mt-1 text-center">UNTH Ituku Ozalla</p>
        </div>

        <nav className="mt-6 overflow-y-auto max-h-[calc(100vh-300px)]">
          {menuItems.map((item) => {
            const isActive = pathname === item.href || pathname?.startsWith(item.href + '/');
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center px-6 py-3 transition-all duration-200 ${
                  isActive
                    ? 'bg-primary-700 border-l-4 border-accent-500 text-white'
                    : 'text-primary-100 hover:bg-primary-700 hover:border-l-4 hover:border-accent-500'
                }`}
              >
                <item.icon className="w-5 h-5 mr-3" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="absolute bottom-0 w-64 p-6 border-t border-primary-700 bg-primary-900">
          <div className="flex items-center mb-4">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-accent-500 to-accent-600 flex items-center justify-center font-bold text-white shadow-lg">
              {session.user.name?.charAt(0)}
            </div>
            <div className="ml-3">
              <p className="text-sm font-semibold">{session.user.name}</p>
              <p className="text-xs text-primary-300">{session.user.role.replace('_', ' ')}</p>
            </div>
          </div>
          <button
            onClick={() => signOut({ callbackUrl: '/auth/login' })}
            className="flex items-center w-full px-4 py-2.5 text-sm bg-primary-700 hover:bg-primary-600 rounded-lg transition-all duration-200 font-medium shadow-md"
          >
            <LogOut className="w-4 h-4 mr-2" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="ml-64">
        <header className="bg-white shadow-sm border-b-2 border-primary-500">
          <div className="px-8 py-5 flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold bg-gradient-to-r from-primary-600 to-secondary-600 bg-clip-text text-transparent">
                Welcome, {session.user.name}
              </h2>
              <p className="text-sm text-gray-600 mt-1">
                {new Date().toLocaleDateString('en-GB', { 
                  weekday: 'long', 
                  year: 'numeric', 
                  month: 'long', 
                  day: 'numeric' 
                })}
              </p>
            </div>
            <div className="flex items-center space-x-3">
              <span className="px-4 py-2 bg-primary-100 text-primary-800 rounded-full text-sm font-semibold">
                {session.user.role.replace('_', ' ')}
              </span>
            </div>
          </div>
        </header>

        <main className="p-8 bg-gray-50 min-h-screen">{children}</main>
      </div>
    </div>
  );
}
