"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  CalendarDays,
  Footprints,
  Apple,
  Droplet,
  UserRound,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Logo from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";

type NavItem = {
  href: string;
  label: string;
  Icon: LucideIcon;
};

/* Brand v5 "Instrument" : icônes au trait, onglet actif en cobalt
   (--accent) quel que soit le module — la couleur de catégorie reste un
   code de données dans les pages, pas un signal de navigation. */
const NAV: NavItem[] = [
  { href: "/", label: "Overview", Icon: LayoutDashboard },
  { href: "/muscu", label: "Séances", Icon: CalendarDays },
  { href: "/running", label: "Running", Icon: Footprints },
  { href: "/nutrition", label: "Nutrition", Icon: Apple },
  { href: "/diabete", label: "T1D", Icon: Droplet },
];

const SIDEBAR_NAV: NavItem[] = [
  ...NAV,
  { href: "/profil", label: "Profil", Icon: UserRound },
];

function useActive(href: string) {
  const pathname = usePathname();
  return pathname === href || (href !== "/" && pathname.startsWith(href));
}

function ActiveBar() {
  return (
    <span
      aria-hidden
      className="absolute top-0 left-1/2 h-[2px] w-8 -translate-x-1/2"
      style={{ background: "var(--accent)" }}
    />
  );
}

function SidebarLink({ item }: { item: NavItem }) {
  const active = useActive(item.href);
  const { Icon } = item;
  return (
    <Link
      href={item.href}
      className="group relative flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors hover:bg-bg-hover"
      style={{
        color: active ? "var(--accent)" : "var(--text-secondary)",
        background: active ? "var(--accent-subtle)" : undefined,
      }}
    >
      <Icon size={18} strokeWidth={active ? 2 : 1.75} />
      <span className={active ? "font-semibold" : "font-medium"}>{item.label}</span>
    </Link>
  );
}

function BottomNavLink({ item }: { item: NavItem }) {
  const active = useActive(item.href);
  const { Icon } = item;
  return (
    <Link
      href={item.href}
      className="relative flex flex-1 flex-col items-center justify-center gap-1 py-2 touch-target"
      style={{ color: active ? "var(--accent)" : "var(--text-tertiary)" }}
    >
      {active && <ActiveBar />}
      <Icon size={22} strokeWidth={active ? 2 : 1.7} />
      <span
        className="text-[10px] leading-none tracking-wide"
        style={{ fontWeight: active ? 600 : 500 }}
      >
        {item.label}
      </span>
    </Link>
  );
}

export function Navigation() {
  return (
    <>
      {/* ============ Sidebar desktop ============ */}
      <aside className="hidden lg:flex fixed top-0 left-0 h-full w-60 flex-col bg-bg-secondary border-r border-border-default z-50">
        {/* Logo block */}
        <div className="px-5 pt-6 pb-4">
          <Logo size={28} withWordmark tagline="Tableau de bord" />
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 space-y-0.5 overflow-y-auto scrollbar-hide">
          <p className="label px-3 mb-2 mt-2">Modules</p>
          {SIDEBAR_NAV.map((item) => (
            <SidebarLink key={item.href} item={item} />
          ))}
        </nav>

        {/* Theme toggle */}
        <div className="mx-3 mb-2 flex items-center justify-between px-1">
          <span className="label">Thème</span>
          <ThemeToggle />
        </div>

        {/* User block */}
        <Link
          href="/profil"
          className="mx-3 mb-4 p-3 rounded-lg border border-border-default hover:bg-bg-hover transition-colors flex items-center gap-3"
        >
          <div
            className="h-9 w-9 rounded-md flex items-center justify-center text-sm font-semibold font-mono"
            style={{ background: "var(--bg-tertiary)", color: "var(--text-secondary)" }}
          >
            E
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">Ethan</p>
            <p className="text-[11px] text-text-tertiary font-mono">T1D</p>
          </div>
        </Link>
      </aside>

      {/* ============ Header mobile ============ */}
      <header className="lg:hidden sticky top-0 z-40 glass px-4 py-3 pt-safe">
        <div className="flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <Logo size={24} withWordmark />
          </Link>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Link
              href="/profil"
              className="h-9 w-9 rounded-md flex items-center justify-center border border-border-default bg-bg-secondary touch-target"
              aria-label="Profil"
            >
              <UserRound size={16} className="text-text-secondary" />
            </Link>
          </div>
        </div>
      </header>

      {/* ============ Bottom nav mobile ============ */}
      <nav
        className="lg:hidden fixed bottom-0 left-0 right-0 z-50 glass pb-safe"
        aria-label="Navigation principale"
      >
        <div className="flex items-stretch px-2">
          {NAV.map((item) => (
            <BottomNavLink key={item.href} item={item} />
          ))}
        </div>
      </nav>
    </>
  );
}
