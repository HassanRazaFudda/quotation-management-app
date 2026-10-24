"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  BedDouble,
  CalendarDays,
  ChartColumn,
  Coins,
  FileText,
  LayoutDashboard,
  ListChecks,
  Luggage,
  LogOut,
  Menu,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  Plane,
  Plus,
  Ruler,
  SlidersHorizontal,
  Tags,
  Tent,
  Users,
  Wallet,
  X,
} from "lucide-react";

import { cn } from "@/lib/cn";
import { useHydrated } from "@/lib/useHydrated";
import { isAdmin, useAuthStore } from "@/stores/auth";
import { useUiStore } from "@/stores/ui";

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  adminOnly?: boolean;
  /** Active only on exactly this path, not on pages beneath it. */
  exact?: boolean;
  /** Pages under `href` that belong to a different item, so this one is not lit for them. */
  except?: string[];
}

interface NavGroup {
  /** Heading above the group; the first group has none. */
  label?: string;
  items: NavItem[];
}

const icon = "size-5";

/**
 * The menu, grouped by what staff are doing rather than by what the page is:
 * day-to-day work first (one block per quotation type, with its own list,
 * "new" and supporting pages), then the admin-only setup behind them.
 * A group with nothing visible to the signed-in user is left out.
 */
const NAV: NavGroup[] = [
  {
    items: [{ href: "/", label: "Dashboard", icon: <LayoutDashboard className={icon} />, exact: true }],
  },
  {
    label: "Hajj",
    items: [
      { href: "/quotations", label: "Quotations", icon: <FileText className={icon} />, except: ["/quotations/new"] },
      { href: "/quotations/new", label: "New Quotation", icon: <Plus className={icon} />, exact: true },
      { href: "/packages", label: "Packages", icon: <Package className={icon} /> },
      { href: "/payments", label: "Payments", icon: <Wallet className={icon} /> },
    ],
  },
  {
    label: "Umrah",
    items: [
      {
        href: "/umrah-quotations",
        label: "Quotations",
        icon: <Luggage className={icon} />,
        except: ["/umrah-quotations/new"],
      },
      { href: "/umrah-quotations/new", label: "New Quotation", icon: <Plus className={icon} />, exact: true },
      { href: "/admin/umrah-settings", label: "Settings", icon: <SlidersHorizontal className={icon} />, adminOnly: true },
    ],
  },
  {
    label: "Hajj setup",
    items: [
      { href: "/admin/blocks", label: "Date Blocks", icon: <CalendarDays className={icon} />, adminOnly: true },
      { href: "/admin/hotels", label: "Hotels", icon: <BedDouble className={icon} />, adminOnly: true },
      { href: "/admin/room-sizes", label: "Room Sizes", icon: <Ruler className={icon} />, adminOnly: true },
      { href: "/admin/mina-tiers", label: "Mina Tiers", icon: <Tent className={icon} />, adminOnly: true },
      { href: "/admin/rates", label: "Rates", icon: <Tags className={icon} />, adminOnly: true },
      { href: "/admin/flights", label: "Flights", icon: <Plane className={icon} />, adminOnly: true },
      { href: "/admin/services", label: "Services", icon: <ListChecks className={icon} />, adminOnly: true },
    ],
  },
  {
    label: "Administration",
    items: [
      { href: "/admin/currencies", label: "Currencies", icon: <Coins className={icon} />, adminOnly: true },
      { href: "/admin/users", label: "Users", icon: <Users className={icon} />, adminOnly: true },
      { href: "/admin/reports", label: "Reports", icon: <ChartColumn className={icon} />, adminOnly: true },
    ],
  },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const hydrated = useHydrated();
  const { token, user, clear } = useAuthStore();
  const collapsed = useUiStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);
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

  const groups = NAV.map((group) => ({
    ...group,
    items: group.items.filter((item) => !item.adminOnly || isAdmin(user)),
  })).filter((group) => group.items.length > 0);

  const isActive = (item: NavItem) => {
    if (item.exact) return pathname === item.href;
    if (item.except?.some((path) => pathname === path || pathname.startsWith(`${path}/`))) return false;
    return pathname === item.href || pathname.startsWith(`${item.href}/`);
  };

  function signOut() {
    clear();
    router.replace("/login");
  }

  /**
   * The menu. `rail` is the collapsed icon-only form (desktop only): labels
   * move to the tooltip, and group headings shrink to a divider.
   */
  const renderNav = (rail: boolean) => (
    // min-h-0 + overflow lets a long menu scroll on its own, so the user footer
    // (name, sign out) stays on screen on a short window instead of being pushed off it.
    <nav className={cn(
        "flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto pb-3",
        // The narrow rail has no room for a scrollbar track; it still scrolls.
        rail ? "px-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" : "px-3",
      )} aria-label="Main">
      {groups.map((group, index) => (
        <div key={group.label ?? "top"} className="flex flex-col gap-1">
          {group.label &&
            (rail ? (
              <div className="mx-2 my-2 border-t border-line" />
            ) : (
              <p className={cn("px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-gray-400", index === 0 ? "pt-0" : "pt-4")}>
                {group.label}
              </p>
            ))}
          {group.items.map((item) => {
            const active = isActive(item);
            // In the rail a bare "Quotations" says nothing about which type, so
            // the tooltip carries the group too.
            const title = group.label ? `${group.label} · ${item.label}` : item.label;
            return (
              <Link
                key={item.href}
                href={item.href}
                title={rail ? title : undefined}
                aria-label={rail ? title : undefined}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center rounded-lg text-sm font-medium transition-colors",
                  rail ? "justify-center px-0 py-2.5" : "gap-3 px-3 py-2.5",
                  active ? "bg-brand-50 text-brand-600" : "text-gray-600 hover:bg-canvas hover:text-ink",
                )}
              >
                {item.icon}
                {!rail && <span className="truncate">{item.label}</span>}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );

  return (
    <div
      className={cn(
        "flex min-h-dvh flex-col bg-canvas lg:grid lg:transition-[grid-template-columns] lg:duration-200",
        collapsed ? "lg:grid-cols-[4.5rem_1fr]" : "lg:grid-cols-[16rem_1fr]",
      )}
    >
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh flex-col overflow-hidden border-r border-line bg-white lg:flex">
        <Brand rail={collapsed} onToggle={toggleSidebar} />
        {renderNav(collapsed)}
        <UserFooter name={user.name} role={user.role} onSignOut={signOut} rail={collapsed} />
      </aside>

      {/* Mobile top bar */}
      <div className="flex items-center justify-between border-b border-line bg-white px-4 py-3 lg:hidden">
        <button onClick={() => setMobileOpen(true)} className="text-ink" aria-label="Open menu">
          <Menu className="size-6" />
        </button>
        <span className="font-bold text-brand-600">Junaidi</span>
        <button onClick={signOut} className="text-muted" aria-label="Sign out">
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
                <button onClick={() => setMobileOpen(false)} className="text-muted" aria-label="Close menu">
                  <X className="size-5" />
                </button>
              </div>
              <div className="h-3" />
              {renderNav(false)}
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
        href="tel:+923172036604"
        target="_blank"
        rel="noopener noreferrer"
        className="transition-colors hover:text-brand-600"
      >
        +92 317 2036604
      </a>
    </footer>
  );
}

function Brand({ compact, rail, onToggle }: { compact?: boolean; rail?: boolean; onToggle?: () => void }) {
  const logo = (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-500 font-bold text-white">J</div>
  );

  // The collapsed rail: just the mark, with the expand control under it.
  if (rail) {
    return (
      <div className="flex flex-col items-center gap-2 py-4">
        {logo}
        <button
          onClick={onToggle}
          className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-canvas hover:text-ink"
          title="Expand sidebar"
          aria-label="Expand sidebar"
          aria-expanded={false}
        >
          <PanelLeftOpen className="size-5" />
        </button>
      </div>
    );
  }

  return (
    <div className={cn("flex items-center gap-3 px-5", compact ? "" : "py-5")}>
      {logo}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold leading-tight text-ink">Junaidi</p>
        <p className="text-xs leading-tight text-muted">Quotations</p>
      </div>
      {onToggle && (
        <button
          onClick={onToggle}
          className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-canvas hover:text-ink"
          title="Collapse sidebar"
          aria-label="Collapse sidebar"
          aria-expanded
        >
          <PanelLeftClose className="size-5" />
        </button>
      )}
    </div>
  );
}

function UserFooter({
  name,
  role,
  onSignOut,
  rail,
}: {
  name: string;
  role: string;
  onSignOut: () => void;
  rail?: boolean;
}) {
  const avatar = (
    <div
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-canvas text-sm font-semibold text-ink"
      title={rail ? `${name} (${role})` : undefined}
    >
      {name.charAt(0).toUpperCase()}
    </div>
  );

  if (rail) {
    return (
      <div className="mt-auto flex flex-col items-center gap-2 border-t border-line py-3">
        {avatar}
        <button onClick={onSignOut} className="text-muted hover:text-brand-600" title="Sign out" aria-label="Sign out">
          <LogOut className="size-5" />
        </button>
      </div>
    );
  }

  return (
    <div className="mt-auto flex items-center gap-3 border-t border-line px-4 py-3">
      {avatar}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-ink">{name}</p>
        <p className="text-xs capitalize text-muted">{role}</p>
      </div>
      <button onClick={onSignOut} className="text-muted hover:text-brand-600" title="Sign out" aria-label="Sign out">
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
