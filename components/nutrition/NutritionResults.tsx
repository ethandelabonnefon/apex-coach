"use client";

import { useState } from "react";
import { Button, Card, InfoBox } from "@/components/ui";
import type { NutritionCalculation, NutritionDiagnosticData } from "@/lib/nutrition-calculator";
import type { MealPlan } from "@/lib/meal-distribution";

interface Props {
  calculation: NutritionCalculation;
  diagnostic: NutritionDiagnosticData;
  mealPlan: MealPlan;
  onApply: () => void;
  onReset: () => void;
}

const GOAL_LABELS: Record<string, string> = {
  bulk: "Prise de Masse",
  cut: "Sèche",
  maintain: "Maintenance",
  recomp: "Recomposition",
};

export default function NutritionResults({
  calculation,
  diagnostic,
  mealPlan,
  onApply,
  onReset,
}: Props) {
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [showMealPlan, setShowMealPlan] = useState(false);
  const calorieDelta = calculation.targetCalories - calculation.tdee;

  return (
    <div className="space-y-5 max-w-2xl mx-auto">
      {/* Header */}
      <div className="bg-gradient-to-r from-[#ff9500]/15 to-[#ff9500]/5 border border-[#ff9500]/20 rounded-2xl p-5">
        <div className="flex items-center gap-3 mb-2">
          <span className="text-2xl">
            {diagnostic.primaryGoal === "bulk" && "💪"}
            {diagnostic.primaryGoal === "cut" && "🔥"}
            {diagnostic.primaryGoal === "maintain" && "⚖️"}
            {diagnostic.primaryGoal === "recomp" && "🔄"}
          </span>
          <div>
            <h2 className="text-xl font-bold">{GOAL_LABELS[diagnostic.primaryGoal]}</h2>
            <p className="text-sm text-white/40">
              Programme nutritionnel personnalisé pour {diagnostic.weight}kg,{" "}
              {diagnostic.muscuSessionsPerWeek} muscu + {diagnostic.runningSessionsPerWeek} running/sem
            </p>
          </div>
        </div>
      </div>

      {/* Big calorie target */}
      <Card className="text-center" glow="green">
        <p className="text-xs text-white/35 uppercase tracking-wider mb-1">Ton objectif quotidien</p>
        <p className="text-5xl font-bold text-[#00ff94]">{calculation.targetCalories}</p>
        <p className="text-sm text-white/40 mt-1">kcal / jour</p>
        <p className="text-xs text-white/25 mt-2">
          TDEE : {calculation.tdee} kcal{" "}
          {calorieDelta > 0 ? `+ ${calorieDelta}` : calorieDelta < 0 ? `${calorieDelta}` : "±0"} kcal
        </p>
      </Card>

      {/* Macro circles */}
      <Card>
        <p className="text-xs text-white/35 uppercase tracking-wider mb-4">Répartition des macros</p>
        <div className="grid grid-cols-3 gap-4 mb-5">
          {/* Protein */}
          <MacroCircle
            value={calculation.macros.protein}
            ratio={calculation.macroRatios.protein}
            perKg={(calculation.macros.protein / diagnostic.weight).toFixed(1)}
            label="Protéines"
            color="#00d4ff"
          />
          {/* Carbs */}
          <MacroCircle
            value={calculation.macros.carbs}
            ratio={calculation.macroRatios.carbs}
            perKg={(calculation.macros.carbs / diagnostic.weight).toFixed(1)}
            label="Glucides"
            color="#ff9500"
          />
          {/* Fat */}
          <MacroCircle
            value={calculation.macros.fat}
            ratio={calculation.macroRatios.fat}
            perKg={(calculation.macros.fat / diagnostic.weight).toFixed(1)}
            label="Lipides"
            color="#a855f7"
          />
        </div>

        {/* Macro bars */}
        <div className="space-y-2">
          <MacroBar label="Protéines" value={calculation.macros.protein * 4} ratio={calculation.macroRatios.protein} color="#00d4ff" />
          <MacroBar label="Glucides" value={calculation.macros.carbs * 4} ratio={calculation.macroRatios.carbs} color="#ff9500" />
          <MacroBar label="Lipides" value={calculation.macros.fat * 9} ratio={calculation.macroRatios.fat} color="#a855f7" />
        </div>
      </Card>

      {/* T1D Notes */}
      <InfoBox variant="info">
        <p className="font-semibold mb-2">Notes Diabète T1</p>
        <ul className="space-y-1.5 text-xs">
          <li className="flex gap-2">
            <span className="text-[#00d4ff]">•</span>
            <span>
              <strong>{calculation.macros.carbs}g de glucides</strong> à répartir sur {diagnostic.mealsPerDay} repas ={" "}
              ~{Math.round(calculation.macros.carbs / diagnostic.mealsPerDay)}g par repas
            </span>
          </li>
          <li className="flex gap-2">
            <span className="text-[#00d4ff]">•</span>
            <span>Jours d'entraînement : privilégie plus de glucides autour de la séance</span>
          </li>
          <li className="flex gap-2">
            <span className="text-[#00d4ff]">•</span>
            <span>
              Les protéines pures (poulet, poisson, oeufs) n'impactent quasiment pas ta glycémie
            </span>
          </li>
        </ul>
      </InfoBox>

      {/* Calorie breakdown toggle */}
      <button
        type="button"
        onClick={() => setShowBreakdown(!showBreakdown)}
        className="w-full text-left p-4 rounded-xl bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.05] transition-colors"
      >
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-white/70">Détail du calcul (BMR, NEAT, TEF...)</span>
          <span className="text-white/30 text-xs">{showBreakdown ? "▲" : "▼"}</span>
        </div>
      </button>

      {showBreakdown && (
        <Card>
          <p className="text-xs text-white/35 uppercase tracking-wider mb-3">Calcul de tes besoins</p>
          <div className="space-y-2.5 text-sm">
            <Row label="Métabolisme de base (BMR)" value={`${calculation.bmr} kcal`} />
            <Row label="+ Activité quotidienne (NEAT)" value={`+${calculation.neat} kcal`} />
            <Row
              label={`+ Exercice (${diagnostic.muscuSessionsPerWeek} muscu + ${diagnostic.runningSessionsPerWeek} running)`}
              value={`+${calculation.exerciseCalories} kcal`}
            />
            <Row label="+ Thermogenèse (TEF)" value={`+${calculation.tef} kcal`} />
            <div className="border-t border-white/[0.06] pt-2 flex justify-between font-semibold">
              <span>= Dépense totale (TDEE)</span>
              <span className="font-mono">{calculation.tdee} kcal</span>
            </div>
            <div className="flex justify-between text-[#00ff94]">
              <span className="font-semibold">
                {diagnostic.primaryGoal === "bulk" && "+ Surplus prise de masse"}
                {diagnostic.primaryGoal === "cut" && "- Déficit sèche"}
                {diagnostic.primaryGoal === "maintain" && "= Maintenance"}
                {diagnostic.primaryGoal === "recomp" && "- Léger déficit recomp"}
              </span>
              <span className="font-mono font-bold">
                {calorieDelta > 0 ? "+" : ""}
                {calorieDelta} kcal
              </span>
            </div>
          </div>
        </Card>
      )}

      {/* Meal plan toggle */}
      <button
        type="button"
        onClick={() => setShowMealPlan(!showMealPlan)}
        className="w-full text-left p-4 rounded-xl bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.05] transition-colors"
      >
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-white/70">
            Plan de repas type ({diagnostic.mealsPerDay} repas)
          </span>
          <span className="text-white/30 text-xs">{showMealPlan ? "▲" : "▼"}</span>
        </div>
      </button>

      {showMealPlan && (
        <div className="space-y-2">
          {mealPlan.meals.map((meal, i) => (
            <Card key={i}>
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-white/80">{meal.name}</span>
                  <span className="text-[10px] text-white/25">{meal.time}</span>
                  {meal.isAroundWorkout && (
                    <span className="px-1.5 py-0.5 rounded text-[9px] bg-[#ff9500]/15 text-[#ff9500]">
                      Workout
                    </span>
                  )}
                </div>
                <span className="text-xs text-white/30 font-mono">{meal.calories} kcal</span>
              </div>

              <div className="flex gap-3 text-xs text-white/50 mb-2">
                <span>P: <span className="text-[#00d4ff] font-medium">{meal.protein}g</span></span>
                <span>G: <span className="text-[#ff9500] font-medium">{meal.carbs}g</span></span>
                <span>L: <span className="text-[#a855f7] font-medium">{meal.fat}g</span></span>
              </div>

              {meal.suggestions.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {meal.suggestions.map((s, j) => (
                    <span key={j} className="text-[10px] text-white/30 px-2 py-0.5 rounded-full bg-white/[0.03]">
                      {s}
                    </span>
                  ))}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* Reasoning */}
      <button
        type="button"
        onClick={() => {}}
        className="w-full text-left p-4 rounded-xl bg-white/[0.03] border border-white/[0.06]"
      >
        <p className="text-sm font-medium text-white/70 mb-2">Pourquoi ces macros ?</p>
        <div className="text-xs text-white/40 space-y-1.5">
          <p>
            <strong className="text-white/60">Protéines ({calculation.macros.protein}g) :</strong>{" "}
            {(calculation.macros.protein / diagnostic.weight).toFixed(1)}g/kg est optimal pour{" "}
            {diagnostic.primaryGoal === "bulk" ? "maximiser la synthèse protéique en prise de masse" : ""}
            {diagnostic.primaryGoal === "cut" ? "préserver ta masse musculaire en déficit calorique" : ""}
            {diagnostic.primaryGoal === "maintain" ? "maintenir ta masse musculaire" : ""}
            {diagnostic.primaryGoal === "recomp" ? "la recomposition corporelle" : ""}.
          </p>
          <p>
            <strong className="text-white/60">Glucides ({calculation.macros.carbs}g) :</strong>{" "}
            Carburant principal pour tes entraînements de muscu et running.
          </p>
          <p>
            <strong className="text-white/60">Lipides ({calculation.macros.fat}g) :</strong>{" "}
            {(calculation.macros.fat / diagnostic.weight).toFixed(1)}g/kg — minimum pour les hormones et
            l'absorption des vitamines.
          </p>
        </div>
      </button>

      {/* Action buttons */}
      <div className="flex gap-3">
        <Button onClick={onApply} className="flex-1" size="lg">
          Appliquer ces objectifs
        </Button>
        <Button onClick={onReset} variant="ghost" size="lg">
          Refaire le diagnostic
        </Button>
      </div>
    </div>
  );
}

// ─── Sub-components ─────────────────────────────

function MacroCircle({
  value,
  ratio,
  perKg,
  label,
  color,
}: {
  value: number;
  ratio: number;
  perKg: string;
  label: string;
  color: string;
}) {
  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference - (ratio / 100) * circumference;

  return (
    <div className="text-center">
      <div className="relative w-20 h-20 mx-auto mb-2">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 80 80">
          <circle cx="40" cy="40" r={radius} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="5" />
          <circle
            cx="40"
            cy="40"
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth="5"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-lg font-bold" style={{ color }}>
            {value}
          </span>
          <span className="text-[9px] text-white/30">g</span>
        </div>
      </div>
      <p className="text-xs font-medium text-white/70">{label}</p>
      <p className="text-[10px] text-white/30">{ratio}%</p>
      <p className="text-[10px]" style={{ color }}>
        {perKg}g/kg
      </p>
    </div>
  );
}

function MacroBar({ label, value, ratio, color }: { label: string; value: number; ratio: number; color: string }) {
  return (
    <div>
      <div className="flex justify-between text-xs text-white/40 mb-1">
        <span>{label}</span>
        <span>{value} kcal</span>
      </div>
      <div className="h-2.5 bg-white/[0.04] rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${ratio}%`, background: color }} />
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-white/40">{label}</span>
      <span className="font-mono text-white/70">{value}</span>
    </div>
  );
}
