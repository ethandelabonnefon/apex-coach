import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic();

export async function POST(request: Request) {
  try {
    const { diagnosticData, userContext, bodyMapAnalysis, morphologyData } = await request.json();

    const prompt = `PROFIL UTILISATEUR :
- Nom : ${userContext.name}, ${userContext.age} ans, ${userContext.height}cm, ${userContext.weight}kg
- Diabète T1 : Oui
- Objectifs : ${userContext.goals?.join(', ') || 'Prise de masse + Semi-marathon'}

DIAGNOSTIC MUSCULATION :
${JSON.stringify(diagnosticData, null, 2)}

BODY MAP (analyse points forts/faibles) :
${bodyMapAnalysis || 'Non disponible'}

DONNÉES MORPHOLOGIQUES :
${morphologyData ? JSON.stringify(morphologyData, null, 2) : 'Non disponible'}

══════════════════════════════════════════════════════════════

GÉNÈRE UN PROGRAMME MUSCULATION PERSONNALISÉ avec cette structure JSON :

{
  "fullAnalysis": "Analyse complète en texte libre : profil, stratégie, justifications scientifiques. 3-5 paragraphes en français.",
  "programName": "Nom du programme",
  "mesocycleDuration": 8,
  "split": "Type de split choisi et pourquoi",
  "sessions": [
    {
      "day": "Lundi",
      "name": "Push A",
      "focus": "Pectoraux / Épaules / Triceps",
      "duration": 65,
      "exercises": [
        {
          "name": "Développé couché haltères",
          "sets": 4,
          "reps": "8-10",
          "rir": 2,
          "rest": 150,
          "reasoning": "Choisi car...",
          "cues": ["Omoplates rétractées", "Coudes 45°"],
          "alternatives": ["DC barre prise serrée"]
        }
      ],
      "t1dNotes": "Glycémie cible avant : 140. Surveiller post-séance."
    }
  ],
  "volumePerMuscle": {
    "Pectoraux": { "setsPerWeek": 16, "justification": "..." },
    "Dos": { "setsPerWeek": 18, "justification": "..." }
  },
  "progression": {
    "week4": "Objectifs semaine 4",
    "week8": "Objectifs semaine 8",
    "week12": "Objectifs semaine 12"
  },
  "t1dProtocol": {
    "preworkout": "Recommandations pré-entraînement",
    "postworkout": "Recommandations post-entraînement",
    "alerts": ["Signaux d'alerte"]
  },
  "summary": {
    "changesDetected": ["Point clé 1", "Point clé 2"],
    "programModifications": ["Modification 1"],
    "expectedOutcomes": ["Résultat attendu"]
  }
}

Réponds UNIQUEMENT avec le JSON, sans texte avant ou après. Sois précis et scientifique. Réponds en français.`;

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4000,
      messages: [{ role: "user", content: prompt }],
    });

    const textBlock = message.content.find((b) => b.type === "text");
    const responseText = textBlock?.text || "{}";

    let parsed;
    try {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
    } catch {
      parsed = { fullAnalysis: responseText, summary: { changesDetected: [], programModifications: [], expectedOutcomes: [] } };
    }

    return Response.json(parsed);
  } catch (error) {
    console.error("Erreur generate-muscu-program:", error);
    const message = error instanceof Error ? error.message : "Erreur inconnue";
    return Response.json({ error: message }, { status: 500 });
  }
}
