"use client";

/**
 * Bilan automatique (fable-5.2, nov. 2026).
 *
 * Trois lectures, calculées seules à l'ouverture de la page, sans IA et
 * sans bouton à presser :
 *
 *   1. Objectif d'HbA1c — où j'en suis, et ce qui me freine.
 *   2. Lente — à baisser, à monter, ou stable.
 *   3. Doses des repas — les créneaux dont le ratio est à revoir.
 *
 * Les calculs vivent dans `lib/glycemic-goal.ts`, `lib/basal-advisor.ts` et
 * `lib/dose-validation.ts`. Ce composant lit le store, charge la courbe
 * archivée et affiche. La seule écriture possible est la dose de lente, et
 * uniquement sur un clic « Valider » suivi d'une confirmation.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import { useStore } from "@/lib/store";
import { deviceTimeZone } from "@/lib/local-time";
import { Button } from "@/components/ui/Button";
import { analyzeBasal, buildBasalInputs, type BasalAdvice, type DailyStrain } from "@/lib/basal-advisor";
import { assessGoal, DEFAULT_A1C_GOAL, type GoalAssessment } from "@/lib/glycemic-goal";
import {
  analyzeAllSlots,
  formatRatio,
  type SlotAnalysis,
  type SportSession,
} from "@/lib/dose-validation";

interface ArchivePoint {
  t: number;
  value: number;
}

const SLOT_LABELS: Record<string, string> = {
  morning: "Matin",
  lunch: "Midi",
  snack: "Goûter",
  dinner: "Soir",
};

const REFRESH_MS = 10 * 60_000;

function fr(n: number, digits = 1): string {
  return n.toFixed(digits).replace(".", ",");
}

type Led = "green" | "amber" | "red" | "cobalt" | "steel";

function goalLed(goal: GoalAssessment): Led {
  switch (goal.priority) {
    case "hypos-first":
      return "red";
    case "lower-mean":
      return "cobalt";
    case "on-target":
      return "green";
    default:
      return "steel";
  }
}

function basalLed(advice: BasalAdvice): Led {
  switch (advice.status) {
    case "reduce":
      return "red";
    case "increase":
      return "cobalt";
    case "watch":
      return "amber";
    case "ok":
      return "green";
    default:
      return "steel";
  }
}

function Row({
  led,
  title,
  summary,
  open,
  onToggle,
  children,
}: {
  led: Led;
  title: string;
  summary: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="border-t border-border-subtle first:border-t-0">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="w-full flex items-start gap-3 py-3 text-left cursor-pointer select-none"
        style={{ touchAction: "manipulation" }}
      >
        <span className={`led ${led} mt-1.5`} />
        <span className="min-w-0 flex-1">
          <span className="eyebrow block">{title}</span>
          <span className="block text-sm font-semibold text-text-primary mt-0.5">{summary}</span>
        </span>
        <ChevronDown
          className={`w-4 h-4 mt-1 shrink-0 text-text-tertiary transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && <div className="pb-4 pl-[22px] space-y-2">{children}</div>}
    </div>
  );
}

export default function DecisionBoard() {
  const insulinLogs = useStore((s) => s.insulinLogs);
  const carbEntries = useStore((s) => s.carbEntries);
  const profile = useStore((s) => s.profile);
  const diabetesConfig = useStore((s) => s.diabetesConfig);
  const completedWorkouts = useStore((s) => s.completedWorkouts);
  const completedRunningSessions = useStore((s) => s.completedRunningSessions);
  const declaredSportSessions = useStore((s) => s.declaredSportSessions);
  const updateProfile = useStore((s) => s.updateProfile);
  const updateRatioProfile = useStore((s) => s.updateRatioProfile);

  const [points, setPoints] = useState<ArchivePoint[] | null>(null);
  const [archiveError, setArchiveError] = useState(false);
  const [dailyStrain, setDailyStrain] = useState<DailyStrain[] | undefined>(undefined);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [openRow, setOpenRow] = useState<"goal" | "basal" | "ratios" | null>(null);
  const [justApplied, setJustApplied] = useState<number | null>(null);

  // Courbe archivée (90 j : la validation des doses a besoin de profondeur,
  // la lente et l'objectif n'en lisent que les derniers jours).
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/glucose/archive?days=90", { cache: "no-store" });
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as { points?: ArchivePoint[]; warning?: string };
        if (cancelled) return;
        setPoints(Array.isArray(data.points) ? data.points : []);
        setArchiveError(Boolean(data.warning));
        setNowMs(Date.now());
      } catch {
        if (!cancelled) {
          setPoints([]);
          setArchiveError(true);
        }
      }
    }
    load();
    const id = setInterval(load, REFRESH_MS * 3);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  // Charge d'activité Whoop — un éclairage, jamais une condition.
  useEffect(() => {
    let cancelled = false;
    const tz = deviceTimeZone();
    if (!tz) return;
    fetch(`/api/whoop/strain-history?tz=${encodeURIComponent(tz)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { connected?: boolean; days?: DailyStrain[] } | null) => {
        if (cancelled || !data?.connected || !Array.isArray(data.days)) return;
        setDailyStrain(data.days);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const basalChangedAtMs = profile.basalDoseChangedAt
    ? new Date(profile.basalDoseChangedAt).getTime()
    : undefined;

  const basal = useMemo<BasalAdvice | null>(() => {
    if (!points) return null;
    const { boluses, carbEntriesMs } = buildBasalInputs(insulinLogs, carbEntries);
    return analyzeBasal({
      points,
      boluses,
      carbEntriesMs,
      basalDose: profile.basalDose,
      basalChangedAtMs,
      nowMs,
      dailyStrain,
    });
  }, [points, insulinLogs, carbEntries, profile.basalDose, basalChangedAtMs, nowMs, dailyStrain]);

  const goal = useMemo<GoalAssessment | null>(() => {
    if (!points) return null;
    return assessGoal({ points, nowMs, days: 14, goal: DEFAULT_A1C_GOAL });
  }, [points, nowMs]);

  const sportWorkouts = useMemo<SportSession[]>(
    () => [
      ...completedWorkouts.map((w) => ({
        date: w.date,
        durationMin: Math.round(w.duration ?? 60),
        type: "muscu" as const,
      })),
      ...completedRunningSessions.map((r) => ({
        date: r.date,
        durationMin: Math.round(r.actualDuration ?? 45),
        type: "running" as const,
      })),
    ],
    [completedWorkouts, completedRunningSessions],
  );

  const slots = useMemo<SlotAnalysis[] | null>(() => {
    if (!points || points.length === 0) return null;
    return analyzeAllSlots({
      insulinLogs,
      archivePoints: points,
      workouts: sportWorkouts,
      sportSessions: declaredSportSessions,
      ratios: diabetesConfig.ratios,
      ratioChangedAt: profile.ratioChangedAt ?? {},
      basalChangedAt: profile.basalDoseChangedAt,
      nowMs,
    });
  }, [
    points,
    insulinLogs,
    sportWorkouts,
    declaredSportSessions,
    diabetesConfig.ratios,
    profile.ratioChangedAt,
    profile.basalDoseChangedAt,
    nowMs,
  ]);

  // Ce que la validation des doses voyait JUSTE AVANT le dernier changement
  // de lente. Règle voulue : changer la lente remet le compteur des quatre
  // créneaux à zéro (les repas d'avant ont été faits sous un autre fond).
  // On ne revient pas dessus — aucun verdict, aucune proposition ici — mais
  // on ne jette pas non plus ce qui avait été observé : c'est ce qu'il faut
  // surveiller en premier pendant que le compteur se remplit.
  const slotsBeforeBasalChange = useMemo<SlotAnalysis[]>(() => {
    if (!points || points.length === 0 || basalChangedAtMs === undefined) return [];
    if (nowMs - basalChangedAtMs > 14 * 86_400_000) return [];
    return analyzeAllSlots({
      insulinLogs,
      archivePoints: points,
      workouts: sportWorkouts,
      sportSessions: declaredSportSessions,
      ratios: diabetesConfig.ratios,
      ratioChangedAt: profile.ratioChangedAt ?? {},
      nowMs: basalChangedAtMs,
    }).filter((s) => s.hypoCount >= 2 && s.eligibleCount >= 3);
  }, [
    points,
    insulinLogs,
    sportWorkouts,
    declaredSportSessions,
    diabetesConfig.ratios,
    profile.ratioChangedAt,
    basalChangedAtMs,
    nowMs,
  ]);

  const slotsToReview = (slots ?? []).filter(
    (s) => s.verdict === "over-bolus" || s.verdict === "under-bolus",
  );
  const slotsJudged = (slots ?? []).filter((s) => s.verdict !== "insufficient-data");

  // La ligne qui demande une action s'ouvre d'elle-même, une seule fois.
  const basalActionable = basal?.status === "reduce" || basal?.status === "increase";
  useEffect(() => {
    if (basalActionable) setOpenRow((cur) => cur ?? "basal");
  }, [basalActionable]);

  function applyBasal(advice: BasalAdvice) {
    if (advice.proposedDose === null) return;
    const ok = confirm(
      `Passer ta lente de ${advice.currentDose} U à ${advice.proposedDose} U ?\n\n` +
        "Le changement s'applique à ta prochaine injection de lente. " +
        "En cas de doute, valide avec ton diabétologue.",
    );
    if (!ok) return;
    // Même écriture que Paramètres et Le Docteur : le profil de ratios actif
    // ET le profil utilisateur, pour que les deux écrans restent d'accord.
    updateRatioProfile(diabetesConfig.activeProfileId, { basalDose: advice.proposedDose });
    updateProfile({ basalDose: advice.proposedDose });
    setJustApplied(advice.proposedDose);
  }

  const loading = points === null;

  const ratiosSummary = (() => {
    if (!slots) return "Courbe indisponible";
    if (slotsToReview.length > 0) {
      return slotsToReview
        .map(
          (s) =>
            `${SLOT_LABELS[s.mealType] ?? s.mealType} : ${s.verdict === "over-bolus" ? "trop d'insuline" : "pas assez d'insuline"}`,
        )
        .join(" · ");
    }
    if (slotsJudged.length === 0 && slotsBeforeBasalChange.length > 0) {
      return `À surveiller : ${slotsBeforeBasalChange
        .map((s) => (SLOT_LABELS[s.mealType] ?? s.mealType).toLowerCase())
        .join(", ")}`;
    }
    if (slotsJudged.length === 0) return "Pas encore assez de repas analysables";
    return `${slotsJudged.length} créneau${slotsJudged.length > 1 ? "x" : ""} jugé${slotsJudged.length > 1 ? "s" : ""} : rien à changer`;
  })();
  const ratiosLed: Led = !slots
    ? "steel"
    : slotsToReview.some((s) => s.verdict === "over-bolus")
      ? "red"
      : slotsToReview.length > 0
        ? "cobalt"
        : slotsJudged.length > 0
          ? "green"
          : slotsBeforeBasalChange.length > 0
            ? "amber"
            : "steel";

  return (
    <section className="panel" aria-label="Bilan automatique">
      <div className="panel-hd">
        <h2>Bilan automatique</h2>
        {loading ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <span className="eyebrow">calculé sur ta courbe</span>
        )}
      </div>

      {loading ? (
        <p className="text-xs text-text-tertiary py-2">Lecture de ta courbe…</p>
      ) : archiveError && (points?.length ?? 0) === 0 ? (
        <p className="text-xs text-text-tertiary py-2">
          Courbe archivée indisponible pour le moment. Le bilan revient dès que l&apos;archive répond.
        </p>
      ) : (
        <div>
          {/* ── 1. Objectif ── */}
          {goal && (
            <Row
              led={goalLed(goal)}
              title={`Objectif HbA1c ${fr(goal.goal)} %`}
              summary={goal.headline}
              open={openRow === "goal"}
              onToggle={() => setOpenRow(openRow === "goal" ? null : "goal")}
            >
              <p className="text-xs text-text-secondary leading-relaxed">{goal.detail}</p>
              {goal.estimatedA1c !== null && (
                <div className="mgrid c4 flat">
                  <div className="cell">
                    <div className="v text-base">{fr(goal.estimatedA1c)}<small>%</small></div>
                    <div className="l">HbA1c estimée</div>
                  </div>
                  <div className="cell">
                    <div className="v text-base">{goal.mean}</div>
                    <div className="l">moyenne</div>
                  </div>
                  <div className="cell">
                    <div className="v text-base">{goal.timeInRangePct}<small>%</small></div>
                    <div className="l">70-180</div>
                  </div>
                  <div className="cell">
                    <div className={`v text-base ${(goal.timeBelow70Pct ?? 0) >= 4 ? "text-error" : ""}`}>
                      {fr(goal.timeBelow70Pct ?? 0)}<small>%</small>
                    </div>
                    <div className="l">sous 70</div>
                  </div>
                </div>
              )}
              <p className="text-[11px] text-text-tertiary">
                Sur les {goal.days} derniers jours. HbA1c estimée à partir de ta moyenne capteur (formule GMI).
              </p>
            </Row>
          )}

          {/* ── 2. Lente ── */}
          {basal && (
            <Row
              led={basalLed(basal)}
              title={`Lente · ${basal.currentDose} U`}
              summary={basal.headline}
              open={openRow === "basal"}
              onToggle={() => setOpenRow(openRow === "basal" ? null : "basal")}
            >
              <ul className="space-y-1.5">
                {basal.reasons.map((r, i) => (
                  <li key={i} className="text-xs text-text-secondary leading-relaxed">
                    {r}
                  </li>
                ))}
              </ul>
              {basal.followUp && (
                <p className="text-xs text-text-tertiary leading-relaxed">{basal.followUp}</p>
              )}
              {basal.proposedDose !== null && (
                <div className="flex items-center justify-between gap-3 pt-1">
                  <div className="num text-sm text-text-primary">
                    {basal.currentDose} U <span className="text-text-tertiary">→</span>{" "}
                    <b>{basal.proposedDose} U</b>
                  </div>
                  <Button
                    size="sm"
                    variant={basal.status === "reduce" ? "primary" : "secondary"}
                    onClick={() => applyBasal(basal)}
                  >
                    Valider
                  </Button>
                </div>
              )}
              {justApplied !== null && basal.proposedDose === null && (
                <p className="text-xs text-success">
                  Lente passée à {justApplied} U. Pense à la faire à cette dose ce soir.
                </p>
              )}
              <p className="text-[11px] text-text-tertiary">
                Rien n&apos;est appliqué sans ton accord. Vaut seulement si tes injections sont bien notées.
              </p>
            </Row>
          )}

          {/* ── 3. Doses des repas ── */}
          <Row
            led={ratiosLed}
            title="Doses des repas"
            summary={ratiosSummary}
            open={openRow === "ratios"}
            onToggle={() => setOpenRow(openRow === "ratios" ? null : "ratios")}
          >
            {(slots ?? []).map((s) => {
              const label = SLOT_LABELS[s.mealType] ?? s.mealType;
              let text: string;
              if (s.verdict === "over-bolus") {
                text = `${s.hypoCount} repas sur ${s.eligibleCount} suivis d'une hypo. Proposition : ${s.proposedRatio ? `${formatRatio(s.proposedRatio.current)} → ${formatRatio(s.proposedRatio.proposed)}` : "baisser de 10 %"}.`;
              } else if (s.verdict === "under-bolus") {
                text = `Atterrit en moyenne ${s.avgLandingDelta !== null ? `${Math.round(s.avgLandingDelta)} mg/dL` : "trop"} au-dessus du départ, sans aucune hypo (${s.eligibleCount} repas).`;
              } else if (s.verdict === "ok") {
                text = `${s.eligibleCount} repas analysés, ${s.hypoCount} hypo : dose correcte.`;
              } else {
                text = `${s.eligibleCount} repas analysable${s.eligibleCount > 1 ? "s" : ""} — il en faut 5.`;
              }
              return (
                <div key={s.mealType} className="flex gap-2 text-xs leading-relaxed">
                  <span className="font-semibold text-text-primary w-14 shrink-0">{label}</span>
                  <span className="text-text-secondary">{text}</span>
                </div>
              );
            })}
            {slotsBeforeBasalChange.length > 0 && (
              <div className="alert">
                <div>
                  <b>Avant ton changement de lente</b>
                  <p>
                    {slotsBeforeBasalChange
                      .map(
                        (s) =>
                          `${SLOT_LABELS[s.mealType] ?? s.mealType} : ${s.hypoCount} repas sur ${s.eligibleCount} suivis d'une hypo`,
                      )
                      .join(" · ")}
                    . Le compteur est reparti de zéro avec la nouvelle lente ; ce sont les
                    créneaux à regarder en premier.
                  </p>
                </div>
              </div>
            )}
            <Link
              href="/diabete/historique#validation-doses"
              className="inline-flex items-center gap-1 text-xs font-semibold text-accent"
            >
              {slotsToReview.length > 0 ? "Voir le détail et valider" : "Voir le détail"}
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </Row>
        </div>
      )}
    </section>
  );
}
