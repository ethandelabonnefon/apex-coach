"use client";

import React from "react";

// ============================================
// Shared UI Components
// ============================================

export function Card({
  children,
  className = "",
  glow,
}: {
  children: React.ReactNode;
  className?: string;
  glow?: "green" | "blue" | "purple" | "orange";
}) {
  const glowClass = glow ? `glow-${glow}` : "";
  return (
    <div className={`card p-5 ${glowClass} ${className}`}>
      {children}
    </div>
  );
}

export function StatCard({
  label,
  value,
  unit,
  sub,
  color = "text-text-primary",
  icon,
}: {
  label: string;
  value: string | number;
  unit?: string;
  sub?: string;
  color?: string;
  icon?: string;
}) {
  return (
    <Card className="!p-3 sm:!p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[10px] sm:text-xs text-black/40 uppercase tracking-wider mb-1">{label}</p>
          <p className={`text-xl sm:text-2xl font-bold ${color}`}>
            {value}
            {unit && <span className="text-[10px] sm:text-sm font-normal text-black/40 ml-1">{unit}</span>}
          </p>
          {sub && <p className="text-[10px] sm:text-xs text-black/35 mt-1">{sub}</p>}
        </div>
        {icon && <span className="text-xl sm:text-2xl opacity-60">{icon}</span>}
      </div>
    </Card>
  );
}

export function Badge({
  children,
  color = "green",
}: {
  children: React.ReactNode;
  color?: "green" | "blue" | "purple" | "orange" | "red" | "gray";
}) {
  const colors: Record<string, string> = {
    green: "bg-[#34c759]/15 text-[#34c759]",
    blue: "bg-[#32ade6]/15 text-[#32ade6]",
    purple: "bg-[#af52de]/15 text-[#af52de]",
    orange: "bg-[#ff9500]/15 text-[#ff9500]",
    red: "bg-[#ff3b30]/15 text-[#ff3b30]",
    gray: "bg-black/10 text-black/60",
  };
  return <span className={`badge ${colors[color]}`}>{children}</span>;
}

export function ProgressBar({
  value,
  max,
  color = "#34c759",
  label,
  showValue = true,
}: {
  value: number;
  max: number;
  color?: string;
  label?: string;
  showValue?: boolean;
}) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div>
      {(label || showValue) && (
        <div className="flex justify-between text-xs text-black/40 mb-1">
          {label && <span>{label}</span>}
          {showValue && (
            <span>
              {value}/{max}
            </span>
          )}
        </div>
      )}
      <div className="progress-bar">
        <div className="progress-bar-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-6 sm:mb-8">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold">{title}</h1>
        {subtitle && <p className="text-black/40 text-xs sm:text-sm mt-1">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function GlucoseIndicator({ value }: { value: number }) {
  let color = "text-[#34c759]";
  let bg = "bg-[#34c759]/15";
  let label = "Normal";
  if (value < 70) {
    color = "text-[#ff3b30]";
    bg = "bg-[#ff3b30]/15";
    label = "Hypo";
  } else if (value > 180) {
    color = "text-[#ff9500]";
    bg = "bg-[#ff9500]/15";
    label = value > 250 ? "Très élevé" : "Élevé";
  }
  return (
    <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full ${bg}`}>
      <div className={`w-2 h-2 rounded-full ${color.replace("text-", "bg-")} animate-pulse-glow`} />
      <span className={`text-sm font-medium ${color}`}>{value} mg/dL</span>
      <span className={`text-xs ${color} opacity-70`}>{label}</span>
    </div>
  );
}

export function EmptyState({ icon, title, description }: { icon: string; title: string; description: string }) {
  return (
    <div className="text-center py-12">
      <span className="text-4xl mb-4 block">{icon}</span>
      <p className="text-black/60 font-medium">{title}</p>
      <p className="text-black/35 text-sm mt-1">{description}</p>
    </div>
  );
}

export function Button({
  children,
  onClick,
  variant = "primary",
  size = "md",
  className = "",
  disabled = false,
  type = "button",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  className?: string;
  disabled?: boolean;
  type?: "button" | "submit";
}) {
  const variants: Record<string, string> = {
    primary: "bg-accent text-white hover:bg-accent-hover font-semibold",
    secondary: "bg-black/[0.06] text-text-primary hover:bg-black/[0.1] border border-black/[0.06]",
    ghost: "text-black/60 hover:text-text-primary hover:bg-black/[0.05]",
    danger: "bg-[#ff3b30]/15 text-[#ff3b30] hover:bg-[#ff3b30]/25",
  };
  const sizes: Record<string, string> = {
    sm: "px-3 py-1.5 text-xs rounded-lg",
    md: "px-4 py-2 text-sm rounded-xl",
    lg: "px-6 py-3 text-base rounded-xl",
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={{ touchAction: "manipulation", WebkitTapHighlightColor: "transparent" }}
      className={`inline-flex items-center justify-center gap-2 transition-all cursor-pointer select-none ${variants[variant]} ${sizes[size]} ${
        disabled ? "opacity-40 cursor-not-allowed" : ""
      } ${className}`}
    >
      {children}
    </button>
  );
}

export function SectionTitle({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <h2 className={`text-lg font-semibold mb-4 ${className}`}>{children}</h2>;
}

export function InfoBox({
  children,
  variant = "info",
}: {
  children: React.ReactNode;
  variant?: "info" | "warning" | "success" | "danger";
}) {
  const styles: Record<string, string> = {
    info: "bg-[#32ade6]/10 border-[#32ade6]/20 text-[#32ade6]",
    warning: "bg-[#ff9500]/10 border-[#ff9500]/20 text-[#ff9500]",
    success: "bg-[#34c759]/10 border-[#34c759]/20 text-[#34c759]",
    danger: "bg-[#ff3b30]/10 border-[#ff3b30]/20 text-[#ff3b30]",
  };
  return (
    <div className={`p-4 rounded-xl border text-sm ${styles[variant]}`}>
      {children}
    </div>
  );
}
