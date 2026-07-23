"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  BedDouble,
  CalendarDays,
  FileText,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Menu,
  Plane,
  Plus,
  Settings,
  Tags,
  Users,
  X,
} from "lucide-react";

import { cn } from "@/lib/cn";
import { useHydrated } from "@/lib/useHydrated";
import { isAdmin, useAuthStore } from "@/stores/auth";

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  adminOnly?: boolean;
  exact?: boolean;
}

const NAV: NavItem[] = [
  { href: "/", label: "Dashboard", icon: <LayoutDashboard className="size-5" />, exact: true },
  { href: "/quotations", label: "Quotations", icon: <FileText className="size-5" /> },
  { href: "/quotations/new", label: "New Quotation", icon: <Plus className="size-5" /> },
  { href: "/admin/rates", label: "Rates", icon: <Tags className="size-5" />, adminOnly: true },
  { href: "/admin/hotels", label: "Hotels", icon: <BedDouble className="size-5" />, adminOnly: true },
  { href: "/admin/flights", label: "Flights", icon: <Plane className="size-5" />, adminOnly: true },
  { href: "/admin/blocks", label: "Date Blocks", icon: <CalendarDays className="size-5" />, adminOnly: true },
  { href: "/admin/services", label: "Services", icon: <ListChecks className="size-5" />, adminOnly: true },
  { href: "/admin/users", label: "Users", icon: <Users className="size-5" />, adminOnly: true },
  { href: "/admin/reports", label: "Reports", icon: <Settings className="size-5" />, adminOnly: true },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const hydrated = useHydrated();
  const { token, user, clear } = useAuthStore();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Redirect to login once we know there is no session.
  useEffect(() => {
    if (hydrated && !token) router.replace("/login");
  }, [hydrated, token, router]);

  // Close the mobile drawer on navigation.
  useEffect(() => setMobileOpen(false), [pathname]);

  if (!hydrated || !token || !user) {
    return <div className="min-h-dvh bg-canvas" />;
  }

  const items = NAV.filter((item) => !item.adminOnly || isAdmin(user));

  const isActive = (item: NavItem) =>
    item.exact ? pathname === item.href : pathname.startsWith(item.href);

  function signOut() {
    clear();
    router.replace("/login");
  }

  const nav = (
    <nav className="flex flex-1 flex-col gap-1 px-3">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={cn(
            "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
            isActive(item)
              ? "bg-brand-50 text-brand-600"
              : "text-gray-600 hover:bg-canvas hover:text-ink",
          )}
        >
          {item.icon}
          {item.label}
        </Link>
      ))}
    </nav>
  );

  return (
    <div className="flex min-h-dvh flex-col bg-canvas lg:grid lg:grid-cols-[16rem_1fr]">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh flex-col border-r border-line bg-white lg:flex">
        <Brand />
        {nav}
        <UserFooter name={user.name} role={user.role} onSignOut={signOut} />
      </aside>

      {/* Mobile top bar */}
      <div className="flex items-center justify-between border-b border-line bg-white px-4 py-3 lg:hidden">
        <button onClick={() => setMobileOpen(true)} className="text-ink">
          <Menu className="size-6" />
        </button>
        <span className="font-bold text-brand-600">Junaidi</span>
        <button onClick={signOut} className="text-muted">
          <LogOut className="size-5" />
        </button>
      </div>

      {/* Mobile drawer */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileOpen(false)}
              className="fixed inset-0 z-40 bg-black/30 lg:hidden"
            />
            <motion.aside
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "tween", duration: 0.22 }}
              className="fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-white lg:hidden"
            >
              <div className="flex items-center justify-between px-5 pt-5">
                <Brand compact />
                <button onClick={() => setMobileOpen(false)} className="text-muted">
                  <X className="size-5" />
                </button>
              </div>
              {nav}
              <UserFooter name={user.name} role={user.role} onSignOut={signOut} />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* The content grows to fill the height so the footer sits at the very
          bottom - on a short page it rests on the bottom edge, on a long one it
          follows the content. It never floats up over the page (no fixed). */}
      <main className="flex min-w-0 flex-1 flex-col lg:min-h-dvh">
        <div className="flex-1">{children}</div>
        <AppFooter />
      </main>
    </div>
  );
}

/** Small "Powered by Digitli" strip along the bottom of every screen. */
function AppFooter() {
  return (
    <footer className="mt-6 border-t border-line bg-white px-5 py-3 text-center text-xs text-muted lg:px-8">
      Powered by{" "}
      <a
        href="https://www.digitli.com"
        target="_blank"
        rel="noopener noreferrer"
        className="font-semibold text-ink transition-colors hover:text-brand-600"
      >
        Digitli
      </a>
      <span className="mx-1.5 text-gray-300">·</span>
      <a
        href="https://www.digitli.com"
        target="_blank"
        rel="noopener noreferrer"
        className="transition-colors hover:text-brand-600"
      >
        www.digitli.com
      </a>
      <span className="mx-1.5 text-gray-300">·</span>
      +92 317 2036604
    </footer>
  );
}

function Brand({ compact }: { compact?: boolean }) {
  return (
    <div className={cn("flex items-center gap-3 px-5", compact ? "" : "py-5")}>
      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-500 font-bold text-white">
        J
      </div>
      <div>
        <p className="text-sm font-bold leading-tight text-ink">Junaidi</p>
        <p className="text-xs leading-tight text-muted">Quotations</p>
      </div>
    </div>
  );
}

function UserFooter({ name, role, onSignOut }: { name: string; role: string; onSignOut: () => void }) {
  return (
    <div className="mt-auto flex items-center gap-3 border-t border-line px-4 py-3">
      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-canvas text-sm font-semibold text-ink">
        {name.charAt(0).toUpperCase()}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-ink">{name}</p>
        <p className="text-xs capitalize text-muted">{role}</p>
      </div>
      <button onClick={onSignOut} className="text-muted hover:text-brand-600" title="Sign out">
        <LogOut className="size-5" />
      </button>
    </div>
  );
}

/** A page heading used at the top of each screen. */
export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-white px-5 py-4 lg:px-8">
      <div>
        <h1 className="text-lg font-bold text-ink">{title}</h1>
        {subtitle && <p className="text-sm text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
