"use client";

import React, { useState, useMemo, useCallback } from "react";
import {
  Card,
  PageHeader,
  Button,
  Badge,
  ProgressBar,
  SectionTitle,
  InfoBox,
} from "@/components/ui";
import { useStore } from "@/lib/store";
import type { FoodItem, Meal } from "@/types";
import NutritionDiagnosticForm from "@/components/nutrition/NutritionDiagnosticForm";
import NutritionResults from "@/components/nutrition/NutritionResults";
import { calculateNutrition, type NutritionDiagnosticData, type NutritionCalculation } from "@/lib/nutrition-calculator";
import { distributeMacrosToMeals, type MealPlan } from "@/lib/meal-distribution";

// ============================================
// Quick-add food presets
// ============================================

const QUICK_FOODS: FoodItem[] = [
  { name: "Poulet 150g", quantity: 150, unit: "g", calories: 248, protein: 46, carbs: 0, fat: 5 },
  { name: "Riz 200g cuit", quantity: 200, unit: "g", calories: 260, protein: 5, carbs: 56, fat: 1 },
  { name: "Banane", quantity: 120, unit: "g", calories: 105, protein: 1, carbs: 27, fat: 0 },
  { name: "Whey 30g", quantity: 30, unit: "g", calories: 120, protein: 24, carbs: 3, fat: 1 },
  { name: "Avoine 80g", quantity: 80, unit: "g", calories: 300, protein: 10, carbs: 54, fat: 6 },
  { name: "Oeufs x3", quantity: 180, unit: "g", calories: 210, protein: 18, carbs: 1, fat: 15 },
];

const MEAL_TYPES = [
  { value: "petit-dejeuner", label: "Petit-déjeuner" },
  { value: "dejeuner", label: "Déjeuner" },
  { value: "diner", label: "Dîner" },
  { value: "collation", label: "Collation" },
];

// ============================================
// Macro ring gauge component
// ============================================

function MacroRing({
  value,
  max,
  color,
  label,
  unit,
}: {
  value: number;
  max: number;
  color: string;
  label: string;
  unit: string;
}) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (pct / 100) * circumference;
  const remaining = Math.max(0, max - value);

  return (
    <div className="flex flex-col items-center">
      <div className="relative w-24 h-24">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 80 80">
          <circle cx="40" cy="40" r={radius} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="6" />
          <circle
            cx="40"
            cy="40"
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            className="transition-all duration-500"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-base font-bold" style={{ color }}>
            {Math.round(value)}
          </span>
          <span className="text-[10px] text-white/35">{unit}</span>
        </div>
      </div>
      <p className="text-xs text-white/50 mt-1">{label}</p>
      <p className="text-[10px] text-white/30">
        Reste {remaining}
        {unit === "kcal" ? " kcal" : "g"}
      </p>
    </div>
  );
}

// ============================================
// Meal Logger Form
// ============================================

const EMPTY_FOOD: Omit<FoodItem, "unit"> = {
  name: "",
  quantity: 0,
  calories: 0,
  protein: 0,
  carbs: 0,
  fat: 0,
};

