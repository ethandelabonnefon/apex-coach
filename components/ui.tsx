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
          <p className="text-[10px] sm:text-xs text-text-tertiary uppercase tracking-wider mb-1">{label}</p>
          <p className={`text-xl sm:text-2xl font-bold ${color}`}>
            {value}
            {unit && <span className="text-[10px] sm:text-sm font-normal text-text-tertiary ml-1">{unit}</span>}
          </p>
          {sub && <p className="text-[10px] sm:text-xs text-text-tertiary mt-1">{sub}</p>}
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
    green: "bg-[var(--success)]/15 text-[var(--success)]",
    blue: "bg-[var(--chart-2)]/15 text-[var(--chart-2)]",
    purple: "bg-[var(--accent-2)]/15 text-[var(--accent-2)]",
    orange: "bg-[var(--warning)]/15 text-[var(--warning)]",
    red: "bg-[var(--error)]/15 text-[var(--error)]",
    gray: "bg-bg-hover text-text-secondary",
  };
  return <span className={`badge ${colors[color]}`}>{children}</span>;
}

export function ProgressBar({
  value,
  max,
  color = "var(--success)",
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
        <div className="flex justify-between text-xs text-text-tertiary mb-1">
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
        {subtitle && <p className="text-text-tertiary text-xs sm:text-sm mt-1">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function GlucoseIndicator({ value }: { value: number }) {
  let color = "text-[var(--success)]";
  let bg = "bg-[var(--success)]/15";
  let label = "Normal";
  if (value < 70) {
    color = "text-[var(--error)]";
    bg = "bg-[var(--error)]/15";
    label = "Hypo";
  } else if (value > 180) {
    color = "text-[var(--warning)]";
    bg = "bg-[var(--warning)]/15";
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
      <p className="text-text-secondary font-medium">{title}</p>
      <p className="text-text-tertiary text-sm mt-1">{description}</p>
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
    secondary: "bg-bg-hover text-text-primary hover:bg-bg-hover border border-border-subtle",
    ghost: "text-text-secondary hover:text-text-primary hover:bg-bg-hover",
    danger: "bg-[var(--error)]/15 text-[var(--error)] hover:bg-[var(--error)]/25",
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
    info: "bg-[var(--chart-2)]/10 border-[var(--chart-2)]/20 text-[var(--chart-2)]",
    warning: "bg-[var(--warning)]/10 border-[var(--warning)]/20 text-[var(--warning)]",
    success: "bg-[var(--success)]/10 border-[var(--success)]/20 text-[var(--success)]",
    danger: "bg-[var(--error)]/10 border-[var(--error)]/20 text-[var(--error)]",
  };
  return (
    <div className={`p-4 rounded-xl border text-sm ${styles[variant]}`}>
      {children}
    </div>
  );
}
