"use client";

/**
 * NutritionResults — affichage du calcul nutritionnel post-diagnostic.
 *
 * Refonte Phase 8 :
 *  - design Phase 2 (surface-1, tokens, lucide icons, num tabular)
 *  - affiche les `warnings` du calculateur en bannière
 *  - explique la source du surplus/déficit (timeline vs agressivité)
 *  - breakdown BMR/NEAT/exercice/TEF en langage naturel
 */

import { useState } from "react";
import type { NutritionCalculation, NutritionDiagnosticData } from "@/lib/nutrition-calculator";
import type { MealPlan } from "@/lib/meal-distribution";
import { Badge } from "@/components/ui/Badge";
import {
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Minus,
  ChevronDown,
  Target,
  Flame,
  Dumbbell,
  Footprints,
  Info,
  Check,
  Undo2,
} from "lucide-react";

interface Props {
  calculation: NutritionCalculation;
  diagnostic: NutritionDiagnosticData;
  mealPlan: MealPlan;
  onApply: () => void;
  onReset: () => void;
}

const GOAL_LABELS: Record<string, string> = {
  bulk: "Prise de masse",
  cut: "Sèche",
  maintain: "Maintenance",
  recomp: "Recomposition",
};

const GOAL_ICONS = {
  bulk: TrendingUp,
  cut: TrendingDown,
  maintain: Minus,
  recomp: Target,
} as const;

