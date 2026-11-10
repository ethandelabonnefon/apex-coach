"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, History, Stethoscope, SlidersHorizontal, Syringe } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Logo from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";

/**
 * Navigation — app recentrée sur le diabète (nov. 2026).
 *
 * Quatre écrans, nommés par ce qu'on y fait :
 *   Suivi       maintenant : glycémie, doses, alertes
 *   Historique  ce qui s'est passé : courbes, statistiques, validation des doses
 *   Docteur     demander un avis
 *   Réglages    ratios, lente, capteur, sauvegarde
 *
 * Et UN geste, sorti des onglets parce qu'il se fait quatre fois par jour :
 * le bolus. Le bouton central amène au calculateur depuis n'importe quel
 * écran, d'un seul appui du pouce, sans avoir à faire défiler la page Suivi.
 *
 * Règles (BRAND.md) : onglet actif en cobalt, icônes au trait, pas de
 * capsule. Le bouton Bolus est le seul aplat anthracite de la barre — c'est
 * l'action primaire, pas une destination.
 */

type NavItem = {
  href: string;
  label: string;
  Icon: LucideIcon;
  /** Chemins qui allument cet onglet. */
  match: (pathname: string) => boolean;
};

const NAV: NavItem[] = [
  {
    href: "/diabete",
    label: "Suivi",
    Icon: Activity,
    match: (p) => p === "/" || p === "/diabete",
  },
  {
    href: "/diabete/historique",
    label: "Historique",
    Icon: History,
    match: (p) => p.startsWith("/diabete/historique"),
  },
  {
    href: "/diabete/docteur",
    label: "Docteur",
    Icon: Stethoscope,
    match: (p) => p.startsWith("/diabete/docteur"),
  },
  {
    href: "/diabete/parametres",
    label: "Réglages",
    Icon: SlidersHorizontal,
    match: (p) => p.startsWith("/diabete/parametres") || p.startsWith("/whoop"),
  },
];

/** Ancre du calculateur de bolus sur la page Suivi. */
export const BOLUS_HREF = "/diabete#bolus";

function ActiveBar() {
  return (
    <span
      aria-hidden
      className="absolute top-0 left-1/2 h-[2px] w-8 -translate-x-1/2"
      style={{ background: "var(--accent)" }}
    />
  );
}

function SidebarLink({ item, active }: { item: NavItem; active: boolean }) {
  const { Icon } = item;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
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

function BottomNavLink({ item, active }: { item: NavItem; active: boolean }) {
  const { Icon } = item;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
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
  const pathname = usePathname() ?? "/";
  const [suivi, historique, docteur, reglages] = NAV;

  return (
    <>
      {/* ============ Sidebar desktop ============ */}
      <aside className="hidden lg:flex fixed top-0 left-0 h-full w-60 flex-col bg-bg-secondary border-r border-border-default z-50">
        <div className="px-5 pt-6 pb-4">
          <Logo size={28} withWordmark tagline="Diabète T1" />
        </div>

        <div className="px-3 pb-3">
          <Link
            href={BOLUS_HREF}
            className="flex h-11 items-center justify-center gap-2 rounded-lg text-sm font-semibold transition-opacity hover:opacity-90"
            style={{ background: "var(--text-primary)", color: "var(--bg-secondary)" }}
          >
            <Syringe size={16} strokeWidth={2} />
            Calculer un bolus
          </Link>
        </div>

        <nav className="flex-1 px-3 space-y-0.5 overflow-y-auto scrollbar-hide" aria-label="Navigation principale">
          {NAV.map((item) => (
            <SidebarLink key={item.href} item={item} active={item.match(pathname)} />
          ))}
        </nav>

        <div className="mx-3 mb-4 flex items-center justify-between px-1">
          <span className="label">Thème</span>
          <ThemeToggle />
        </div>
      </aside>

      {/* ============ Barre mobile ============ */}
      <nav
        className="lg:hidden fixed bottom-0 left-0 right-0 z-50 glass pb-safe"
        aria-label="Navigation principale"
      >
        <div className="flex items-stretch px-1">
          <BottomNavLink item={suivi} active={suivi.match(pathname)} />
          <BottomNavLink item={historique} active={historique.match(pathname)} />

          {/* Action primaire : le bolus, au centre, sous le pouce. */}
          <div className="flex flex-1 items-center justify-center py-1.5">
            <Link
              href={BOLUS_HREF}
              aria-label="Calculer un bolus"
              className="nav-action tap-scale"
            >
              <Syringe size={20} strokeWidth={2} />
              <span>Bolus</span>
            </Link>
          </div>

          <BottomNavLink item={docteur} active={docteur.match(pathname)} />
          <BottomNavLink item={reglages} active={reglages.match(pathname)} />
        </div>
      </nav>
    </>
  );
}
