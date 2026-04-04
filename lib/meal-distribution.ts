// ============================================
// Meal Distribution — Macro split per meal
// ============================================

export interface MealSlot {
  name: string;
  time: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  isAroundWorkout: boolean;
  suggestions: string[];
}

export interface MealPlan {
  meals: MealSlot[];
}

export function distributeMacrosToMeals(
  macros: { protein: number; carbs: number; fat: number },
  mealsPerDay: number,
  carbTiming: string
): MealPlan {
  const meals: MealSlot[] = [];

  if (mealsPerDay === 3) {
    meals.push({
      name: "Petit-déjeuner",
      time: "7h30",
      calories: 0,
      protein: Math.round(macros.protein * 0.3),
      carbs: Math.round(macros.carbs * 0.3),
      fat: Math.round(macros.fat * 0.3),
      isAroundWorkout: false,
      suggestions: ["Oeufs + avocat + pain complet", "Fromage blanc + granola + fruits"],
    });
    meals.push({
      name: "Déjeuner",
      time: "12h30",
      calories: 0,
      protein: Math.round(macros.protein * 0.35),
      carbs: Math.round(macros.carbs * 0.35),
      fat: Math.round(macros.fat * 0.35),
      isAroundWorkout: false,
      suggestions: ["Poulet + riz + légumes", "Saumon + quinoa + salade"],
    });
    meals.push({
      name: "Dîner",
      time: "20h00",
      calories: 0,
      protein: Math.round(macros.protein * 0.35),
      carbs: Math.round(macros.carbs * 0.35),
      fat: Math.round(macros.fat * 0.35),
      isAroundWorkout: false,
      suggestions: ["Pâtes + viande + légumes", "Bowl riz + poisson + avocat"],
    });
  } else if (mealsPerDay === 4) {
    const isWorkoutTiming = carbTiming === "around_workout";

    meals.push({
      name: "Petit-déjeuner",
      time: "7h30",
      calories: 0,
      protein: Math.round(macros.protein * 0.25),
      carbs: Math.round(macros.carbs * (isWorkoutTiming ? 0.2 : 0.25)),
      fat: Math.round(macros.fat * 0.25),
      isAroundWorkout: false,
      suggestions: ["Oeufs + avocat + pain complet", "Fromage blanc + granola + fruits"],
    });
    meals.push({
      name: "Déjeuner",
      time: "12h30",
      calories: 0,
      protein: Math.round(macros.protein * 0.3),
      carbs: Math.round(macros.carbs * 0.25),
      fat: Math.round(macros.fat * 0.3),
      isAroundWorkout: false,
      suggestions: ["Poulet + riz + légumes", "Saumon + quinoa + salade"],
    });
    meals.push({
      name: "Pré-workout / Collation",
      time: "16h30",
      calories: 0,
      protein: Math.round(macros.protein * 0.15),
      carbs: Math.round(macros.carbs * (isWorkoutTiming ? 0.25 : 0.2)),
      fat: Math.round(macros.fat * 0.1),
      isAroundWorkout: true,
      suggestions: ["Banane + whey", "Flocons d'avoine + protéine", "Riz + blanc de poulet"],
    });
    meals.push({
      name: "Post-workout / Dîner",
      time: "20h00",
      calories: 0,
      protein: Math.round(macros.protein * 0.3),
      carbs: Math.round(macros.carbs * 0.3),
      fat: Math.round(macros.fat * 0.35),
      isAroundWorkout: true,
      suggestions: ["Pâtes + viande + légumes", "Bowl riz + saumon + avocat"],
    });
  } else if (mealsPerDay === 5) {
    meals.push({
      name: "Petit-déjeuner",
      time: "7h00",
      calories: 0,
      protein: Math.round(macros.protein * 0.2),
      carbs: Math.round(macros.carbs * 0.2),
      fat: Math.round(macros.fat * 0.2),
      isAroundWorkout: false,
      suggestions: ["Oeufs + pain complet + fruit"],
    });
    meals.push({
      name: "Collation matin",
      time: "10h00",
      calories: 0,
      protein: Math.round(macros.protein * 0.15),
      carbs: Math.round(macros.carbs * 0.15),
      fat: Math.round(macros.fat * 0.15),
      isAroundWorkout: false,
      suggestions: ["Yaourt grec + amandes", "Whey + banane"],
    });
    meals.push({
      name: "Déjeuner",
      time: "12h30",
      calories: 0,
      protein: Math.round(macros.protein * 0.25),
      carbs: Math.round(macros.carbs * 0.25),
      fat: Math.round(macros.fat * 0.25),
      isAroundWorkout: false,
      suggestions: ["Poulet + riz + légumes"],
    });
    meals.push({
      name: "Pré-workout",
      time: "16h30",
      calories: 0,
      protein: Math.round(macros.protein * 0.15),
      carbs: Math.round(macros.carbs * 0.25),
      fat: Math.round(macros.fat * 0.1),
      isAroundWorkout: true,
      suggestions: ["Banane + whey", "Riz + poulet"],
    });
    meals.push({
      name: "Dîner",
      time: "20h00",
      calories: 0,
      protein: Math.round(macros.protein * 0.25),
      carbs: Math.round(macros.carbs * 0.15),
      fat: Math.round(macros.fat * 0.3),
      isAroundWorkout: false,
      suggestions: ["Saumon + patates douces + brocoli"],
    });
  } else {
    // 6 meals — spread evenly
    const names = ["Petit-déjeuner", "Collation 1", "Déjeuner", "Collation 2", "Dîner", "Collation soir"];
    const times = ["7h00", "9h30", "12h00", "15h00", "19h00", "21h30"];
    for (let i = 0; i < 6; i++) {
      const ratio = i === 0 || i === 2 || i === 4 ? 0.2 : 0.13;
      meals.push({
        name: names[i],
        time: times[i],
        calories: 0,
        protein: Math.round(macros.protein * ratio),
        carbs: Math.round(macros.carbs * ratio),
        fat: Math.round(macros.fat * ratio),
        isAroundWorkout: i === 3,
        suggestions: [],
      });
    }
  }

  // Calculate calories for each meal
  for (const meal of meals) {
    meal.calories = meal.protein * 4 + meal.carbs * 4 + meal.fat * 9;
  }

  return { meals };
}