export default function NutritionResults({
  calculation,
  diagnostic,
  mealPlan,
  onApply,
  onReset,
}: Props) {
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [showMealPlan, setShowMealPlan] = useState(false);

  const GoalIcon = GOAL_ICONS[diagnostic.primaryGoal] ?? Target;
  const delta = calculation.calorieDelta;
  const weeklyKg = calculation.weeklyWeightChangeKg;

  return (
    <div className="space-y-4 max-w-2xl mx-auto stagger">
      {/* ── Header objectif ── */}
      <section className="surface-1 rounded-3xl p-5">
        <div className="flex items-start gap-3">
          <div className="shrink-0 w-11 h-11 rounded-xl bg-nutrition/15 flex items-center justify-center">
            <GoalIcon className="w-5 h-5 text-nutrition" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="label">Objectif retenu</p>
            <h2 className="text-lg font-semibold text-text-primary">
              {GOAL_LABELS[diagnostic.primaryGoal]}
            </h2>
            <p className="text-xs text-text-tertiary mt-0.5">
              {diagnostic.weight} kg actuels · {diagnostic.muscuSessionsPerWeek} muscu +{" "}
              {diagnostic.runningSessionsPerWeek} running / sem
            </p>
          </div>
        </div>
      </section>

      {/* ── Warnings (sanity check) ── */}
      {calculation.warnings.length > 0 && (
        <section className="space-y-2">
          {calculation.warnings.map((w, i) => (
            <div
              key={i}
              className="rounded-xl bg-warning/10 border border-warning/25 px-4 py-3 flex items-start gap-2.5"
            >
              <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
              <p className="text-xs text-text-primary leading-relaxed">{w}</p>
            </div>
          ))}
        </section>
      )}

      {/* ── Hero calories ── */}
      <section className="surface-1 rounded-3xl p-6 sm:p-8 glow-accent">
        <div className="text-center">
          <p className="label">Ton objectif quotidien</p>
          <p className="num-hero text-6xl sm:text-7xl font-semibold text-accent mt-2 leading-none">
            {calculation.targetCalories}
          </p>
          <p className="text-sm text-text-secondary mt-1">kcal / jour</p>

          <div className="mt-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-text-tertiary">
            <span className="num">
              TDEE{" "}
              <span className="text-text-secondary font-medium">{calculation.tdee}</span> kcal
            </span>
            <span className="text-text-disabled">·</span>
            <span className="num">
              {delta >= 0 ? "+" : ""}
              <span
                className={
                  delta > 0 ? "text-accent font-medium" : delta < 0 ? "text-warning font-medium" : ""
                }
              >
                {delta}
              </span>{" "}
              kcal
            </span>
            {calculation.surplusSource !== "maintain" && (
              <>
                <span className="text-text-disabled">·</span>
                <span className="num">
                  {weeklyKg >= 0 ? "+" : ""}
                  {weeklyKg.toFixed(2)} kg/sem prévus
                </span>
              </>
            )}
          </div>

          {calculation.surplusSource === "timeline" &&
            diagnostic.targetWeight &&
            diagnostic.targetTimelineWeeks && (
              <p className="text-[11px] text-text-tertiary mt-3">
                Surplus calculé depuis ton objectif{" "}
                <span className="text-text-secondary">{diagnostic.targetWeight} kg</span> en{" "}
                <span className="text-text-secondary">{diagnostic.targetTimelineWeeks} sem</span>
              </p>
            )}
        </div>
      </section>

      {/* ── Macros ── */}
      <section className="surface-1 rounded-3xl p-5">
        <p className="label mb-4">Répartition des macros</p>

        <div className="space-y-4">
          <MacroLine
            label="Protéines"
            grams={calculation.macros.protein}
            perKg={calculation.macros.protein / diagnostic.weight}
            ratio={calculation.macroRatios.protein}
            colorVar="var(--info)"
          />
          <MacroLine
            label="Glucides"
            grams={calculation.macros.carbs}
            perKg={calculation.macros.carbs / diagnostic.weight}
            ratio={calculation.macroRatios.carbs}
            colorVar="var(--warning)"
          />
          <MacroLine
            label="Lipides"
            grams={calculation.macros.fat}
            perKg={calculation.macros.fat / diagnostic.weight}
            ratio={calculation.macroRatios.fat}
            colorVar="var(--accent-2)"
          />
        </div>
      </section>

      {/* ── Breakdown ── */}
      <section className="surface-1 rounded-2xl overflow-hidden">
        <button
          type="button"
          onClick={() => setShowBreakdown((v) => !v)}
          className="w-full px-5 py-4 flex items-center justify-between hover:bg-bg-hover transition-colors"
        >
          <span className="text-sm font-medium text-text-primary flex items-center gap-2">
            <Flame className="w-4 h-4 text-text-tertiary" />
            Détail du calcul
          </span>
          <ChevronDown
            className={`w-4 h-4 text-text-tertiary transition-transform ${
              showBreakdown ? "rotate-180" : ""
            }`}
          />
        </button>

        {showBreakdown && (
          <div className="px-5 pb-5 pt-1 space-y-2.5 text-sm border-t border-border-subtle">
            <BreakdownRow
              label="Métabolisme de base (BMR)"
              value={`${calculation.bmr} kcal`}
              hint="Mifflin-St Jeor (ou Katch-McArdle si BF% renseigné)"
            />
            <BreakdownRow
              label="+ Activité quotidienne hors sport (NEAT)"
              value={`+${calculation.neat} kcal`}
              hint={`${diagnostic.dailyActivityLevel} · job ${diagnostic.jobType}`}
            />
            <BreakdownRow
              label={`+ Exercice structuré (${diagnostic.muscuSessionsPerWeek}× muscu + ${diagnostic.runningSessionsPerWeek}× running / sem)`}
              value={`+${calculation.exerciseCalories} kcal`}
              hint="Formule MET (5.5 MET muscu / 8.3 MET running, moyennés sur 7j)"
            />
            <BreakdownRow
              label="+ Effet thermique des aliments (TEF)"
              value={`+${calculation.tef} kcal`}
              hint="~10% du TDEE brut"
            />
            <div className="border-t border-border-subtle pt-2.5 flex justify-between items-center font-semibold">
              <span className="text-text-primary">= Dépense totale (TDEE)</span>
              <span className="num text-text-primary">{calculation.tdee} kcal</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-text-secondary text-xs">
                {calculation.surplusSource === "timeline"
                  ? "Surplus cible (depuis timeline)"
                  : calculation.surplusSource === "aggressiveness"
                  ? `Ajustement ${diagnostic.primaryGoal} · ${diagnostic.aggressiveness}`
                  : "Maintenance"}
              </span>
              <span
                className={`num text-sm font-semibold ${
                  delta > 0 ? "text-accent" : delta < 0 ? "text-warning" : "text-text-tertiary"
                }`}
              >
                {delta > 0 ? "+" : ""}
                {delta} kcal
              </span>
            </div>
            <div className="border-t border-border-subtle pt-2.5 flex justify-between items-center">
              <span className="text-accent font-semibold">= Objectif quotidien</span>
              <span className="num text-accent font-bold">{calculation.targetCalories} kcal</span>
            </div>
          </div>
        )}
      </section>

      {/* ── Meal plan ── */}
      <section className="surface-1 rounded-2xl overflow-hidden">
        <button
          type="button"
          onClick={() => setShowMealPlan((v) => !v)}
          className="w-full px-5 py-4 flex items-center justify-between hover:bg-bg-hover transition-colors"
        >
          <span className="text-sm font-medium text-text-primary flex items-center gap-2">
            <Target className="w-4 h-4 text-text-tertiary" />
            Plan de repas ({diagnostic.mealsPerDay} repas / jour)
          </span>
          <ChevronDown
            className={`w-4 h-4 text-text-tertiary transition-transform ${
              showMealPlan ? "rotate-180" : ""
            }`}
          />
        </button>

        {showMealPlan && (
          <div className="px-5 pb-5 pt-1 space-y-2 border-t border-border-subtle">
            {mealPlan.meals.map((meal, i) => (
              <div
                key={i}
                className="rounded-xl bg-bg-tertiary border border-border-subtle p-3"
              >
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-text-primary">{meal.name}</span>
                    <span className="num text-[10px] text-text-tertiary">{meal.time}</span>
                    {meal.isAroundWorkout && (
                      <Badge variant="warning" size="sm">
                        Workout
                      </Badge>
                    )}
                  </div>
                  <span className="num text-xs text-text-secondary">{meal.calories} kcal</span>
                </div>
                <div className="flex gap-3 text-[11px] num">
                  <span className="text-text-tertiary">
                    P <span className="text-info font-medium">{meal.protein}g</span>
                  </span>
                  <span className="text-text-tertiary">
                    G <span className="text-warning font-medium">{meal.carbs}g</span>
                  </span>
                  <span className="text-text-tertiary">
                    L <span className="text-accent-2 font-medium">{meal.fat}g</span>
                  </span>
                </div>
                {meal.suggestions.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {meal.suggestions.map((s, j) => (
                      <span
                        key={j}
                        className="text-[10px] text-text-tertiary px-2 py-0.5 rounded-full bg-bg-secondary border border-border-subtle"
                      >
                        {s}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Tip T1D compact ── */}
      <section className="rounded-xl bg-diabete/10 border border-diabete/25 px-4 py-3 flex items-start gap-2.5">
        <Info className="w-4 h-4 text-diabete shrink-0 mt-0.5" />
        <div className="text-xs">
          <p className="text-text-primary font-medium">
            Diabète T1 — {calculation.macros.carbs}g de glucides / jour
          </p>
          <p className="text-text-tertiary mt-0.5 leading-relaxed">
            Soit ~{Math.round(calculation.macros.carbs / diagnostic.mealsPerDay)}g par repas sur{" "}
            {diagnostic.mealsPerDay} prises. Les protéines pures n&apos;impactent quasiment pas la
            glycémie.
          </p>
        </div>
      </section>

      {/* ── Source hints (pourquoi ces ratios) ── */}
      <section className="rounded-xl bg-bg-tertiary border border-border-subtle px-4 py-3">
        <p className="text-xs font-medium text-text-primary mb-1.5">Sources & méthode</p>
        <ul className="text-[11px] text-text-tertiary space-y-0.5 leading-relaxed">
          <li className="flex gap-1.5">
            <Dumbbell className="w-3 h-3 text-text-disabled shrink-0 mt-0.5" />
            <span>
              BMR Mifflin-St Jeor (1990) · NEAT multiplicateurs ACSM (hors exercice) · TEF 10%
            </span>
          </li>
          <li className="flex gap-1.5">
            <Footprints className="w-3 h-3 text-text-disabled shrink-0 mt-0.5" />
            <span>
              Calories exercice : MET-based (Ainsworth Compendium 2011) × durée × poids
            </span>
          </li>
          <li className="flex gap-1.5">
            <Target className="w-3 h-3 text-text-disabled shrink-0 mt-0.5" />
            <span>
              Protéines {(calculation.macros.protein / diagnostic.weight).toFixed(1)}g/kg selon
              Helms et al. 2014 · Conversion 7700 kcal = 1 kg
            </span>
          </li>
        </ul>
      </section>

      {/* ── Actions ── */}
      <div className="flex gap-3 pt-1">
        <button
          type="button"
          onClick={onApply}
          className="flex-1 bg-accent hover:bg-accent-hover text-ink font-semibold py-3.5 rounded-xl transition-colors tap-scale flex items-center justify-center gap-2"
        >
          <Check className="w-4 h-4" />
          Appliquer ces objectifs
        </button>
        <button
          type="button"
          onClick={onReset}
          className="bg-bg-tertiary hover:bg-bg-hover border border-border-subtle text-text-secondary font-medium px-4 py-3.5 rounded-xl transition-colors tap-scale flex items-center gap-1.5"
        >
          <Undo2 className="w-4 h-4" />
          <span className="hidden sm:inline">Refaire</span>
        </button>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────
// Sub-components
// ────────────────────────────────────────────────

function MacroLine({
  label,
  grams,
  perKg,
  ratio,
  colorVar,
}: {
  label: string;
  grams: number;
  perKg: number;
  ratio: number;
  colorVar: string;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1.5">
        <span className="label">{label}</span>
        <div className="flex items-baseline gap-2 num">
          <span className="text-xl font-semibold" style={{ color: colorVar }}>
            {grams}
          </span>
          <span className="text-xs text-text-tertiary">g</span>
          <span className="text-[10px] text-text-disabled ml-1">
            {perKg.toFixed(1)}g/kg · {ratio}%
          </span>
        </div>
      </div>
      <div className="h-2 bg-bg-tertiary rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${ratio}%`, background: colorVar }}
        />
      </div>
    </div>
  );
}

function BreakdownRow({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div>
      <div className="flex justify-between items-center">
        <span className="text-text-secondary text-sm">{label}</span>
        <span className="num text-sm text-text-primary">{value}</span>
      </div>
      {hint && <p className="text-[10px] text-text-tertiary mt-0.5">{hint}</p>}
    </div>
  );
}