export default function NutritionPage() {
  const { profile, meals, addMeal, nutritionDiagnosticCompleted, nutritionDiagnosticData, setNutritionDiagnosticData, nutritionTargets, setNutritionTargets, updateProfile } = useStore();

  // Views: "tracker" | "diagnostic" | "results"
  const [view, setView] = useState<"tracker" | "diagnostic" | "results">(
    nutritionDiagnosticCompleted ? "tracker" : "diagnostic"
  );
  const [calculation, setCalculation] = useState<NutritionCalculation | null>(null);
  const [diagnosticSnapshot, setDiagnosticSnapshot] = useState<NutritionDiagnosticData | null>(null);
  const [mealPlan, setMealPlan] = useState<MealPlan | null>(null);

  // Form state
  const [mealType, setMealType] = useState("petit-dejeuner");
  const [mealName, setMealName] = useState("");
  const [foods, setFoods] = useState<FoodItem[]>([]);
  const [currentFood, setCurrentFood] = useState<Omit<FoodItem, "unit">>({ ...EMPTY_FOOD });
  const [isTrainingDay, setIsTrainingDay] = useState(true);

  // ---- Today's data ----
  const today = new Date();
  const todayStr = today.toDateString();

  const todayMeals = useMemo(
    () => meals.filter((m) => new Date(m.eatenAt).toDateString() === todayStr),
    [meals, todayStr]
  );

  const totals = useMemo(() => {
    return todayMeals.reduce(
      (acc, m) => ({
        calories: acc.calories + m.calories,
        protein: acc.protein + m.protein,
        carbs: acc.carbs + m.carbs,
        fat: acc.fat + m.fat,
      }),
      { calories: 0, protein: 0, carbs: 0, fat: 0 }
    );
  }, [todayMeals]);

  // ---- Form food totals ----
  const formTotals = useMemo(() => {
    return foods.reduce(
      (acc, f) => ({
        calories: acc.calories + f.calories,
        protein: acc.protein + f.protein,
        carbs: acc.carbs + f.carbs,
        fat: acc.fat + f.fat,
      }),
      { calories: 0, protein: 0, carbs: 0, fat: 0 }
    );
  }, [foods]);

  // ---- Handlers ----
  function addFoodToList() {
    if (!currentFood.name.trim()) return;
    setFoods((prev) => [...prev, { ...currentFood, unit: "g" }]);
    setCurrentFood({ ...EMPTY_FOOD });
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
      name: mealName || MEAL_TYPES.find((t) => t.value === mealType)?.label || mealType,
      calories: formTotals.calories,
      protein: formTotals.protein,
      carbs: formTotals.carbs,
      fat: formTotals.fat,
      foods: [...foods],
      eatenAt: new Date(),
    };
    addMeal(meal);
    setFoods([]);
    setMealName("");
    setCurrentFood({ ...EMPTY_FOOD });
  }

  // ---- Diagnostic complete handler ----
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

  // ---- Apply nutrition targets ----
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

  // ---- Targets (from diagnostic or profile fallback) ----
  const targets = nutritionTargets || {
    calories: profile.targetCalories || 3000,
    protein: profile.targetProtein || 170,
    carbs: profile.targetCarbs || 350,
    fat: profile.targetFat || 85,
  };

  // ──────────────────────────────────────────────
  // DIAGNOSTIC VIEW
  // ──────────────────────────────────────────────
  if (view === "diagnostic") {
    return (
      <div className="p-6 md:p-8 max-w-7xl mx-auto">
        <PageHeader
          title="Diagnostic Nutritionnel"
          subtitle="Calcul personnalisé de tes besoins caloriques et macros"
          action={
            nutritionDiagnosticCompleted ? (
              <Button variant="ghost" size="sm" onClick={() => setView("tracker")}>
                Retour au suivi
              </Button>
            ) : undefined
          }
        />
        <NutritionDiagnosticForm onComplete={handleDiagnosticComplete} />
      </div>
    );
  }

  // ──────────────────────────────────────────────
  // RESULTS VIEW
  // ──────────────────────────────────────────────
  if (view === "results" && calculation && diagnosticSnapshot && mealPlan) {
    return (
      <div className="p-6 md:p-8 max-w-7xl mx-auto">
        <PageHeader
          title="Tes Objectifs Nutritionnels"
          subtitle="Calculés sur mesure avec tes données"
        />
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

  // ──────────────────────────────────────────────
  // TRACKER VIEW (main page)
  // ──────────────────────────────────────────────
  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto">
      <PageHeader
        title="Nutrition"
        subtitle="Suivi nutritionnel et macros du jour"
        action={
          <div className="flex items-center gap-2">
            <Badge color={isTrainingDay ? "green" : "blue"}>
              {isTrainingDay ? "Jour d'entraînement" : "Jour de repos"}
            </Badge>
            <Button variant="ghost" size="sm" onClick={() => setView("diagnostic")}>
              {nutritionDiagnosticCompleted ? "Refaire le diagnostic" : "Diagnostic"}
            </Button>
          </div>
        }
      />

      {/* ========== Daily Summary ========== */}
      <Card className="mb-6" glow="green">
        <SectionTitle>Résumé du jour</SectionTitle>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-6">
          <MacroRing value={totals.calories} max={targets.calories} color="#00ff94" label="Calories" unit="kcal" />
          <MacroRing value={totals.protein} max={targets.protein} color="#00d4ff" label="Protéines" unit="g" />
          <MacroRing value={totals.carbs} max={targets.carbs} color="#ff9500" label="Glucides" unit="g" />
          <MacroRing value={totals.fat} max={targets.fat} color="#a855f7" label="Lipides" unit="g" />
        </div>
        <div className="space-y-3">
          <ProgressBar value={totals.calories} max={targets.calories} color="#00ff94" label="Calories" />
          <ProgressBar value={Math.round(totals.protein)} max={targets.protein} color="#00d4ff" label="Protéines (g)" />
          <ProgressBar value={Math.round(totals.carbs)} max={targets.carbs} color="#ff9500" label="Glucides (g)" />
          <ProgressBar value={Math.round(totals.fat)} max={targets.fat} color="#a855f7" label="Lipides (g)" />
        </div>
      </Card>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* ========== Left column: Meal Logger ========== */}
        <div className="space-y-6">
          {/* Meal form */}
          <Card>
            <SectionTitle>Logger un repas</SectionTitle>

            {/* Meal type & name */}
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <label className="text-xs text-white/40 mb-1 block">Type de repas</label>
                <select
                  value={mealType}
                  onChange={(e) => setMealType(e.target.value)}
                  className="w-full bg-white/[0.06] border border-white/[0.06] rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-[#00ff94]/50"
                >
                  {MEAL_TYPES.map((t) => (
                    <option key={t.value} value={t.value} className="bg-[#0a0a0a]">
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-white/40 mb-1 block">Nom du repas</label>
                <input
                  type="text"
                  value={mealName}
                  onChange={(e) => setMealName(e.target.value)}
                  placeholder="ex: Post-training"
                  className="w-full bg-white/[0.06] border border-white/[0.06] rounded-xl px-3 py-2 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-[#00ff94]/50"
                />
              </div>
            </div>

            {/* Quick add */}
            <div className="mb-4">
              <p className="text-xs text-white/40 mb-2">Ajout rapide</p>
              <div className="flex flex-wrap gap-2">
                {QUICK_FOODS.map((food) => (
                  <button
                    key={food.name}
                    type="button"
                    onClick={() => addQuickFood(food)}
                    className="px-3 py-1.5 text-xs rounded-lg bg-[#00ff94]/10 text-[#00ff94] hover:bg-[#00ff94]/20 transition-colors border border-[#00ff94]/20"
                  >
                    + {food.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Add food manually */}
            <div className="border border-white/[0.06] rounded-xl p-3 mb-4">
              <p className="text-xs text-white/40 mb-2">Ajouter un aliment</p>
              <div className="grid grid-cols-2 gap-2 mb-2">
                <input
                  type="text"
                  value={currentFood.name}
                  onChange={(e) => setCurrentFood((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Nom"
                  className="bg-white/[0.04] border border-white/[0.06] rounded-lg px-2.5 py-1.5 text-xs text-white placeholder:text-white/20 focus:outline-none focus:border-[#00ff94]/50"
                />
                <input
                  type="number"
                  value={currentFood.quantity || ""}
                  onChange={(e) => setCurrentFood((f) => ({ ...f, quantity: Number(e.target.value) }))}
                  placeholder="Quantité (g)"
                  className="bg-white/[0.04] border border-white/[0.06] rounded-lg px-2.5 py-1.5 text-xs text-white placeholder:text-white/20 focus:outline-none focus:border-[#00ff94]/50"
                />
              </div>
              <div className="grid grid-cols-4 gap-2 mb-3">
                <input
                  type="number"
                  value={currentFood.calories || ""}
                  onChange={(e) => setCurrentFood((f) => ({ ...f, calories: Number(e.target.value) }))}
                  placeholder="Calories"
                  className="bg-white/[0.04] border border-white/[0.06] rounded-lg px-2.5 py-1.5 text-xs text-white placeholder:text-white/20 focus:outline-none focus:border-[#00ff94]/50"
                />
                <input
                  type="number"
                  value={currentFood.protein || ""}
                  onChange={(e) => setCurrentFood((f) => ({ ...f, protein: Number(e.target.value) }))}
                  placeholder="Prot (g)"
                  className="bg-white/[0.04] border border-white/[0.06] rounded-lg px-2.5 py-1.5 text-xs text-white placeholder:text-white/20 focus:outline-none focus:border-[#00ff94]/50"
                />
                <input
                  type="number"
                  value={currentFood.carbs || ""}
                  onChange={(e) => setCurrentFood((f) => ({ ...f, carbs: Number(e.target.value) }))}
                  placeholder="Gluc (g)"
                  className="bg-white/[0.04] border border-white/[0.06] rounded-lg px-2.5 py-1.5 text-xs text-white placeholder:text-white/20 focus:outline-none focus:border-[#00ff94]/50"
                />
                <input
                  type="number"
                  value={currentFood.fat || ""}
                  onChange={(e) => setCurrentFood((f) => ({ ...f, fat: Number(e.target.value) }))}
                  placeholder="Lip (g)"
                  className="bg-white/[0.04] border border-white/[0.06] rounded-lg px-2.5 py-1.5 text-xs text-white placeholder:text-white/20 focus:outline-none focus:border-[#00ff94]/50"
                />
              </div>
              <Button size="sm" variant="secondary" onClick={addFoodToList}>
                + Ajouter l&apos;aliment
              </Button>
            </div>

            {/* Foods list for current meal */}
            {foods.length > 0 && (
              <div className="mb-4">
                <p className="text-xs text-white/40 mb-2">Aliments ajoutés</p>
                <div className="space-y-1.5">
                  {foods.map((food, i) => (
                    <div
                      key={`${food.name}-${i}`}
                      className="flex items-center justify-between px-3 py-2 rounded-lg bg-white/[0.03]"
                    >
                      <div className="flex-1 min-w-0">
                        <span className="text-sm text-white/80 truncate block">{food.name}</span>
                        <span className="text-[10px] text-white/30">
                          {food.calories} kcal · P:{food.protein}g · G:{food.carbs}g · L:{food.fat}g
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeFoodFromList(i)}
                        className="ml-2 text-[#ff4757]/60 hover:text-[#ff4757] text-xs transition-colors"
                      >
                        Retirer
                      </button>
                    </div>
                  ))}
                </div>
                {/* Form totals */}
                <div className="mt-3 pt-3 border-t border-white/[0.06] flex items-center justify-between">
                  <div className="flex gap-4 text-xs text-white/50">
                    <span>
                      <span className="text-[#00ff94] font-semibold">{formTotals.calories}</span> kcal
                    </span>
                    <span>
                      P: <span className="text-[#00d4ff] font-semibold">{formTotals.protein}</span>g
                    </span>
                    <span>
                      G: <span className="text-[#ff9500] font-semibold">{formTotals.carbs}</span>g
                    </span>
                    <span>
                      L: <span className="text-[#a855f7] font-semibold">{formTotals.fat}</span>g
                    </span>
                  </div>
                  <Button onClick={saveMeal} size="sm">
                    Enregistrer le repas
                  </Button>
                </div>
              </div>
            )}

            {foods.length === 0 && (
              <p className="text-xs text-white/25 text-center py-4">
                Ajoute des aliments pour composer ton repas
              </p>
            )}
          </Card>

          {/* ========== Macro Split Advice ========== */}
          <Card>
            <div className="flex items-center justify-between mb-3">
              <SectionTitle className="mb-0">Conseils macros</SectionTitle>
              <button
                type="button"
                onClick={() => setIsTrainingDay((v) => !v)}
                className="text-xs text-white/40 hover:text-white/70 transition-colors px-2 py-1 rounded-lg bg-white/[0.04]"
              >
                Basculer {isTrainingDay ? "repos" : "training"}
              </button>
            </div>

            {isTrainingDay ? (
              <div className="space-y-3">
                <InfoBox variant="success">
                  <p className="font-semibold mb-1">Jour d&apos;entraînement</p>
                  <p className="text-xs opacity-80">
                    Objectif : {targets.calories} kcal — Protéines {targets.protein}g, Glucides {targets.carbs}g, Lipides {targets.fat}g.
                    Privilégie les glucides autour de l&apos;entraînement.
                  </p>
                </InfoBox>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="p-3 rounded-lg bg-white/[0.03]">
                    <p className="text-[10px] text-white/35 mb-1">Protéines</p>
                    <p className="text-sm font-bold text-[#00d4ff]">25%</p>
                    <p className="text-[10px] text-white/30">{targets.protein}g</p>
                  </div>
                  <div className="p-3 rounded-lg bg-white/[0.03]">
                    <p className="text-[10px] text-white/35 mb-1">Glucides</p>
                    <p className="text-sm font-bold text-[#ff9500]">50%</p>
                    <p className="text-[10px] text-white/30">{targets.carbs}g</p>
                  </div>
                  <div className="p-3 rounded-lg bg-white/[0.03]">
                    <p className="text-[10px] text-white/35 mb-1">Lipides</p>
                    <p className="text-sm font-bold text-[#a855f7]">25%</p>
                    <p className="text-[10px] text-white/30">{targets.fat}g</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <InfoBox variant="info">
                  <p className="font-semibold mb-1">Jour de repos</p>
                  <p className="text-xs opacity-80">
                    Réduis les glucides de ~20%. Augmente légèrement les lipides. Objectif ajusté : ~{Math.round(targets.calories * 0.9)} kcal.
                  </p>
                </InfoBox>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="p-3 rounded-lg bg-white/[0.03]">
                    <p className="text-[10px] text-white/35 mb-1">Protéines</p>
                    <p className="text-sm font-bold text-[#00d4ff]">30%</p>
                    <p className="text-[10px] text-white/30">{targets.protein}g</p>
                  </div>
                  <div className="p-3 rounded-lg bg-white/[0.03]">
                    <p className="text-[10px] text-white/35 mb-1">Glucides</p>
                    <p className="text-sm font-bold text-[#ff9500]">40%</p>
                    <p className="text-[10px] text-white/30">{Math.round(targets.carbs * 0.8)}g</p>
                  </div>
                  <div className="p-3 rounded-lg bg-white/[0.03]">
                    <p className="text-[10px] text-white/35 mb-1">Lipides</p>
                    <p className="text-sm font-bold text-[#a855f7]">30%</p>
                    <p className="text-[10px] text-white/30">{Math.round(targets.fat * 1.15)}g</p>
                  </div>
                </div>
              </div>
            )}

            {/* T1D carbs timing */}
            <div className="mt-4 pt-4 border-t border-white/[0.06]">
              <p className="text-xs text-white/50 font-semibold mb-2">Timing glucides — Diabète T1</p>
              <div className="space-y-2">
                <div className="flex items-start gap-2">
                  <span className="text-[#ff9500] text-xs mt-0.5">1.</span>
                  <p className="text-xs text-white/50">
                    <span className="text-white/70 font-medium">Pré-entraînement (1-2h avant) :</span>{" "}
                    30-50g de glucides lents (avoine, riz). Ajuster le bolus à -30% si cardio prévu.
                  </p>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-[#ff9500] text-xs mt-0.5">2.</span>
                  <p className="text-xs text-white/50">
                    <span className="text-white/70 font-medium">Pendant (si &gt;60min) :</span>{" "}
                    15-30g glucides rapides (banane, gel). Pas de bolus.
                  </p>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-[#ff9500] text-xs mt-0.5">3.</span>
                  <p className="text-xs text-white/50">
                    <span className="text-white/70 font-medium">Post-entraînement (dans les 30min) :</span>{" "}
                    Whey + 40-60g glucides rapides. Bolus normal ou +10% si muscu intense (montée glycémique).
                  </p>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-[#ff9500] text-xs mt-0.5">4.</span>
                  <p className="text-xs text-white/50">
                    <span className="text-white/70 font-medium">Soir :</span>{" "}
                    Glucides modérés. Surveiller la remontée nocturne si grosse séance.
                  </p>
                </div>
              </div>
            </div>
          </Card>
        </div>

        {/* ========== Right column: Today's Meals ========== */}
        <div className="space-y-6">
          <Card>
            <SectionTitle>Repas du jour</SectionTitle>
            {todayMeals.length === 0 ? (
              <div className="text-center py-10">
                <span className="text-4xl mb-4 block">🍽</span>
                <p className="text-white/60 font-medium">Aucun repas loggé</p>
                <p className="text-white/35 text-sm mt-1">Utilise le formulaire pour ajouter ton premier repas</p>
              </div>
            ) : (
              <div className="space-y-4">
                {todayMeals.map((meal) => {
                  const mealLabel = MEAL_TYPES.find((t) => t.value === meal.mealType)?.label || meal.mealType;
                  const mealTime = new Date(meal.eatenAt).toLocaleTimeString("fr-FR", {
                    hour: "2-digit",
                    minute: "2-digit",
                  });
                  return (
                    <div key={meal.id} className="border border-white/[0.06] rounded-xl p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <Badge
                            color={
                              meal.mealType === "petit-dejeuner"
                                ? "orange"
                                : meal.mealType === "dejeuner"
                                ? "green"
                                : meal.mealType === "diner"
                                ? "purple"
                                : "blue"
                            }
                          >
                            {mealLabel}
                          </Badge>
                          {meal.name !== mealLabel && <span className="text-sm text-white/60">{meal.name}</span>}
                        </div>
                        <span className="text-xs text-white/30">{mealTime}</span>
                      </div>

                      {/* Foods breakdown */}
                      {meal.foods.length > 0 && (
                        <div className="space-y-1 mb-3">
                          {meal.foods.map((food, i) => (
                            <div
                              key={`${food.name}-${i}`}
                              className="flex items-center justify-between text-xs px-2 py-1 rounded bg-white/[0.02]"
                            >
                              <span className="text-white/60">{food.name}</span>
                              <span className="text-white/30">{food.calories} kcal</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Meal macro totals */}
                      <div className="flex gap-4 text-xs pt-2 border-t border-white/[0.04]">
                        <span>
                          <span className="text-[#00ff94] font-semibold">{meal.calories}</span>{" "}
                          <span className="text-white/30">kcal</span>
                        </span>
                        <span>
                          <span className="text-[#00d4ff] font-semibold">{Math.round(meal.protein)}</span>
                          <span className="text-white/30">g prot</span>
                        </span>
                        <span>
                          <span className="text-[#ff9500] font-semibold">{Math.round(meal.carbs)}</span>
                          <span className="text-white/30">g gluc</span>
                        </span>
                        <span>
                          <span className="text-[#a855f7] font-semibold">{Math.round(meal.fat)}</span>
                          <span className="text-white/30">g lip</span>
                        </span>
                      </div>
                    </div>
                  );
                })}

                {/* Day total summary card */}
                <div className="p-4 rounded-xl bg-[#00ff94]/[0.04] border border-[#00ff94]/10">
                  <p className="text-xs text-[#00ff94]/60 mb-2 font-semibold uppercase tracking-wider">Total du jour</p>
                  <div className="grid grid-cols-4 gap-3 text-center">
                    <div>
                      <p className="text-lg font-bold text-[#00ff94]">{totals.calories}</p>
                      <p className="text-[10px] text-white/30">kcal</p>
                    </div>
                    <div>
                      <p className="text-lg font-bold text-[#00d4ff]">{Math.round(totals.protein)}</p>
                      <p className="text-[10px] text-white/30">prot (g)</p>
                    </div>
                    <div>
                      <p className="text-lg font-bold text-[#ff9500]">{Math.round(totals.carbs)}</p>
                      <p className="text-[10px] text-white/30">gluc (g)</p>
                    </div>
                    <div>
                      <p className="text-lg font-bold text-[#a855f7]">{Math.round(totals.fat)}</p>
                      <p className="text-[10px] text-white/30">lip (g)</p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </Card>

          {/* T1D warning */}
          <InfoBox variant="warning">
            <p className="font-semibold mb-1">Rappel Diabète T1</p>
            <p className="text-xs opacity-80">
              Pense à calculer ton bolus en fonction des glucides de chaque repas. Utilise la page Diabète pour le calculateur d&apos;insuline.
              Vérifie ta glycémie 2h après chaque repas.
            </p>
          </InfoBox>
        </div>
      </div>
    </div>
  );
}
