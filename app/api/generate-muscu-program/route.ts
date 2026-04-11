import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic();

export async function POST(request: Request) {
  try {
    const { diagnosticData, userContext, bodyMapAnalysis, morphologyData } = await request.json();

    // Extract 1RM data for personalized load suggestions
    const dc1rm = diagnosticData?.benchPress1RM || diagnosticData?.dc1rm || morphologyData?.historique?.benchPress1RM;
    const squat1rm = diagnosticData?.squat1RM || diagnosticData?.squat1rm || morphologyData?.historique?.squat1RM;
    const sdt1rm = diagnosticData?.deadlift1RM || diagnosticData?.sdt1rm || morphologyData?.historique?.deadlift1RM;

    const prompt = `Tu es un coach sportif expert (BPJEPS/DEJEPS), spécialisé en musculation et adaptation au diabète T1.

PROFIL ATHLÈTE :
- ${userContext.name}, ${userContext.age} ans, ${userContext.height}cm, ${userContext.weight}kg
- Diabète T1 : Oui — séances < 60 min, éviter volume excessif
- Objectifs : ${userContext.goals?.join(', ') || 'Hypertrophie'}
- Niveau : ${diagnosticData?.experienceLevel || 'intermédiaire'}
- Jours/semaine : ${diagnosticData?.daysPerWeek || 4}
- Split préféré : ${diagnosticData?.preferredSplit || 'ppl'}
- Équipement : ${diagnosticData?.equipment || 'salle complète'}

RECORDS 1RM :
${dc1rm ? `- Développé couché : ${dc1rm} kg` : '- DC : non renseigné'}
${squat1rm ? `- Squat : ${squat1rm} kg` : ''}
${sdt1rm ? `- Soulevé de terre : ${sdt1rm} kg` : ''}

BODY MAP (points forts/faibles) :
${bodyMapAnalysis || 'Non disponible'}

DONNÉES MORPHOLOGIQUES :
${morphologyData ? JSON.stringify(morphologyData, null, 2) : 'Non disponible'}

DIAGNOSTIC COMPLET :
${JSON.stringify(diagnosticData, null, 2)}

══════════════════════════════════════════════════════════════

RÈGLES ABSOLUES (JAMAIS D'EXCEPTION) :
- MAXIMUM 6 exercices par séance (idéal : 5-6)
- MAXIMUM 20 sets par séance (idéal : 16-20)
- Durée : 50-65 minutes max
- PAS de doublons (1 seul type d'élévation latérale, 1 seul curl, etc.)
- Commencer par les exercices composés lourds, finir par l'isolation
- Suggérer des charges en kg basées sur les 1RM fournis (ex: 75-80% du 1RM pour hypertrophie 6-8 reps)

Structure par séance :
1. Exercice composé principal : 4 sets
2. Exercice composé secondaire : 3-4 sets
3. Exercices d'isolation : 3 sets chacun (2-3 max)

GÉNÈRE le JSON suivant (UNIQUEMENT le JSON, rien d'autre) :

{
  "fullAnalysis": "Analyse complète : profil, stratégie, justifications. 3-5 paragraphes en français.",
  "programName": "Nom du programme",
  "split": "Type de split",
  "sessions": [
    {
      "day": "Lundi",
      "name": "Push",
      "focus": "Pectoraux / Épaules / Triceps",
      "duration": 55,
      "exercises": [
        {
          "name": "Développé couché barre",
          "sets": 4,
          "reps": "6-8",
          "rir": 2,
          "rest": 180,
          "reasoning": "Charge suggérée : 80kg (77% de ton 1RM 104kg)",
          "cues": ["Omoplates rétractées", "Coudes 45°"],
          "alternatives": ["DC haltères"]
        }
      ],
      "t1dNotes": "Glycémie cible avant : 140 mg/dL."
    }
  ],
  "volumePerMuscle": {
    "Pectoraux": { "setsPerWeek": 12, "justification": "..." }
  },
  "progression": {
    "week4": "...",
    "week8": "..."
  },
  "t1dProtocol": {
    "preworkout": "...",
    "postworkout": "...",
    "alerts": ["..."]
  },
  "summary": {
    "changesDetected": ["..."],
    "programModifications": ["..."],
    "expectedOutcomes": ["..."]
  }
}

RAPPEL : MAXIMUM 6 exercices et 20 sets par séance. Pas plus.`;

    // Retry on 529 (overloaded) with exponential backoff.
    const callAnthropic = async () => {
      const maxRetries = 3;
      let lastErr: unknown = null;
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          return await anthropic.messages.create({
            model: "claude-sonnet-4-20250514",
            max_tokens: 4000,
            messages: [{ role: "user", content: prompt }],
          });
        } catch (err) {
          lastErr = err;
          const status = (err as { status?: number })?.status;
          const overloaded = status === 529 || status === 503;
          if (!overloaded || attempt === maxRetries) throw err;
          const wait = 1000 * Math.pow(2, attempt); // 1s, 2s, 4s
          console.warn(`[generate-muscu-program] API ${status}, retry ${attempt + 1}/${maxRetries} in ${wait}ms`);
          await new Promise((r) => setTimeout(r, wait));
        }
      }
      throw lastErr;
    };

    const message = await callAnthropic();
    if (!message) throw new Error("No response from Anthropic");

    const textBlock = message.content.find((b) => b.type === "text");
    const responseText = textBlock?.text || "{}";

    let parsed;
    try {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
    } catch {
      parsed = { fullAnalysis: responseText, summary: { changesDetected: [], programModifications: [], expectedOutcomes: [] } };
    }

    // Post-generation validation: enforce hard limits
    if (parsed.sessions && Array.isArray(parsed.sessions)) {
      for (const session of parsed.sessions) {
        if (!session.exercises) continue;
        // Hard limit: 6 exercises max
        if (session.exercises.length > 6) {
          session.exercises = session.exercises.slice(0, 6);
        }
        // Hard limit: 20 sets max
        let totalSets = session.exercises.reduce((sum: number, ex: { sets: number }) => sum + (ex.sets || 0), 0);
        while (totalSets > 20 && session.exercises.length > 0) {
          const lastEx = session.exercises[session.exercises.length - 1];
          if (lastEx.sets > 2) {
            lastEx.sets--;
            totalSets--;
          } else {
            break;
          }
        }
        // Fix duration if missing or NaN
        if (!session.duration || isNaN(session.duration)) {
          let dur = 5; // warmup
          for (const ex of session.exercises) {
            dur += ex.sets * 0.5 + ((ex.rest || 120) / 60) * (ex.sets - 1);
          }
          session.duration = Math.round(dur);
        }
      }
    }

    return Response.json(parsed);
  } catch (error) {
    console.error("Erreur generate-muscu-program:", error);
    const message = error instanceof Error ? error.message : "Erreur inconnue";
    const status = (error as { status?: number })?.status;
    const httpStatus = status === 529 || status === 503 ? 503 : 500;
    return Response.json({ error: message, code: status }, { status: httpStatus });
  }
}
