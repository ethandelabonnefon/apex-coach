"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Heart,
  Flame,
  Footprints,
  Apple,
  Droplet,
  UserRound,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Logo from "@/components/Logo";

type NavItem = {
  href: string;
  label: string;
  Icon: LucideIcon;
  tone: string;
  /* Icônes remplies façon SF Symbols (app Santé) — false pour celles qui rendent mal en fill */
  filled?: boolean;
};

const NAV: NavItem[] = [
  { href: "/", label: "Overview", Icon: Heart, tone: "var(--accent)", filled: true },
  { href: "/muscu", label: "Muscu", Icon: Flame, tone: "var(--muscu)", filled: true },
  { href: "/running", label: "Running", Icon: Footprints, tone: "var(--running)" },
  { href: "/nutrition", label: "Nutrition", Icon: Apple, tone: "var(--nutrition)", filled: true },
  { href: "/diabete", label: "T1D", Icon: Droplet, tone: "var(--diabete)", filled: true },
];

const SIDEBAR_NAV: NavItem[] = [
  ...NAV,
  { href: "/profil", label: "Profil", Icon: UserRound, tone: "var(--text-secondary)" },
];

function useActive(href: string) {
  const pathname = usePathname();
  return pathname === href || (href !== "/" && pathname.startsWith(href));
}

function ActiveDot({ color }: { color: string }) {
  return (
    <span
      aria-hidden
      className="absolute -top-0.5 left-1/2 h-[3px] w-6 -translate-x-1/2 rounded-full"
      style={{ background: color, boxShadow: `0 0 10px ${color}` }}
    />
  );
}

function SidebarLink({ item }: { item: NavItem }) {
  const active = useActive(item.href);
  const { Icon } = item;
  return (
    <Link
      href={item.href}
      className="group relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors"
      style={{
        color: active ? item.tone : "var(--text-secondary)",
        background: active ? "var(--accent-subtle)" : "transparent",
      }}
    >
      {active && (
        <span
          aria-hidden
          className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r"
          style={{ background: item.tone }}
        />
      )}
      <Icon
        size={18}
        strokeWidth={active ? 2.25 : 1.75}
        fill={item.filled ? "currentColor" : "none"}
        className="transition-transform group-hover:scale-110"
      />
      <span className={active ? "font-medium" : ""}>{item.label}</span>
    </Link>
  );
}

function BottomNavLink({ item }: { item: NavItem }) {
  const active = useActive(item.href);
  const { Icon } = item;
  return (
    <Link
      href={item.href}
      className="relative flex flex-1 flex-col items-center justify-center gap-1 py-2 touch-target tap-scale"
      style={{ color: active ? item.tone : "var(--text-tertiary)" }}
    >
      {active && <ActiveDot color={item.tone} />}
      <Icon size={22} strokeWidth={active ? 2.25 : 1.75} fill={item.filled ? "currentColor" : "none"} />
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
      <aside className="hidden lg:flex fixed top-0 left-0 h-full w-60 flex-col bg-bg-primary border-r border-border-subtle z-50">
        {/* Logo block */}
        <div className="px-5 pt-6 pb-4">
          <Logo size={28} withWordmark tagline="Precision Coach" />
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 space-y-0.5 overflow-y-auto scrollbar-hide">
          <p className="label px-3 mb-2 mt-2">Modules</p>
          {SIDEBAR_NAV.map((item) => (
            <SidebarLink key={item.href} item={item} />
          ))}
        </nav>

        {/* User block */}
        <Link
          href="/profil"
          className="mx-3 mb-4 p-3 rounded-lg bg-bg-secondary hover:bg-bg-tertiary transition-colors flex items-center gap-3"
        >
          <div
            className="h-9 w-9 rounded-full flex items-center justify-center text-sm font-semibold"
            style={{ background: "var(--accent-2-subtle)", color: "var(--accent-2)" }}
          >
            E
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">Ethan</p>
            <p className="text-[11px] text-text-tertiary">T1D · 21y</p>
          </div>
        </Link>
      </aside>

      {/* ============ Header mobile ============ */}
      <header className="lg:hidden sticky top-0 z-40 glass px-4 py-3 pt-safe">
        <div className="flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <Logo size={24} withWordmark />
          </Link>
          <Link
            href="/profil"
            className="h-9 w-9 rounded-full flex items-center justify-center bg-bg-secondary touch-target"
            aria-label="Profil"
          >
            <UserRound size={16} className="text-text-secondary" />
          </Link>
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
