'use client';

import { useSession, signOut } from 'next-auth/react';
import { useRouter, usePathname } from 'next/navigation';
import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import OfflineIndicator from '@/components/OfflineIndicator';
import ServiceWorkerUpdatePrompt from '@/components/ServiceWorkerUpdatePrompt';
import { resolveAllowedModuleIds, MODULES, isFullAccessRole } from '@/lib/modules';
import { getCachedData, setCachedData } from '@/lib/offlineStore';

// Non-critical chrome — these are not needed for first paint, so we code-split
// them out of the layout bundle and mount them after the page is interactive.
// ssr:false keeps them out of the server payload entirely.
const AssistantWidget = dynamic(() => import('@/components/AssistantWidget'), { ssr: false });
const OrmGoLiveBanner = dynamic(() => import('@/components/OrmGoLiveBanner'), { ssr: false });
const OrmHourlyBroadcast = dynamic(() => import('@/components/OrmHourlyBroadcast'), { ssr: false });
const CarelineBar = dynamic(() => import('@/components/CarelineBar'), { ssr: false });
import {
  LayoutDashboard,
  Package,
  Calendar,
  CalendarDays,
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
  FlaskConical,
  Waves,
  MessageSquareWarning,
  ShieldAlert,
  Eye,
  Volume2,
  GraduationCap,
  ChefHat,
  Wind,
  Receipt,
  Shirt,
  MessageCircle,
  Star,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { data: realSession, status } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  // Optimistic shell: the last-known signed-in user, cached in IndexedDB. Lets us
  // paint the dashboard chrome instantly on a slow network instead of blocking on
  // the /api/auth/session round-trip. NextAuth still validates in the background.
  const [cachedUser, setCachedUser] = useState<any>(null);
  // Default: collapsed on phones (<1024px), expanded on desktop. Avoids the
  // sidebar covering the page on first load on small screens.
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // Which collapsible sidebar groups the user has manually toggled (label -> open).
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  // Routes we've already asked Next.js to prefetch, so we never re-request them.
  const prefetchedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    let active = true;
    getCachedData('currentUser')
      .then((rec) => {
        // Only trust a cached identity that has the role we render the shell from.
        if (active && rec?.data && (rec.data as any).role) setCachedUser(rec.data);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  // Use the live session once available; otherwise fall back to the cached user.
  const session: any = realSession ?? (cachedUser ? { user: cachedUser } : null);

  // Persist the signed-in identity so the NEXT load can paint the shell instantly
  // from cache (optimistic shell) instead of waiting on /api/auth/session.
  useEffect(() => {
    if (realSession?.user) {
      setCachedData('currentUser', realSession.user, 7 * 24 * 60 * 60 * 1000).catch(() => {});
    }
  }, [realSession]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setSidebarOpen(window.matchMedia('(min-width: 1024px)').matches);
    }
  }, []);

  // Auto-close sidebar after navigation on mobile so the page is visible.
  useEffect(() => {
    if (typeof window !== 'undefined' && !window.matchMedia('(min-width: 1024px)').matches) {
      setSidebarOpen(false);
    }
  }, [pathname]);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/login');
    }
  }, [status, router]);

  // Warm the always-visible top-level routes shortly after load so the very
  // first tap on them is instant. Kept small + deferred (idle) so it never
  // causes a request storm; the rest warm on hover / touch / group-expand.
  useEffect(() => {
    if (status !== 'authenticated') return;
    const singles = [
      '/dashboard',
      '/dashboard/roster',
      '/dashboard/emergency-booking',
      '/dashboard/theatre-readiness',
      '/dashboard/pacu',
      '/dashboard/theatre-meals',
      '/dashboard/feedback',
      '/dashboard/laundry',
      '/dashboard/settings',
    ];
    const w = window as any;
    const run = () => {
      for (const h of singles) {
        if (!prefetchedRef.current.has(h)) {
          prefetchedRef.current.add(h);
          try { router.prefetch(h); } catch { /* ignore */ }
        }
      }
    };
    const id =
      typeof w.requestIdleCallback === 'function'
        ? w.requestIdleCallback(run, { timeout: 4000 })
        : setTimeout(run, 3000);
    return () => {
      if (typeof w.cancelIdleCallback === 'function' && typeof id === 'number') {
        w.cancelIdleCallback(id);
      } else {
        clearTimeout(id as any);
      }
    };
  }, [status, router]);

  // Only block on the spinner when we have NOTHING to show yet: the session is
  // still validating AND we have no cached identity to render the shell from.
  if (status === 'loading' && !cachedUser) {
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
    { href: '/dashboard/surgeries/completed', icon: FileText, label: 'Completed Surgeries' },
    { href: '/dashboard/cancellations', icon: XCircle, label: 'Cancellations' },

    // === PRE-OPERATIVE (Night Before & Morning Of) ===
    { href: '/dashboard/pre-operative-visit', icon: ClipboardPlus, label: 'Pre-Op Visit', badge: 'NEW' },
    { href: '/dashboard/patient-payment-guide', icon: Receipt, label: 'Patient Payment Guide', badge: 'NEW' },
    { href: '/dashboard/anaesthetist-board', icon: Stethoscope, label: 'Anaesthetist Board', badge: 'NEW' },
    { href: '/dashboard/preop-reviews', icon: Syringe, label: 'Pre-op Reviews' },
    { href: '/dashboard/prescription-approvals', icon: Shield, label: 'Rx Approvals', badge: 'NEW' },
    { href: '/dashboard/prescriptions', icon: FileText, label: 'Pharmacy' },
    { href: '/dashboard/blood-bank', icon: Droplet, label: 'Blood Bank' },
    { href: '/dashboard/anesthesia-setup', icon: BriefcaseMedical, label: 'Anesthesia Setup' },

    // === DAY-OF-SURGERY LOGISTICS ===
    { href: '/dashboard/roster', icon: ClipboardCheck, label: 'Duty Roster' },
    { href: '/dashboard/surgical-unit-calendar', icon: CalendarDays, label: 'Surgical Unit Calendar', badge: 'NEW' },
    { href: '/dashboard/theatres', icon: Building2, label: 'Theatre Allocation' },
    { href: '/dashboard/theatre-setup', icon: Stethoscope, label: 'Theatre Setup' },
    { href: '/dashboard/theatre-readiness', icon: Gauge, label: 'Theatre Readiness' },
    { href: '/dashboard/call-for-patient', icon: Phone, label: 'Call for Patient', badge: 'NEW' },
    { href: '/dashboard/scrub-management', icon: Shirt, label: 'Scrub Management', badge: 'NEW' },

    // === INTRA-OPERATIVE ===
    { href: '/dashboard/theatre-reception', icon: ClipboardCheck, label: 'Theatre Reception', badge: 'NEW' },
    { href: '/dashboard/holding-area', icon: UserCheck, label: 'Holding Area' },
    { href: '/dashboard/checklists', icon: ClipboardList, label: 'WHO Checklists' },
    { href: '/dashboard/equipment-checkout', icon: PackageCheck, label: 'Equipment Checkout' },
    { href: '/dashboard/consumable-pack-provider', icon: PackageCheck, label: 'Consumable Packs', badge: 'NEW' },
    { href: '/dashboard/medication-tracking', icon: Pill, label: 'Med Tracking', badge: 'NEW' },

    // === HANDOVER ===
    { href: '/dashboard/nurse-handover', icon: ClipboardPlus, label: 'Nurse Handover', badge: 'WHO' },

    // === POST-OPERATIVE ===
    { href: '/dashboard/pacu', icon: Bed, label: 'PACU (Recovery)' },
    { href: '/dashboard/transfers', icon: ArrowLeftRight, label: 'Patient Transfers' },

    // === EMERGENCY LAB & INVESTIGATIONS ===
    { href: '/dashboard/emergency-lab-workup', icon: FlaskConical, label: 'Emergency Lab Workup', badge: 'NEW' },

    // === FACILITY & SUPPORT SERVICES ===
    { href: '/dashboard/plumbing-water-supply', icon: Waves, label: 'Plumbing & Water', badge: 'NEW' },
    { href: '/dashboard/power-house/status', icon: Zap, label: 'Power Status' },
    { href: '/dashboard/power-house/maintenance', icon: Settings, label: 'Power Maintenance' },
    { href: '/dashboard/power-house/readiness', icon: Flame, label: 'Power Readiness' },
    { href: '/dashboard/oxygen-control', icon: Wind, label: 'Oxygen Control' },
    { href: '/dashboard/cssd/inventory', icon: Shield, label: 'CSSD Inventory' },
    { href: '/dashboard/cssd/sterilization', icon: Activity, label: 'Sterilization' },
    { href: '/dashboard/cssd/readiness', icon: ClipboardCheck, label: 'CSSD Readiness' },
    { href: '/dashboard/laundry', icon: Shirt, label: 'Laundry' },

    // === ALERTS & SAFETY ===
    { href: '/dashboard/alerts', icon: AlertTriangle, label: 'Alerts' },
    { href: '/dashboard/radio', icon: Volume2, label: 'Theatre Radio' },
    { href: '/dashboard/walkie-talkies', icon: Volume2, label: 'Walkie-Talkie Radios', badge: 'NEW' },
    { href: '/dashboard/fault-alerts', icon: AlertOctagon, label: 'Fault Alerts' },
    { href: '/dashboard/emergency-alerts', icon: AlertOctagon, label: 'Emergency Alerts' },
    { href: '/dashboard/mortality', icon: Heart, label: 'Mortality Registry' },
    { href: '/dashboard/anonymous-tips', icon: MessageSquareWarning, label: 'Anonymous Tips', badge: 'NEW' },
    { href: '/dashboard/feedback', icon: MessageCircle, label: 'Feedback', badge: 'NEW' },
    { href: '/dashboard/security-reports', icon: ShieldAlert, label: 'Security Reports', badge: 'NEW' },

    // === INVENTORY & SUPPLIES ===
    { href: '/dashboard/inventory', icon: Package, label: 'Inventory' },
    { href: '/dashboard/sub-stores', icon: Store, label: 'Sub-Stores' },

    // === REPORTS & ADMINISTRATION ===
    { href: '/dashboard/announcements', icon: Volume2, label: 'Announcements', badge: 'NEW' },
    { href: '/dashboard/unit-booking-letter', icon: FileText, label: 'Official Letters', badge: 'NEW' },
    { href: '/hod-letter', icon: FileText, label: 'HOD Onboarding Letter', badge: 'NEW', external: true },
    { href: '/dashboard/theatre-meals', icon: ChefHat, label: 'Theatre Meals', badge: 'NEW' },
    { href: '/dashboard/meals/order', icon: ChefHat, label: 'Order Meal', badge: 'NEW' },
    { href: '/dashboard/reports/staff-effectiveness', icon: TrendingUp, label: 'Staff Effectiveness' },
    { href: '/dashboard/reports', icon: FileText, label: 'Reports & Analytics' },
    { href: '/dashboard/research', icon: FlaskConical, label: 'Research & Analytics', badge: 'NEW' },
    { href: '/dashboard/presentation', icon: MonitorPlay, label: 'Presentation', badge: 'NEW' },
    { href: '/dashboard/catalog-contribute', icon: Package, label: 'Contribute Catalog', badge: 'NEW' },
    { href: '/training/', icon: GraduationCap, label: 'Staff Training', badge: 'NEW', external: true },
    { href: '/training/downloads.html', icon: GraduationCap, label: 'Training Downloads', badge: 'MP3+PDF', external: true },
    { href: '/role-guide', icon: GraduationCap, label: 'Role Guide', badge: 'GUIDE', external: true },
    { href: '/dashboard/settings', icon: Wrench, label: 'Settings' },
  ];

  // Add admin-only menu items
  const adminRoles = ['ADMIN', 'SYSTEM_ADMINISTRATOR', 'THEATRE_MANAGER', 'CHIEF_MEDICAL_DIRECTOR', 'CMAC', 'DC_MAC'];
  if (adminRoles.includes(session.user.role)) {
    menuItems.push({ href: '/dashboard/users', icon: Settings, label: 'User Management' });
    menuItems.push({ href: '/dashboard/disciplinary-queries', icon: FileWarning, label: 'Disciplinary Queries', badge: 'NEW' });
    menuItems.push({ href: '/dashboard/theatre-audit', icon: FileWarning, label: 'Theatre Audit', badge: 'AUDIT' });
    menuItems.push({ href: '/dashboard/anonymous-tips/view', icon: Eye, label: 'Review Tips', badge: 'ADMIN' });
    menuItems.push({ href: '/dashboard/feedback/review', icon: Star, label: 'Review Feedback', badge: 'ADMIN' });
    menuItems.push({ href: '/dashboard/security-reports/view', icon: Eye, label: 'Review Security', badge: 'ADMIN' });
  }

  // Module Access editor — only true admins / theatre manager grant overrides.
  const accessEditorRoles = ['ADMIN', 'SYSTEM_ADMINISTRATOR', 'THEATRE_MANAGER'];
  if (accessEditorRoles.includes(session.user.role)) {
    menuItems.push({ href: '/dashboard/admin/access', icon: Shield, label: 'Module Access', badge: 'ADMIN' });
    menuItems.push({ href: '/dashboard/admin/surgical-units', icon: Building2, label: 'Surgical Units', badge: 'ADMIN' });
    menuItems.push({ href: '/dashboard/admin/surgical-catalog', icon: Package, label: 'Surgical Catalog', badge: 'ADMIN' });
  } else if (['CONSUMABLE_PACK_PROVIDER', 'PHARMACIST'].includes(session.user.role)) {
    // Non-admin roles that maintain pack/drug entries can also reach the catalog.
    menuItems.push({ href: '/dashboard/admin/surgical-catalog', icon: Package, label: 'Surgical Catalog' });
  }

  // Live monitoring — visible to admins, theatre manager and chairman
  const monitoringRoles = ['ADMIN', 'SYSTEM_ADMINISTRATOR', 'THEATRE_MANAGER', 'THEATRE_CHAIRMAN'];
  if (monitoringRoles.includes(session.user.role)) {
    menuItems.push({ href: '/dashboard/live-monitoring', icon: Activity, label: 'Live Monitoring', badge: 'LIVE' });
  }

  // Public kiosk announcement TVs (open in a new tab so they can be cast to a
  // wall display). Visible to the relevant department + admins/managers.
  const labTvRoles = ['ADMIN', 'SYSTEM_ADMINISTRATOR', 'THEATRE_MANAGER', 'THEATRE_CHAIRMAN', 'LABORATORY_STAFF'];
  if (labTvRoles.includes(session.user.role)) {
    menuItems.push({ href: '/announcement-display/lab', icon: FlaskConical, label: 'Lab Announcement TV', badge: 'TV', external: true });
  }
  const pharmacyTvRoles = ['ADMIN', 'SYSTEM_ADMINISTRATOR', 'THEATRE_MANAGER', 'THEATRE_CHAIRMAN', 'PHARMACIST'];
  if (pharmacyTvRoles.includes(session.user.role)) {
    menuItems.push({ href: '/announcement-display/pharmacy', icon: Pill, label: 'Pharmacy Announcement TV', badge: 'TV', external: true });
  }
  const bloodTvRoles = ['ADMIN', 'SYSTEM_ADMINISTRATOR', 'THEATRE_MANAGER', 'THEATRE_CHAIRMAN', 'BLOODBANK_STAFF'];
  if (bloodTvRoles.includes(session.user.role)) {
    menuItems.push({ href: '/announcement-display/blood-bank', icon: Droplet, label: 'Blood Bank Announcement TV', badge: 'TV', external: true });
  }

  // Role-based menu filtering driven by the central modules catalog +
  // per-user grants in session.user.extraModules. Full-access roles see all.
  const userRole = session.user.role;
  const extraModules = session.user.extraModules || [];
  const allowedModuleIds = resolveAllowedModuleIds(userRole, extraModules);

  // Map menu hrefs to module IDs by longest-path prefix match.
  const sortedModules = [...MODULES].sort(
    (a, b) => Math.max(...b.paths.map((p) => p.length)) - Math.max(...a.paths.map((p) => p.length))
  );
  const findModule = (href: string) => {
    // Strip query/hash + trailing slash for comparison.
    const path = href.split(/[?#]/)[0].replace(/\/$/, '') || '/';
    for (const m of sortedModules) {
      for (const p of m.paths) {
        if (path === p || path.startsWith(p + '/')) return m;
      }
    }
    return null;
  };

  const filteredMenuItems = isFullAccessRole(userRole)
    ? menuItems
    : menuItems.filter((item) => {
        // External links (e.g. /training/) bypass module gating.
        if ((item as any).external) return true;
        const mod = findModule(item.href);
        if (!mod) return true; // unmapped paths default to visible
        return allowedModuleIds.has(mod.id);
      });

  // ---- Grouped sidebar layout -------------------------------------------
  // The sidebar is organised into ordered top-level links and collapsible
  // groups. Groups start collapsed (fewer DOM nodes = faster paint) and only
  // the group containing the active route auto-expands.
  const itemByHref = new Map(filteredMenuItems.map((it) => [it.href, it] as const));
  const usedHrefs = new Set<string>();
  const take = (href: string) => {
    const it = itemByHref.get(href);
    if (it) usedHrefs.add(href);
    return it;
  };

  type NavEntry =
    | { type: 'single'; href: string }
    | { type: 'group'; label: string; icon: any; hrefs: string[] };
  const NAV_LAYOUT: NavEntry[] = [
    { type: 'single', href: '/dashboard' },
    { type: 'single', href: '/dashboard/roster' },
    { type: 'single', href: '/dashboard/emergency-booking' },
    { type: 'group', label: 'Alerts', icon: AlertTriangle, hrefs: [
      '/dashboard/alerts',
      '/dashboard/emergency-alerts',
      '/dashboard/emergency-lab-workup',
      '/dashboard/fault-alerts',
    ] },
    { type: 'group', label: 'Surgeries', icon: Calendar, hrefs: [
      '/dashboard/surgeries',
      '/dashboard/cancellations',
      '/dashboard/surgeries/completed',
      '/dashboard/admin/surgical-catalog',
      '/dashboard/surgical-unit-calendar',
      '/dashboard/admin/surgical-units',
      '/dashboard/mortality',
      '/dashboard/patients',
    ] },
    { type: 'group', label: 'Nurses Board', icon: UserCheck, hrefs: [
      '/dashboard/nurse-handover',
      '/dashboard/pre-operative-visit',
      '/dashboard/checklists',
      '/dashboard/theatre-reception',
      '/dashboard/holding-area',
      '/dashboard/call-for-patient',
      '/dashboard/theatres',
      '/dashboard/theatre-setup',
      '/dashboard/walkie-talkies',
      '/dashboard/inventory',
      '/dashboard/equipment-checkout',
      '/dashboard/sub-stores',
      '/dashboard/transfers',
    ] },
    { type: 'single', href: '/dashboard/theatre-readiness' },
    { type: 'group', label: 'Anaesthetist Board', icon: Stethoscope, hrefs: [
      '/dashboard/anaesthetist-board',
      '/dashboard/preop-reviews',
      '/dashboard/anesthesia-setup',
      '/dashboard/prescription-approvals',
    ] },
    { type: 'single', href: '/dashboard/pacu' },
    { type: 'group', label: 'Pharmacy', icon: Pill, hrefs: [
      '/dashboard/prescriptions',
      '/announcement-display/pharmacy',
      '/dashboard/medication-tracking',
    ] },
    { type: 'single', href: '/announcement-display/lab' },
    { type: 'group', label: 'Blood Bank', icon: Droplet, hrefs: [
      '/dashboard/blood-bank',
      '/announcement-display/blood-bank',
    ] },
    { type: 'group', label: 'Admin Board', icon: Shield, hrefs: [
      '/dashboard/admin/access',
      '/dashboard/announcements',
      '/dashboard/unit-booking-letter',
      '/dashboard/patient-payment-guide',
      '/dashboard/presentation',
      '/dashboard/reports',
      '/dashboard/research',
      '/dashboard/feedback/review',
      '/dashboard/security-reports/view',
      '/dashboard/anonymous-tips/view',
      '/dashboard/reports/staff-effectiveness',
      '/training/',
      '/training/downloads.html',
      '/dashboard/disciplinary-queries',
      '/hod-letter',
      '/dashboard/live-monitoring',
      '/dashboard/theatre-audit',
      '/dashboard/users',
      '/role-guide',
    ] },
    { type: 'group', label: 'Theatre Annex', icon: Building2, hrefs: [
      '/dashboard/oxygen-control',
      '/dashboard/meals/order',
      '/dashboard/plumbing-water-supply',
      '/dashboard/power-house/maintenance',
      '/dashboard/power-house/readiness',
      '/dashboard/power-house/status',
      '/dashboard/cssd/inventory',
      '/dashboard/cssd/readiness',
      '/dashboard/cssd/sterilization',
    ] },
    { type: 'single', href: '/dashboard/theatre-meals' },
    { type: 'group', label: 'Theatre Logistics', icon: Volume2, hrefs: [
      '/dashboard/radio',
      '/dashboard/scrub-management',
    ] },
    { type: 'group', label: 'Anonymous Tips', icon: MessageSquareWarning, hrefs: [
      '/dashboard/anonymous-tips',
      '/dashboard/security-reports',
    ] },
    { type: 'group', label: 'Consumable Packs', icon: PackageCheck, hrefs: [
      '/dashboard/consumable-pack-provider',
      '/dashboard/catalog-contribute',
    ] },
    { type: 'single', href: '/dashboard/feedback' },
    { type: 'single', href: '/dashboard/laundry' },
    { type: 'single', href: '/dashboard/settings' },
  ];

  type NavItemT = (typeof filteredMenuItems)[number];
  const navSections = NAV_LAYOUT.map((entry) => {
    if (entry.type === 'single') {
      const it = take(entry.href);
      return it ? { kind: 'single' as const, item: it } : null;
    }
    const items = entry.hrefs.map((h) => take(h)).filter(Boolean) as NavItemT[];
    return items.length
      ? { kind: 'group' as const, label: entry.label, icon: entry.icon, items }
      : null;
  }).filter(Boolean) as Array<
    | { kind: 'single'; item: NavItemT }
    | { kind: 'group'; label: string; icon: any; items: NavItemT[] }
  >;

  // Anything not placed in the layout still shows, under a trailing "More".
  const leftovers = filteredMenuItems.filter((it) => !usedHrefs.has(it.href));
  if (leftovers.length) {
    navSections.push({ kind: 'group', label: 'More', icon: Menu, items: leftovers });
  }

  const isItemActive = (href: string) =>
    pathname === href || pathname?.startsWith(href + '/');
  const groupHasActive = (items: NavItemT[]) => items.some((it) => isItemActive(it.href));

  // Prefetch a route just-in-time (on hover / focus / touch / group-expand) so
  // the click navigates INSTANTLY, without the upfront storm of prefetching all
  // ~70 routes at once. Internal routes only; each route prefetched at most once.
  const prefetchHref = (href: string, external?: boolean) => {
    if (external || !href.startsWith('/')) return;
    if (prefetchedRef.current.has(href)) return;
    prefetchedRef.current.add(href);
    try { router.prefetch(href); } catch { /* ignore */ }
  };

  const renderNavItem = (item: NavItemT, nested = false) => {
    const isActive = isItemActive(item.href);
    const pad = nested ? 'pl-12 pr-4' : 'px-6';
    const className = `flex items-center ${pad} py-3 transition-all duration-200 relative ${
      isActive
        ? 'bg-primary-700 border-l-4 border-accent-500 text-white'
        : 'text-primary-100 hover:bg-primary-700 hover:border-l-4 hover:border-accent-500'
    }`;
    const inner = (
      <>
        <item.icon className="w-5 h-5 mr-3 flex-shrink-0" />
        <span className="flex-1 truncate">{item.label}</span>
        {item.badge && (
          <span className="ml-2 px-2 py-0.5 bg-accent-500 text-white text-xs font-bold rounded-full">
            {item.badge}
          </span>
        )}
      </>
    );
    if ((item as any).external) {
      return (
        <a
          key={item.href}
          href={item.href}
          target="_blank"
          rel="noopener noreferrer"
          className={className}
          onClick={() => setSidebarOpen(false)}
        >
          {inner}
        </a>
      );
    }
    return (
      <Link
        key={item.href}
        href={item.href}
        prefetch={false}
        className={className}
        // Warm the route the instant the user shows intent, so the click is
        // immediate even on a slow network.
        onPointerEnter={() => prefetchHref(item.href)}
        onFocus={() => prefetchHref(item.href)}
        onTouchStart={() => prefetchHref(item.href)}
        onClick={() => setSidebarOpen(false)}
      >
        {inner}
      </Link>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Mobile backdrop — tap to close the sidebar. Only on < lg where the
          sidebar overlays the content instead of pushing it. */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
          aria-hidden
          onClick={() => setSidebarOpen(false)}
        />
      )}
      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 bg-gradient-to-b from-primary-800 to-primary-900 text-white shadow-2xl transition-all duration-300 z-40 ${
        sidebarOpen ? 'w-64 max-w-[85vw]' : 'w-0'
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
            {navSections.map((section) => {
              if (section.kind === 'single') {
                return renderNavItem(section.item);
              }
              const open = openGroups[section.label] ?? groupHasActive(section.items);
              const GroupIcon = section.icon;
              const warmGroup = () =>
                section.items.forEach((it) => prefetchHref(it.href, (it as any).external));
              return (
                <div key={section.label}>
                  <button
                    onClick={() => {
                      const willOpen = !open;
                      setOpenGroups((g) => ({ ...g, [section.label]: willOpen }));
                      if (willOpen) warmGroup();
                    }}
                    onPointerEnter={warmGroup}
                    className="w-full flex items-center px-6 py-3 text-primary-100 hover:bg-primary-700 transition-colors"
                    aria-expanded={open}
                  >
                    <GroupIcon className="w-5 h-5 mr-3 flex-shrink-0" />
                    <span className="flex-1 text-left font-semibold text-xs uppercase tracking-wider">
                      {section.label}
                    </span>
                    {open ? (
                      <ChevronDown className="w-4 h-4 flex-shrink-0" />
                    ) : (
                      <ChevronRight className="w-4 h-4 flex-shrink-0" />
                    )}
                  </button>
                  {open && (
                    <div className="bg-primary-900/40">
                      {section.items.map((it) => renderNavItem(it, true))}
                    </div>
                  )}
                </div>
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
      <div className={`transition-all duration-300 ${sidebarOpen ? 'lg:ml-64' : 'ml-0'}`}>
        <header className="bg-white shadow-sm border-b-2 border-primary-500 sticky top-0 z-30">
          <div className="px-4 sm:px-8 py-3 sm:py-5 flex items-center justify-between gap-3">
            <div className="flex items-center space-x-3 sm:space-x-4 min-w-0">
              {/* Toggle Sidebar Button */}
              <button
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="p-2 rounded-lg bg-primary-100 hover:bg-primary-200 text-primary-800 transition-colors flex-shrink-0"
                aria-label="Toggle sidebar"
              >
                {sidebarOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
              </button>
              <div className="min-w-0">
                <h2 className="text-lg sm:text-2xl font-bold bg-gradient-to-r from-primary-600 to-secondary-600 bg-clip-text text-transparent truncate">
                  Welcome, {session.user.name}
                </h2>
                <p className="text-xs sm:text-sm text-gray-600 mt-0.5 sm:mt-1 hidden xs:block sm:block">
                  {new Date().toLocaleDateString('en-GB', { 
                    weekday: 'long', 
                    year: 'numeric', 
                    month: 'long', 
                    day: 'numeric' 
                  })}
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-2 sm:space-x-3 flex-shrink-0">
              <OfflineIndicator />
              <ServiceWorkerUpdatePrompt />
              <span className="px-2 sm:px-4 py-1 sm:py-2 bg-primary-100 text-primary-800 rounded-full text-xs sm:text-sm font-semibold whitespace-nowrap">
                {session.user.role.replace(/_/g, ' ')}
              </span>
            </div>
          </div>
        </header>

        <main
          className="dashboard-main p-4 sm:p-8 min-h-screen relative"
          style={{ backgroundColor: '#f9fafb' }}
        >
          {/* Fixed watermark logo. Using a position:fixed layer (instead of
              background-attachment:fixed on this scrolling element) avoids the
              costly full-page repaints that caused scroll jank on phones. */}
          <div
            aria-hidden
            className="pointer-events-none fixed inset-0 z-0"
            style={{
              backgroundImage: "url('/unth-orm-logo.png')",
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'center center',
              backgroundSize: '520px 520px',
            }}
          />
          {/* watermark veil — keeps content readable over logo */}
          <div
            aria-hidden
            className="pointer-events-none fixed inset-0 z-0"
            style={{ background: 'rgba(249,250,251,0.92)' }}
          />
          {/*
            IMPORTANT: do NOT give this wrapper a z-index. A positioned element
            with z-index creates a new stacking context and traps every modal
            inside it (their fixed/z-50 overlays end up below the sticky
            header z-30 and sidebar z-40). `relative` alone is enough to keep
            children above the watermark veil while letting modals render in
            the root stacking context.
          */}
          <div className="relative">
            <CarelineBar />
            <OrmGoLiveBanner />
            <OrmHourlyBroadcast />
            {children}
          </div>
        </main>
      </div>
      <AssistantWidget />
    </div>
  );
}
