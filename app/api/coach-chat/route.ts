import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic();

export async function POST(request: Request) {
  try {
    const { message, conversationHistory, currentProgram, userDiagnostic } =
      await request.json();

    const systemPrompt = `Tu es APEX Coach, un assistant de musculation expert et amical.
Tu parles à ${userDiagnostic.name || "l'utilisateur"}, ${userDiagnostic.age || "?"} ans, diabétique T1.

CONTEXTE UTILISATEUR :
- Taille : ${userDiagnostic.height || "?"}cm, Poids : ${userDiagnostic.weight || "?"}kg
- Objectifs : ${(userDiagnostic.goals || []).join(", ") || "Non définis"}
- Points faibles identifiés : ${(userDiagnostic.weakPoints || []).join(", ") || "Non analysés"}
- Diagnostic muscu : ${userDiagnostic.muscuDiagnostic ? JSON.stringify(userDiagnostic.muscuDiagnostic) : "Non disponible"}

OBJECTIFS NUTRITIONNELS :
${userDiagnostic.nutritionTargets ? `- Calories : ${userDiagnostic.nutritionTargets.calories} kcal/jour
- Protéines : ${userDiagnostic.nutritionTargets.protein}g
- Glucides : ${userDiagnostic.nutritionTargets.carbs}g
- Lipides : ${userDiagnostic.nutritionTargets.fat}g` : "Non calculés (diagnostic nutrition pas encore fait)"}

PROGRAMME ACTUEL :
${currentProgram ? JSON.stringify(currentProgram, null, 2) : "Aucun programme actif"}

TES PRINCIPES :
1. Tu fais des RECOMMANDATIONS basées sur la science et le diagnostic
2. Tu RESPECTES les préférences de l'utilisateur
3. Si l'utilisateur veut quelque chose de différent, tu t'adaptes
4. Tu expliques TOUJOURS ton raisonnement
5. Tu proposes des ALTERNATIVES quand pertinent
6. Tu parles TOUJOURS en français

RÈGLES DE RÉPONSE :
- Sois concis mais informatif (max 200 mots)
- Quand tu proposes une modification concrète au programme, inclus des "actions"
- Pour les actions de type "apply", le payload doit contenir les infos de modification :
  - Pour changer un exercice : { "type": "change_exercise", "sessionIndex": 0, "exerciseIndex": 1, "newExercise": { "name": "...", "sets": 4, "reps": "8-10", "rir": 2, "rest": 120 } }
  - Pour ajouter une séance : { "type": "add_session", "session": { "name": "...", "day": "...", "focus": "...", "duration": 45, "exercises": [...], "isOptional": true } }
  - Pour ajuster le volume : { "type": "adjust_volume", "sessionIndex": 0, "exerciseIndex": 0, "sets": 5 }

TYPES D'ACTIONS :
- { "type": "apply", "label": "Texte du bouton", "payload": { ... } }
- { "type": "modify", "label": "Modifier autrement" }
- { "type": "explain", "label": "En savoir plus" }
- { "type": "reject", "label": "Non merci" }

Réponds UNIQUEMENT au format JSON :
{
  "message": "Ta réponse texte ici",
  "actions": [...] // optionnel, uniquement si tu proposes une modification
}`;

    // Build conversation history for Claude
    const messages: { role: "user" | "assistant"; content: string }[] = (
      conversationHistory || []
    ).map((msg: { role: string; content: string }) => ({
      role: msg.role as "user" | "assistant",
      content: msg.content,
    }));

    messages.push({ role: "user", content: message });

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1200,
      system: systemPrompt,
      messages,
    });

    const textBlock = response.content.find((b) => b.type === "text");
    const responseText = textBlock?.text || "{}";

    // Parse JSON response
    try {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : { message: responseText };
      return Response.json({
        message: parsed.message || responseText,
        actions: parsed.actions || [],
      });
    } catch {
      return Response.json({ message: responseText, actions: [] });
    }
  } catch (error) {
    console.error("Coach chat error:", error);
    const message =
      error instanceof Error ? error.message : "Erreur inconnue";
    return Response.json({ error: message }, { status: 500 });
  }
}
