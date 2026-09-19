"use client";

import React, { useState, useMemo, useCallback } from "react";
import { useStore } from "@/lib/store";
import type { FoodItem, Meal } from "@/types";
import NutritionDiagnosticForm from "@/components/nutrition/NutritionDiagnosticForm";
import NutritionResults from "@/components/nutrition/NutritionResults";
import {
  calculateNutrition,
  type NutritionDiagnosticData,
  type NutritionCalculation,
} from "@/lib/nutrition-calculator";
import { distributeMacrosToMeals, type MealPlan } from "@/lib/meal-distribution";
import { Ring } from "@/components/ui/Ring";
import { Progress } from "@/components/ui/Progress";
import { Badge } from "@/components/ui/Badge";
import { Apple, Plus, Trash2, Sparkles, Droplet } from "lucide-react";

const QUICK_FOODS: FoodItem[] = [
  { name: "Poulet 150g", quantity: 150, unit: "g", calories: 248, protein: 46, carbs: 0, fat: 5 },
  { name: "Riz 200g", quantity: 200, unit: "g", calories: 260, protein: 5, carbs: 56, fat: 1 },
  { name: "Banane", quantity: 120, unit: "g", calories: 105, protein: 1, carbs: 27, fat: 0 },
  { name: "Whey 30g", quantity: 30, unit: "g", calories: 120, protein: 24, carbs: 3, fat: 1 },
  { name: "Avoine 80g", quantity: 80, unit: "g", calories: 300, protein: 10, carbs: 54, fat: 6 },
  { name: "Oeufs x3", quantity: 180, unit: "g", calories: 210, protein: 18, carbs: 1, fat: 15 },
];

const MEAL_TYPES = [
  { value: "petit-dejeuner", label: "Petit-déj" },
  { value: "dejeuner", label: "Déjeuner" },
  { value: "diner", label: "Dîner" },
  { value: "collation", label: "Collation" },
];

const EMPTY_FOOD: Omit<FoodItem, "unit"> = {
  name: "",
  quantity: 0,
  calories: 0,
  protein: 0,
  carbs: 0,
  fat: 0,
};

