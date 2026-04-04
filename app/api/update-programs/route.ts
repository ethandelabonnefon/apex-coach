import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic();

export async function POST(request: Request) {
  try {
    const { previousDiagnostic, newDiagnostic, diff, currentProgram, userContext } = await request.json();

    const prompt = `CONTEXTE UTILISATEUR :
- Nom : ${userContext.name}, ${userContext.age} ans, ${userContext.height}cm, ${userContext.weight}kg
- Diabète T1 (à prendre en compte pour la récupération)
- Objectifs : ${userContext.goals?.join(', ') || 'Prise de masse + Semi-marathon'}

ANCIEN DIAGNOSTIC :
${previousDiagnostic ? JSON.stringify(previousDiagnostic, null, 2) : 'Aucun diagnostic précédent'}

NOUVEAU DIAGNOSTIC :
${JSON.stringify(newDiagnostic, null, 2)}

CHANGEMENTS DÉTECTÉS :
${JSON.stringify(diff, null, 2)}

PROGRAMME ACTUEL :
${JSON.stringify(currentProgram, null, 2)}

══════════════════════════════════════════════════════════════

GÉNÈRE UNE ANALYSE DES MODIFICATIONS À APPORTER AU PROGRAMME avec cette structure JSON :

{
  "summary": {
    "changesDetected": ["description courte de chaque changement"],
    "programModifications": ["description de chaque modification"],
    "expectedOutcomes": ["résultat attendu en 8 semaines"]
  },
  "comparativeAnalysis": [
    {
      "aspect": "nom de l'aspect modifié",
      "before": "ce que le programme faisait",
      "after": "ce que le nouveau programme fait",
      "reasoning": "explication scientifique détaillée",
      "scientificBasis": "référence étude si pertinent"
    }
  ],
  "exerciseChanges": [
    {
      "oldExercise": "ancien exercice",
      "newExercise": "nouvel exercice",
      "reason": "raison du changement (1-2 phrases)",
      "expectedBenefit": "bénéfice attendu"
    }
  ],
  "volumeAdjustments": {
    "muscleGroup": { "before": 16, "after": 20, "reason": "raison" }
  },
  "priorities": [
    { "rank": 1, "muscle": "nom", "reason": "raison" }
  ],
  "predictions": {
    "week8": {
      "measurements": "changements de mensurations attendus",
      "strength": "gains de force attendus",
      "visual": "améliorations visuelles attendues"
    }
  },
  "fullAnalysis": "Analyse complète en texte libre avec tous les détails, raisonnements scientifiques et recommandations. 3-5 paragraphes."
}

Réponds UNIQUEMENT avec le JSON, sans texte avant ou après. Sois précis et scientifique dans tes recommandations. Cite des études quand pertinent. Réponds en français.`;

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 3000,
      messages: [{ role: "user", content: prompt }],
    });

    const textBlock = message.content.find((b) => b.type === "text");
    const responseText = textBlock?.text || "{}";

    // Parse JSON from response (handle potential markdown wrapping)
    let parsed;
    try {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
    } catch {
      parsed = { fullAnalysis: responseText, summary: { changesDetected: [], programModifications: [], expectedOutcomes: [] } };
    }

    return Response.json(parsed);
  } catch (error) {
    console.error("Erreur update-programs:", error);
    const message = error instanceof Error ? error.message : "Erreur inconnue";
    return Response.json({ error: message }, { status: 500 });
  }
}
