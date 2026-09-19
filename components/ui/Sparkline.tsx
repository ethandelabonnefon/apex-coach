"use client";

import { cn } from "@/lib/utils";

export interface SparklineProps {
  data: number[];
  color?: string;
  fill?: boolean;
  height?: number;
  width?: number;
  strokeWidth?: number;
  className?: string;
  label?: string;
}

export function Sparkline({
  data,
  color = "var(--accent)",
  fill = true,
  height = 36,
  width = 120,
  strokeWidth = 1.5,
  className,
  label,
}: SparklineProps) {
  if (data.length < 2) {
    return (
      <div
        className={cn("flex items-center text-xs text-text-tertiary", className)}
        style={{ height, width }}
      >
        —
      </div>
    );
  }

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const stepX = width / (data.length - 1);

  const points = data.map((v, i) => {
    const x = i * stepX;
    const y = height - ((v - min) / range) * height;
    return [x, y] as const;
  });

  const line = points.map(([x, y], i) => `${i === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`).join(" ");
  const area = `${line} L ${width} ${height} L 0 ${height} Z`;

  const last = points[points.length - 1];
  const gradId = `spark-grad-${color.replace(/[^a-z0-9]/gi, "")}`;

  return (
    <div className={cn("inline-flex flex-col gap-1", className)}>
      {label && <span className="label">{label}</span>}
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="overflow-visible"
        aria-hidden
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.28" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {fill && <path d={area} fill={`url(#${gradId})`} />}
        <path
          d={line}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx={last[0]} cy={last[1]} r={2.5} fill={color} />
      </svg>
    </div>
  );
}