export default function NutritionPage() {
  const {
    profile,
    meals,
    addMeal,
    nutritionDiagnosticCompleted,
    nutritionDiagnosticData,
    setNutritionDiagnosticData,
    nutritionTargets,
    setNutritionTargets,
    updateProfile,
  } = useStore();

  const [view, setView] = useState<"tracker" | "diagnostic" | "results">(
    nutritionDiagnosticCompleted ? "tracker" : "diagnostic"
  );
  const [calculation, setCalculation] = useState<NutritionCalculation | null>(null);
  const [diagnosticSnapshot, setDiagnosticSnapshot] = useState<NutritionDiagnosticData | null>(null);
  const [mealPlan, setMealPlan] = useState<MealPlan | null>(null);

  const [mealType, setMealType] = useState("petit-dejeuner");
  const [foods, setFoods] = useState<FoodItem[]>([]);
  const [currentFood, setCurrentFood] = useState<Omit<FoodItem, "unit">>({ ...EMPTY_FOOD });
  const [showManual, setShowManual] = useState(false);

  const todayStr = new Date().toDateString();
  const todayMeals = useMemo(
    () => meals.filter((m) => new Date(m.eatenAt).toDateString() === todayStr),
    [meals, todayStr]
  );

  const totals = useMemo(
    () =>
      todayMeals.reduce(
        (acc, m) => ({
          calories: acc.calories + m.calories,
          protein: acc.protein + m.protein,
          carbs: acc.carbs + m.carbs,
          fat: acc.fat + m.fat,
        }),
        { calories: 0, protein: 0, carbs: 0, fat: 0 }
      ),
    [todayMeals]
  );

  const formTotals = useMemo(
    () =>
      foods.reduce(
        (acc, f) => ({
          calories: acc.calories + f.calories,
          protein: acc.protein + f.protein,
          carbs: acc.carbs + f.carbs,
          fat: acc.fat + f.fat,
        }),
        { calories: 0, protein: 0, carbs: 0, fat: 0 }
      ),
    [foods]
  );

  function addFoodToList() {
    if (!currentFood.name.trim()) return;
    setFoods((prev) => [...prev, { ...currentFood, unit: "g" }]);
    setCurrentFood({ ...EMPTY_FOOD });
    setShowManual(false);
  }

  function removeFoodFromList(index: number) {
    setFoods((prev) => prev.filter((_, i) => i !== index));
  }

  function addQuickFood(food: FoodItem) {
    setFoods((prev) => [...prev, { ...food }]);
  }

  function saveMeal() {
    if (foods.length === 0) return;
    const meal: Meal = {
      id: crypto.randomUUID(),
      mealType,
      name: MEAL_TYPES.find((t) => t.value === mealType)?.label || mealType,
      calories: formTotals.calories,
      protein: formTotals.protein,
      carbs: formTotals.carbs,
      fat: formTotals.fat,
      foods: [...foods],
      eatenAt: new Date(),
    };
    addMeal(meal);
    setFoods([]);
    setCurrentFood({ ...EMPTY_FOOD });
  }

  const handleDiagnosticComplete = useCallback(
    (data: NutritionDiagnosticData) => {
      const calc = calculateNutrition(data);
      const plan = distributeMacrosToMeals(calc.macros, data.mealsPerDay, data.carbTiming);
      setCalculation(calc);
      setDiagnosticSnapshot(data);
      setMealPlan(plan);
      setNutritionDiagnosticData(data as unknown as Record<string, unknown>);
      setView("results");
    },
    [setNutritionDiagnosticData]
  );

  const handleApplyTargets = useCallback(() => {
    if (!calculation) return;
    const targets = {
      calories: calculation.targetCalories,
      protein: calculation.macros.protein,
      carbs: calculation.macros.carbs,
      fat: calculation.macros.fat,
    };
    setNutritionTargets(targets);
    updateProfile({
      targetCalories: targets.calories,
      targetProtein: targets.protein,
      targetCarbs: targets.carbs,
      targetFat: targets.fat,
    });
    setView("tracker");
  }, [calculation, setNutritionTargets, updateProfile]);

  const targets = nutritionTargets || {
    calories: profile.targetCalories || 3000,
    protein: profile.targetProtein || 170,
    carbs: profile.targetCarbs || 350,
    fat: profile.targetFat || 85,
  };

  // ─── DIAGNOSTIC ──────────────────────────────────
  if (view === "diagnostic") {
    return (
      <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <p className="label">Diagnostic nutrition</p>
            <h1 className="mt-1 text-2xl font-semibold text-text-primary">Besoins caloriques</h1>
          </div>
          {nutritionDiagnosticCompleted && (
            <button
              type="button"
              onClick={() => setView("tracker")}
              className="text-xs text-text-secondary hover:text-text-primary transition-colors px-3 py-1.5 rounded-lg border border-border-subtle"
            >
              Retour au suivi
            </button>
          )}
        </div>
        <NutritionDiagnosticForm onComplete={handleDiagnosticComplete} />
      </div>
    );
  }

  // ─── RESULTS ─────────────────────────────────────
  if (view === "results" && calculation && diagnosticSnapshot && mealPlan) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto">
        <div className="mb-6">
          <p className="label">Objectifs calculés</p>
          <h1 className="mt-1 text-2xl font-semibold text-text-primary">Tes macros sur mesure</h1>
        </div>
        <NutritionResults
          calculation={calculation}
          diagnostic={diagnosticSnapshot}
          mealPlan={mealPlan}
          onApply={handleApplyTargets}
          onReset={() => setView("diagnostic")}
        />
      </div>
    );
  }

  // ─── TRACKER ─────────────────────────────────────
  const caloriesPct = Math.min(100, Math.round((totals.calories / targets.calories) * 100));
  const remainingCals = Math.max(0, targets.calories - totals.calories);

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto stagger">
      {/* ── HERO : Macros du jour — Ring central géant + glow nutrition ── */}
      <section className="surface-1 rounded-3xl p-6 sm:p-8 mb-4 relative overflow-hidden">
        {/* Glow orange en fond pour signature visuelle */}
        <div
          aria-hidden
          className="absolute -top-24 -right-16 h-64 w-64 rounded-full opacity-[0.10] blur-3xl"
          style={{ background: "var(--nutrition)" }}
        />

        <div className="relative flex items-start justify-between gap-4 mb-6">
          <div>
            <p className="label">Aujourd&apos;hui</p>
            <h1 className="mt-1 text-xl sm:text-2xl font-semibold text-text-primary">
              Macros du jour
            </h1>
          </div>
          <button
            type="button"
            onClick={() => setView("diagnostic")}
            className="text-xs text-text-secondary hover:text-text-primary transition-colors px-3 py-1.5 rounded-lg border border-border-subtle tap-scale"
          >
            {nutritionDiagnosticCompleted ? "Refaire diagnostic" : "Diagnostic"}
          </button>
        </div>

        <div className="relative flex flex-col sm:flex-row items-center sm:items-start gap-6 sm:gap-8">
          <Ring
            value={totals.calories}
            max={targets.calories}
            size={200}
            strokeWidth={14}
            color="var(--nutrition)"
          >
            <div className="flex flex-col items-center justify-center text-center leading-none">
              <span className="num-hero text-5xl sm:text-6xl font-semibold tabular-nums" style={{ color: "var(--nutrition)" }}>
                {Math.round(totals.calories)}
              </span>
              <span className="text-[10px] text-text-tertiary mt-2 tracking-wide">
                / <span className="num">{targets.calories}</span> kcal
              </span>
              <span className="text-[9px] text-text-tertiary mt-1.5">
                {remainingCals > 0 ? (
                  <>
                    Reste <span className="num font-semibold text-text-secondary">{remainingCals}</span>
                  </>
                ) : (
                  <span className="text-success font-semibold">Objectif atteint ✓</span>
                )}
              </span>
            </div>
          </Ring>

          <div className="flex-1 w-full space-y-5">
            <MacroRow
              label="Protéines"
              value={totals.protein}
              max={targets.protein}
              color="info"
              varColor="var(--info)"
            />
            <MacroRow
              label="Glucides"
              value={totals.carbs}
              max={targets.carbs}
              color="warning"
              varColor="var(--warning)"
            />
            <MacroRow
              label="Lipides"
              value={totals.fat}
              max={targets.fat}
              color="accent"
              varColor="var(--accent-2)"
            />
          </div>
        </div>
      </section>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* ── LOGGER ── */}
        <section className="surface-1 rounded-3xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-text-primary flex items-center gap-2">
              <Plus className="w-4 h-4 text-nutrition" />
              Ajouter un repas
            </h2>
            <div className="flex gap-1">
              {MEAL_TYPES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setMealType(t.value)}
                  className={`text-[10px] uppercase tracking-wide px-2 py-1 rounded-md transition-colors ${
                    mealType === t.value
                      ? "bg-nutrition/15 text-nutrition"
                      : "text-text-tertiary hover:text-text-secondary"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Quick add grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4">
            {QUICK_FOODS.map((food) => (
              <button
                key={food.name}
                type="button"
                onClick={() => addQuickFood(food)}
                className="flex flex-col items-start gap-0.5 px-3 py-2 rounded-xl bg-bg-tertiary hover:bg-bg-hover border border-border-subtle hover:border-nutrition/30 transition-all text-left tap-scale"
              >
                <span className="text-xs font-medium text-text-primary">{food.name}</span>
                <span className="num text-[10px] text-text-tertiary">{food.calories} kcal</span>
              </button>
            ))}
          </div>

          {/* Manual entry toggle */}
          {!showManual ? (
            <button
              type="button"
              onClick={() => setShowManual(true)}
              className="w-full text-xs text-text-secondary hover:text-text-primary transition-colors py-2 rounded-lg border border-dashed border-border-subtle hover:border-border-default"
            >
              + Ajouter manuellement
            </button>
          ) : (
            <div className="rounded-xl bg-bg-tertiary border border-border-subtle p-3 space-y-2">
              <input
                type="text"
                value={currentFood.name}
                onChange={(e) => setCurrentFood((f) => ({ ...f, name: e.target.value }))}
                placeholder="Nom de l'aliment"
                className="w-full bg-bg-secondary border border-border-subtle rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-disabled focus:outline-none focus:border-nutrition/50"
              />
              <div className="grid grid-cols-4 gap-2">
                <ManualInput
                  value={currentFood.calories}
                  onChange={(v) => setCurrentFood((f) => ({ ...f, calories: v }))}
                  placeholder="kcal"
                />
                <ManualInput
                  value={currentFood.protein}
                  onChange={(v) => setCurrentFood((f) => ({ ...f, protein: v }))}
                  placeholder="Prot"
                />
                <ManualInput
                  value={currentFood.carbs}
                  onChange={(v) => setCurrentFood((f) => ({ ...f, carbs: v }))}
                  placeholder="Gluc"
                />
                <ManualInput
                  value={currentFood.fat}
                  onChange={(v) => setCurrentFood((f) => ({ ...f, fat: v }))}
                  placeholder="Lip"
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={addFoodToList}
                  disabled={!currentFood.name.trim()}
                  className="flex-1 bg-nutrition text-ink text-xs font-semibold py-2 rounded-lg hover:bg-nutrition/90 transition-colors disabled:opacity-40"
                >
                  Ajouter
                </button>
                <button
                  type="button"
                  onClick={() => setShowManual(false)}
                  className="text-xs text-text-secondary px-3"
                >
                  Annuler
                </button>
              </div>
            </div>
          )}

          {/* Current meal composition */}
          {foods.length > 0 && (
            <div className="mt-4 pt-4 border-t border-border-subtle">
              <p className="label mb-2">En cours · {MEAL_TYPES.find((t) => t.value === mealType)?.label}</p>
              <div className="space-y-1.5 mb-3">
                {foods.map((food, i) => (
                  <div
                    key={`${food.name}-${i}`}
                    className="flex items-center justify-between bg-bg-tertiary rounded-lg px-3 py-2"
                  >
                    <span className="text-sm text-text-primary truncate">{food.name}</span>
                    <div className="flex items-center gap-3">
                      <span className="num text-xs text-text-tertiary">{food.calories} kcal</span>
                      <button
                        type="button"
                        onClick={() => removeFoodFromList(i)}
                        className="text-text-tertiary hover:text-error transition-colors"
                        aria-label="Retirer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between">
                <span className="num text-sm text-text-secondary">
                  <span className="text-nutrition font-semibold">{formTotals.calories}</span> kcal ·
                  P {formTotals.protein}g · G {formTotals.carbs}g · L {formTotals.fat}g
                </span>
                <button
                  type="button"
                  onClick={saveMeal}
                  className="bg-nutrition text-ink text-xs font-semibold px-4 py-2 rounded-lg hover:bg-nutrition/90 transition-colors tap-scale"
                >
                  Enregistrer
                </button>
              </div>
            </div>
          )}
        </section>

        {/* ── REPAS DU JOUR ── */}
        <section className="surface-1 rounded-3xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-text-primary flex items-center gap-2">
              <Apple className="w-4 h-4 text-nutrition" />
              Repas du jour
            </h2>
            <span className="num text-xs text-text-tertiary">
              {todayMeals.length} {todayMeals.length <= 1 ? "repas" : "repas"}
            </span>
          </div>

          {todayMeals.length === 0 ? (
            <div className="text-center py-10">
              <Sparkles className="w-8 h-8 text-text-disabled mx-auto mb-2" />
              <p className="text-sm text-text-secondary">Pas encore de repas aujourd&apos;hui</p>
              <p className="text-xs text-text-tertiary mt-1">Logge ton premier repas à gauche</p>
            </div>
          ) : (
            <div className="space-y-2">
              {todayMeals.map((meal) => {
                const mealLabel = MEAL_TYPES.find((t) => t.value === meal.mealType)?.label || meal.mealType;
                const mealTime = new Date(meal.eatenAt).toLocaleTimeString("fr-FR", {
                  hour: "2-digit",
                  minute: "2-digit",
                });
                return (
                  <div
                    key={meal.id}
                    className="rounded-xl border border-border-subtle bg-bg-tertiary p-3 hover-lift"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Badge variant="nutrition" size="sm">
                          {mealLabel}
                        </Badge>
                        <span className="num text-[10px] text-text-tertiary">{mealTime}</span>
                      </div>
                      <span className="num text-sm font-semibold text-nutrition">
                        {meal.calories} kcal
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                      {meal.foods.slice(0, 3).map((f, i) => (
                        <span key={i} className="text-xs text-text-secondary">
                          {f.name}
                        </span>
                      ))}
                      {meal.foods.length > 3 && (
                        <span className="text-xs text-text-tertiary">
                          +{meal.foods.length - 3}
                        </span>
                      )}
                    </div>
                    <div className="num mt-2 pt-2 border-t border-border-subtle flex gap-3 text-[11px] text-text-tertiary">
                      <span>
                        <span className="text-info">{Math.round(meal.protein)}</span> P
                      </span>
                      <span>
                        <span className="text-warning">{Math.round(meal.carbs)}</span> G
                      </span>
                      <span>
                        <span className="text-accent-2">{Math.round(meal.fat)}</span> L
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {/* ── Tip T1D compact ── */}
      <section className="mt-4 surface-1 rounded-2xl p-4 flex items-start gap-3">
        <div className="shrink-0 w-8 h-8 rounded-lg bg-diabete/15 flex items-center justify-center">
          <Droplet className="w-4 h-4 text-diabete" />
        </div>
        <div className="flex-1">
          <p className="text-xs font-medium text-text-primary">
            Diabète T1 · Pense au bolus
          </p>
          <p className="text-xs text-text-tertiary mt-0.5">
            Calcule ton insuline selon les glucides de chaque repas. Vérifie la glycémie 2h après.
          </p>
        </div>
      </section>
    </div>
  );
}

// ────────────────────────────────────────────────
// Sub-components
// ────────────────────────────────────────────────

function MacroRow({
  label,
  value,
  max,
  color,
  varColor,
}: {
  label: string;
  value: number;
  max: number;
  color: "accent" | "warning" | "info";
  varColor: string;
}) {
  const rounded = Math.round(value);
  const remaining = Math.max(0, max - rounded);
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1.5">
        <span className="label">{label}</span>
        <div className="flex items-baseline gap-1 num">
          <span className="text-lg font-semibold" style={{ color: varColor }}>
            {rounded}
          </span>
          <span className="text-xs text-text-tertiary">/ {max}g</span>
          <span className="text-[10px] text-text-disabled ml-1">
            {remaining > 0 ? `–${remaining}g` : "✓"}
          </span>
        </div>
      </div>
      <Progress value={rounded} max={max} color={color} size="md" />
    </div>
  );
}

function ManualInput({
  value,
  onChange,
  placeholder,
}: {
  value: number;
  onChange: (v: number) => void;
  placeholder: string;
}) {
  return (
    <input
      type="number"
      inputMode="numeric"
      value={value || ""}
      onChange={(e) => onChange(Number(e.target.value))}
      placeholder={placeholder}
      className="num bg-bg-secondary border border-border-subtle rounded-lg px-2 py-1.5 text-xs text-text-primary placeholder:text-text-disabled focus:outline-none focus:border-nutrition/50 min-w-0"
    />
  );
}
