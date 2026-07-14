"use client";

import { Badge } from "@/components/ui";

export type DiagnosticTab = "morphologie" | "musculation" | "running";

interface DiagnosticTabsProps {
  active: DiagnosticTab;
  onChange: (tab: DiagnosticTab) => void;
  morphoCompleted: boolean;
  muscuCompleted: boolean;
  runningCompleted: boolean;
}

const TABS: { id: DiagnosticTab; label: string; icon: string }[] = [
  { id: "morphologie", label: "Morphologie", icon: "🧍" },
  { id: "musculation", label: "Musculation", icon: "💪" },
  { id: "running", label: "Running", icon: "🏃" },
];

function StatusIcon({ completed }: { completed: boolean }) {
  if (completed) return <span className="text-[10px]">✅</span>;
  return <span className="text-[10px]">❌</span>;
}

export default function DiagnosticTabs({ active, onChange, morphoCompleted, muscuCompleted, runningCompleted }: DiagnosticTabsProps) {
  const statuses: Record<DiagnosticTab, boolean> = {
    morphologie: morphoCompleted,
    musculation: muscuCompleted,
    running: runningCompleted,
  };

  return (
    <div className="flex gap-2 mb-6">
      {TABS.map((tab) => {
        const isActive = active === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all border ${
              isActive
                ? "bg-[var(--success)]/10 border-[var(--success)]/30 text-[var(--success)]"
                : "bg-bg-hover border-border-subtle text-text-secondary hover:bg-bg-hover hover:text-text-secondary"
            }`}
          >
            <span>{tab.icon}</span>
            <span className="hidden sm:inline">{tab.label}</span>
            <StatusIcon completed={statuses[tab.id]} />
          </button>
        );
      })}
    </div>
  );
}
