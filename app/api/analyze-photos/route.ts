import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic();

export async function POST(request: Request) {
  try {
    const { photos, mensurations, ratios } = await request.json();

    if (!photos || photos.length === 0) {
      return Response.json({ error: "Aucune photo fournie" }, { status: 400 });
    }

    const imageContent: Anthropic.Messages.ContentBlockParam[] = [];

    const labels = ["Face (avant)", "Profil (côté)", "Dos (arrière)"];
    for (let i = 0; i < photos.length; i++) {
      if (!photos[i]) continue;

      const base64Data = photos[i].replace(/^data:image\/\w+;base64,/, "");
      const mediaType = photos[i].match(/^data:(image\/\w+);/)?.[1] || "image/jpeg";

      imageContent.push({
        type: "text",
        text: `Photo ${i + 1} — ${labels[i] || `Vue ${i + 1}`} :`,
      });
      imageContent.push({
        type: "image",
        source: {
          type: "base64",
          media_type: mediaType as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
          data: base64Data,
        },
      });
    }

    const contextLines: string[] = [];
    if (mensurations) {
      contextLines.push("Mensurations du sujet :");
      if (mensurations.shoulders) contextLines.push(`- Tour d'épaules : ${mensurations.shoulders} cm`);
      if (mensurations.waist) contextLines.push(`- Tour de taille : ${mensurations.waist} cm`);
      if (mensurations.chest) contextLines.push(`- Tour de poitrine : ${mensurations.chest} cm`);
      if (mensurations.hips) contextLines.push(`- Tour de hanches : ${mensurations.hips} cm`);
      if (mensurations.armFlexed) contextLines.push(`- Tour de bras contracté : ${mensurations.armFlexed} cm`);
      if (mensurations.thigh) contextLines.push(`- Tour de cuisse : ${mensurations.thigh} cm`);
      if (mensurations.calf) contextLines.push(`- Tour de mollet : ${mensurations.calf} cm`);
    }
    if (ratios && ratios.length > 0) {
      contextLines.push("\nRatios morphologiques calculés :");
      for (const r of ratios) {
        contextLines.push(`- ${r.label} : ${r.value} (idéal : ${r.ideal}) — ${r.status}`);
      }
    }

    imageContent.push({
      type: "text",
      text: `Analyse ces photos de bodybuilding/fitness. ${contextLines.length > 0 ? "\n\nDonnées numériques du sujet :\n" + contextLines.join("\n") : ""}

Identifie :
1. **Groupes musculaires en retard visuellement** — quels muscles semblent sous-développés par rapport à l'ensemble
2. **Asymétries gauche/droite** — différences visibles entre les deux côtés du corps
3. **Répartition masse grasse approximative** — où la graisse semble se concentrer, estimation du % de masse grasse
4. **Points forts visibles** — quels muscles sont les plus développés
5. **Recommandations de focus pour l'entraînement** — exercices et priorités spécifiques

Sois précis et constructif, c'est pour personnaliser un programme d'entraînement.
Réponds en français. Structure ta réponse avec les 5 sections numérotées ci-dessus.
Pour chaque section, sois spécifique et donne des détails actionnables.`,
    });

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2000,
      messages: [
        {
          role: "user",
          content: imageContent,
        },
      ],
    });

    const textBlock = message.content.find((b) => b.type === "text");
    const analysisText = textBlock ? textBlock.text : "Analyse non disponible.";

    return Response.json({ analysis: analysisText });
  } catch (error) {
    console.error("Erreur analyse photos:", error);
    const message = error instanceof Error ? error.message : "Erreur inconnue";
    return Response.json({ error: message }, { status: 500 });
  }
}
