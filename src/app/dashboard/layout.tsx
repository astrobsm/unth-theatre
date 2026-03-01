'use client';

import { useSession, signOut } from 'next-auth/react';
import { useRouter, usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import OfflineIndicator from '@/components/OfflineIndicator';
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
  Menu,
  X,
  Activity,
  Gauge,
  ClipboardCheck,
  Sparkles,
  BriefcaseMedical,
  TrendingUp,
  PackageCheck,
  AlertOctagon,
  Syringe,
  Droplet,
  Zap,
  Flame,
  Shield,
  Store,
  Ambulance,
  FileWarning,
  Wrench,
  Phone,
  ClipboardPlus,
  Pill,
  MonitorPlay,
} from 'lucide-react';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(true);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/login');
    }
  }, [status, router]);

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="mt-4 text-gray-600 font-medium">Loading Theatre Manager…</p>
        </div>
      </div>
    );
  }

  if (!session) {
    return null;
  }

  const menuItems = [
    // === OVERVIEW ===
    { href: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { href: '/dashboard/emergency-booking', icon: Ambulance, label: '🚨 Emergency Booking', badge: 'URGENT' },

    // === PATIENT REGISTRATION & SCHEDULING ===
    { href: '/dashboard/patients', icon: Users, label: 'Patients' },
    { href: '/dashboard/surgeries', icon: Calendar, label: 'Surgeries' },
    { href: '/dashboard/cancellations', icon: XCircle, label: 'Cancellations' },

    // === PRE-OPERATIVE (Night Before & Morning Of) ===
    { href: '/dashboard/pre-operative-visit', icon: ClipboardPlus, label: 'Pre-Op Visit', badge: 'NEW' },
    { href: '/dashboard/preop-reviews', icon: Syringe, label: 'Pre-op Reviews' },
    { href: '/dashboard/prescriptions', icon: FileText, label: 'Prescriptions' },
    { href: '/dashboard/blood-bank', icon: Droplet, label: 'Blood Bank' },
    { href: '/dashboard/anesthesia-setup', icon: BriefcaseMedical, label: 'Anesthesia Setup' },

    // === DAY-OF-SURGERY LOGISTICS ===
    { href: '/dashboard/roster', icon: ClipboardCheck, label: 'Duty Roster' },
    { href: '/dashboard/theatres', icon: Building2, label: 'Theatre Allocation' },
    { href: '/dashboard/theatre-setup', icon: Stethoscope, label: 'Theatre Setup' },
    { href: '/dashboard/theatre-readiness', icon: Gauge, label: 'Theatre Readiness' },
    { href: '/dashboard/call-for-patient', icon: Phone, label: 'Call for Patient', badge: 'NEW' },

    // === INTRA-OPERATIVE ===
    { href: '/dashboard/holding-area', icon: UserCheck, label: 'Holding Area' },
    { href: '/dashboard/checklists', icon: ClipboardList, label: 'WHO Checklists' },
    { href: '/dashboard/equipment-checkout', icon: PackageCheck, label: 'Equipment Checkout' },
    { href: '/dashboard/medication-tracking', icon: Pill, label: 'Med Tracking', badge: 'NEW' },

    // === POST-OPERATIVE ===
    { href: '/dashboard/pacu', icon: Bed, label: 'PACU (Recovery)' },
    { href: '/dashboard/transfers', icon: ArrowLeftRight, label: 'Patient Transfers' },

    // === FACILITY & SUPPORT SERVICES ===
    { href: '/dashboard/power-house/status', icon: Zap, label: 'Power Status' },
    { href: '/dashboard/power-house/maintenance', icon: Settings, label: 'Power Maintenance' },
    { href: '/dashboard/power-house/readiness', icon: Flame, label: 'Power Readiness' },
    { href: '/dashboard/cssd/inventory', icon: Shield, label: 'CSSD Inventory' },
    { href: '/dashboard/cssd/sterilization', icon: Activity, label: 'Sterilization' },
    { href: '/dashboard/cssd/readiness', icon: ClipboardCheck, label: 'CSSD Readiness' },

    // === ALERTS & SAFETY ===
    { href: '/dashboard/alerts', icon: AlertTriangle, label: 'Alerts' },
    { href: '/dashboard/fault-alerts', icon: AlertOctagon, label: 'Fault Alerts' },
    { href: '/dashboard/emergency-alerts', icon: AlertOctagon, label: 'Emergency Alerts' },
    { href: '/dashboard/mortality', icon: Heart, label: 'Mortality Registry' },

    // === INVENTORY & SUPPLIES ===
    { href: '/dashboard/inventory', icon: Package, label: 'Inventory' },
    { href: '/dashboard/sub-stores', icon: Store, label: 'Sub-Stores' },

    // === REPORTS & ADMINISTRATION ===
    { href: '/dashboard/reports/staff-effectiveness', icon: TrendingUp, label: 'Staff Effectiveness' },
    { href: '/dashboard/reports', icon: FileText, label: 'Reports & Analytics' },
    { href: '/dashboard/presentation', icon: MonitorPlay, label: 'Presentation', badge: 'NEW' },
    { href: '/dashboard/settings', icon: Wrench, label: 'Settings' },
  ];

  // Add admin-only menu items
  const adminRoles = ['ADMIN', 'SYSTEM_ADMINISTRATOR', 'THEATRE_MANAGER', 'CHIEF_MEDICAL_DIRECTOR', 'CMAC', 'DC_MAC'];
  if (adminRoles.includes(session.user.role)) {
    menuItems.push({ href: '/dashboard/users', icon: Settings, label: 'User Management' });
    menuItems.push({ href: '/dashboard/disciplinary-queries', icon: FileWarning, label: 'Disciplinary Queries', badge: 'NEW' });
  }

  // Role-based menu filtering — show only relevant items per role
  // Roles NOT listed here see ALL menu items (e.g. ADMIN, SURGEON, ANESTHETIST, NURSE, etc.)
  const roleMenuMap: Record<string, string[]> = {
    PHARMACIST: ['/dashboard', '/dashboard/prescriptions', '/dashboard/medication-tracking', '/dashboard/emergency-booking', '/dashboard/settings'],
    LAUNDRY_SUPERVISOR: ['/dashboard', '/dashboard/laundry-supervisor', '/dashboard/settings'],
    CSSD_SUPERVISOR: ['/dashboard', '/dashboard/cssd-supervisor', '/dashboard/cssd/inventory', '/dashboard/cssd/sterilization', '/dashboard/cssd/readiness', '/dashboard/settings'],
    OXYGEN_UNIT_SUPERVISOR: ['/dashboard', '/dashboard/oxygen-supervisor', '/dashboard/oxygen-control', '/dashboard/settings'],
    WORKS_SUPERVISOR: ['/dashboard', '/dashboard/works-supervisor', '/dashboard/power-house/status', '/dashboard/power-house/maintenance', '/dashboard/power-house/readiness', '/dashboard/fault-alerts', '/dashboard/settings'],
    LAUNDRY_STAFF: ['/dashboard', '/dashboard/laundry-supervisor', '/dashboard/settings'],
    CSSD_STAFF: ['/dashboard', '/dashboard/cssd/inventory', '/dashboard/cssd/sterilization', '/dashboard/cssd/readiness', '/dashboard/settings'],
    POWER_PLANT_OPERATOR: ['/dashboard', '/dashboard/power-house/status', '/dashboard/power-house/maintenance', '/dashboard/power-house/readiness', '/dashboard/settings'],
    BLOODBANK_STAFF: ['/dashboard', '/dashboard/blood-bank', '/dashboard/emergency-booking', '/dashboard/settings'],
    PLUMBER: ['/dashboard', '/dashboard/works-supervisor', '/dashboard/settings'],
    PORTER: ['/dashboard', '/dashboard/holding-area', '/dashboard/transfers', '/dashboard/call-for-patient', '/dashboard/emergency-booking', '/dashboard/settings'],
    CLEANER: ['/dashboard', '/dashboard/settings'],
  };

  const allowedPaths = roleMenuMap[session.user.role];
  const filteredMenuItems = allowedPaths
    ? menuItems.filter(item => allowedPaths.some(p => item.href === p || item.href.startsWith(p + '/')))
    : menuItems;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 bg-gradient-to-b from-primary-800 to-primary-900 text-white shadow-2xl transition-all duration-300 z-40 ${
        sidebarOpen ? 'w-64' : 'w-0'
      }`}>
        <div className={`${sidebarOpen ? 'block' : 'hidden'}`}>
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

          <nav className="mt-6 pb-48 overflow-y-auto sidebar-nav">
            {filteredMenuItems.map((item) => {
              const isActive = pathname === item.href || pathname?.startsWith(item.href + '/');
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center px-6 py-3 transition-all duration-200 relative ${
                    isActive
                      ? 'bg-primary-700 border-l-4 border-accent-500 text-white'
                      : 'text-primary-100 hover:bg-primary-700 hover:border-l-4 hover:border-accent-500'
                  }`}
                >
                  <item.icon className="w-5 h-5 mr-3" />
                  <span className="flex-1">{item.label}</span>
                  {item.badge && (
                    <span className="ml-2 px-2 py-0.5 bg-accent-500 text-white text-xs font-bold rounded-full">
                      {item.badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>

          <div className="fixed bottom-0 w-64 p-6 border-t border-primary-700 bg-primary-900">
            <div className="flex items-center mb-4">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-accent-500 to-accent-600 flex items-center justify-center font-bold text-white shadow-lg">
                {session.user.name?.charAt(0)}
              </div>
              <div className="ml-3 flex-1 min-w-0">
                <p className="text-sm font-semibold truncate">{session.user.name}</p>
                <p className="text-xs text-primary-300 truncate">{session.user.role.replace(/_/g, ' ')}</p>
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
        </div>
      </aside>

      {/* Main content */}
      <div className={`transition-all duration-300 ${sidebarOpen ? 'ml-64' : 'ml-0'}`}>
        <header className="bg-white shadow-sm border-b-2 border-primary-500 sticky top-0 z-30">
          <div className="px-8 py-5 flex items-center justify-between">
            <div className="flex items-center space-x-4">
              {/* Toggle Sidebar Button */}
              <button
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="p-2 rounded-lg bg-primary-100 hover:bg-primary-200 text-primary-800 transition-colors"
                aria-label="Toggle sidebar"
              >
                {sidebarOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
              </button>
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
            </div>
            <div className="flex items-center space-x-3">
              <OfflineIndicator />
              <span className="px-4 py-2 bg-primary-100 text-primary-800 rounded-full text-sm font-semibold">
                {session.user.role.replace(/_/g, ' ')}
              </span>
            </div>
          </div>
        </header>

        <main className="p-8 bg-gray-50 min-h-screen">{children}</main>
      </div>
    </div>
  );
}
