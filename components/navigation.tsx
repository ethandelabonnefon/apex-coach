"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: "⚡" },
  { href: "/diagnostic", label: "Diagnostic", icon: "🔬" },
  { href: "/diabete", label: "Diabete", icon: "💉" },
  { href: "/nutrition", label: "Nutrition", icon: "🥗" },
  { href: "/muscu", label: "Muscu", icon: "🏋️" },
  { href: "/running", label: "Running", icon: "🏃" },
  { href: "/profil", label: "Profil", icon: "👤" },
];

export function Navigation() {
  const pathname = usePathname();

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex fixed top-0 left-0 h-full w-64 flex-col bg-[#12121a] border-r border-white/[0.06] z-50">
        <div className="p-6 border-b border-white/[0.06]">
          <h1 className="text-xl font-bold">
            <span className="neon-green">APEX</span>{" "}
            <span className="text-white/60">Coach</span>
          </h1>
          <p className="text-xs text-white/35 mt-1">Fitness · Nutrition · T1D</p>
        </div>
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto scrollbar-hide">
          {NAV_ITEMS.map((item) => {
            const isActive = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm transition-all ${
                  isActive
                    ? "bg-[#00ff94]/10 text-[#00ff94] font-medium"
                    : "text-white/50 hover:text-white/80 hover:bg-white/[0.03]"
                }`}
              >
                <span className="text-base">{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="p-4 border-t border-white/[0.06]">
          <div className="flex items-center gap-3 px-4 py-2">
            <div className="w-8 h-8 rounded-full bg-[#00ff94]/20 flex items-center justify-center text-sm font-bold text-[#00ff94]">E</div>
            <div>
              <p className="text-sm font-medium">Ethan</p>
              <p className="text-xs text-white/35">T1D · 21 ans</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Mobile header */}
      <header className="lg:hidden sticky top-0 z-40 bg-[#12121a]/95 backdrop-blur-xl border-b border-white/[0.06] px-4 py-3">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-bold">
            <span className="neon-green">APEX</span>{" "}
            <span className="text-white/60">Coach</span>
          </h1>
          <Link href="/profil" className="p-2 text-white/40 hover:text-white transition-colors">
            <span className="text-xl">👤</span>
          </Link>
        </div>
      </header>

      {/* Mobile bottom nav */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-[#12121a]/95 backdrop-blur-xl border-t border-white/[0.06] z-50">
        <div className="flex justify-around py-2 pb-safe">
          {NAV_ITEMS.slice(0, 5).map((item) => {
            const isActive = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex flex-col items-center gap-1 px-3 py-1.5 rounded-lg text-xs transition-colors touch-target ${
                  isActive ? "text-[#00ff94]" : "text-white/40"
                }`}
              >
                <span className="text-lg">{item.icon}</span>
                <span className="text-[10px]">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
