import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic();

export async function POST(request: Request) {
  try {
    const { diagnosticData, userContext } = await request.json();

    // Calculate VMA and zones
    const vma = diagnosticData.calculatedVMA
      || (diagnosticData.vo2max ? Number(diagnosticData.vo2max) / 3.5 : null)
      || null;

    const maxHR = diagnosticData.maxHR
      ? Number(diagnosticData.maxHR)
      : diagnosticData.estimatedMaxHR
        || (220 - (userContext.age || 21));

    const restingHR = diagnosticData.restingHR ? Number(diagnosticData.restingHR) : null;

    const prompt = `PROFIL UTILISATEUR :
- Nom : ${userContext.name}, ${userContext.age} ans, ${userContext.height}cm, ${userContext.weight}kg
- Diabète T1 : Oui
- Objectifs : ${userContext.goals?.join(', ') || 'Semi-marathon'}

PROFIL RUNNING :
- Expérience : ${diagnosticData.runningExperience}
- Fréquence actuelle : ${diagnosticData.currentFrequency}x/semaine
- Distance max récente : ${diagnosticData.maxRecentDistance} km
- Courses officielles : ${(diagnosticData.officialRaces || []).join(', ') || 'Aucune'}
- Meilleurs temps : 5K ${diagnosticData.best5k || '?'}, 10K ${diagnosticData.best10k || '?'}, Semi ${diagnosticData.bestSemi || '?'}

DONNÉES PHYSIOLOGIQUES :
- VO2max : ${diagnosticData.vo2max || 'Non connue'}
- VMA estimée : ${vma ? vma.toFixed(1) + ' km/h' : 'À estimer'}
- FC repos : ${restingHR || 'Non connue'} bpm
- FC max : ${maxHR} bpm ${!diagnosticData.maxHR ? '(estimée 220 - âge)' : ''}
- Poids : ${diagnosticData.currentWeight || userContext.weight} kg

TEST TERRAIN :
- Test effectué : ${diagnosticData.skipTest ? 'Non (passé)' : diagnosticData.selectedTest || 'Non'}
- Résultat : ${diagnosticData.testResult ? diagnosticData.testResult + 'm' : 'N/A'}
- VMA calculée du test : ${diagnosticData.calculatedVMA ? diagnosticData.calculatedVMA + ' km/h' : 'N/A'}

OBJECTIF :
- Course : ${diagnosticData.primaryGoal}
- Temps cible : ${diagnosticData.targetTime === 'target' ? diagnosticData.targetTimeValue : diagnosticData.targetTime || 'Juste finir'}
- Date : ${diagnosticData.raceDate || 'Pas de date précise'}
- Jours disponibles : ${(diagnosticData.availableDays || []).join(', ')}
- Max sorties/semaine : ${diagnosticData.maxRunsPerWeek}

CONTRAINTES T1D :
- Moment préféré : ${diagnosticData.preferredRunTime}
- Hypos en courant : ${diagnosticData.hyposWhileRunning}
- Glycémie cible avant : ${diagnosticData.preRunTargetGlucose} mg/dL
- Chute glycémie : ${diagnosticData.glucoseDropRate}
- Glucides pendant : ${diagnosticData.carbsDuringRun === 'yes' ? diagnosticData.carbsAmount + 'g/h' : 'Non'}
- Ajustements insuline : ${(diagnosticData.insulinAdjustments || []).join(', ') || 'Aucun'}

══════════════════════════════════════════════════════════════

GÉNÈRE UN PLAN RUNNING PERSONNALISÉ avec cette structure JSON :

{
  "fullAnalysis": "Analyse complète : profil, faisabilité, stratégie. 3-5 paragraphes en français.",
  "vmaUsed": 14.0,
  "zones": [
    { "name": "Z1 - Récupération", "paceMin": "6:30", "paceMax": "7:30", "hrMin": 115, "hrMax": 135, "description": "60-70% VMA, récupération active" },
    { "name": "Z2 - Endurance", "paceMin": "5:30", "paceMax": "6:30", "hrMin": 135, "hrMax": 155, "description": "70-80% VMA, base aérobie" },
    { "name": "Z3 - Tempo", "paceMin": "5:00", "paceMax": "5:30", "hrMin": 155, "hrMax": 170, "description": "80-88% VMA, seuil" },
    { "name": "Z4 - Seuil", "paceMin": "4:30", "paceMax": "5:00", "hrMin": 170, "hrMax": 183, "description": "88-95% VMA, intervalles" },
    { "name": "Z5 - VMA", "paceMin": "4:15", "paceMax": "4:30", "hrMin": 183, "hrMax": 195, "description": "95-100% VMA, vitesse max aérobie" }
  ],
  "predictions": {
    "5K": "24:30",
    "10K": "51:00",
    "Semi": "1h52",
    "Marathon": "4h00"
  },
  "planDuration": 14,
  "phases": [
    { "name": "Base", "weeks": "1-4", "focus": "Construction aérobie" },
    { "name": "Développement", "weeks": "5-8", "focus": "Augmentation volume" },
    { "name": "Spécifique", "weeks": "9-12", "focus": "Allure course" },
    { "name": "Affûtage", "weeks": "13-14", "focus": "Récupération pré-course" }
  ],
  "weeklyPlan": [
    {
      "week": 1,
      "phase": "Base",
      "totalVolume": "22 km",
      "sessions": [
        {
          "day": "Mardi",
          "type": "easy",
          "name": "Sortie facile",
          "distance": 6.5,
          "duration": 42,
          "pace": { "min": "6:00", "max": "6:30" },
          "zone": "Z2",
          "structure": "Course continue",
          "t1dNotes": {
            "glucoseBefore": "140-170 mg/dL",
            "carbsDuring": "Non nécessaire (<45min)",
            "insulinAdjustment": "Réduire bolus de 30% si repas <2h avant"
          },
          "reasoning": "Construction de la base aérobie"
        }
      ]
    }
  ],
  "t1dProtocol": {
    "easyRuns": "Protocole pour sorties faciles",
    "intervals": "Protocole pour intervalles",
    "longRuns": "Protocole pour sorties longues",
    "alerts": ["Signaux d'alerte"]
  }
}

Réponds UNIQUEMENT avec le JSON, sans texte avant ou après. Sois précis et scientifique. Calcule les paces en min/km basés sur la VMA. Réponds en français.`;

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 6000,
      messages: [{ role: "user", content: prompt }],
    });

    const textBlock = message.content.find((b) => b.type === "text");
    const responseText = textBlock?.text || "{}";

    let parsed;
    try {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
    } catch {
      parsed = { fullAnalysis: responseText };
    }

    return Response.json(parsed);
  } catch (error) {
    console.error("Erreur generate-running-plan:", error);
    const message = error instanceof Error ? error.message : "Erreur inconnue";
    return Response.json({ error: message }, { status: 500 });
  }
}
