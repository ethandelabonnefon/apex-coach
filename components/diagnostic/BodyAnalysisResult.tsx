"use client";

import { Card, SectionTitle, Badge, InfoBox } from "@/components/ui";

interface BodyAnalysisResultProps {
  analysis: string;
  photos: (string | null)[];
}

export default function BodyAnalysisResult({ analysis, photos }: BodyAnalysisResultProps) {
  const availablePhotos = photos.filter(Boolean) as string[];

  if (!analysis) return null;

  // Parse sections from the analysis text
  const sections = analysis.split(/\d+\.\s+\*\*/);
  const intro = sections[0]?.trim();
  const parsedSections = sections.slice(1).map((s) => {
    const titleEnd = s.indexOf("**");
    const title = titleEnd > -1 ? s.slice(0, titleEnd).trim() : "";
    const content = titleEnd > -1 ? s.slice(titleEnd + 2).trim() : s.trim();
    return { title, content };
  });

  const sectionIcons: Record<string, { icon: string; color: string }> = {
    "retard": { icon: "📉", color: "orange" },
    "asymétrie": { icon: "⚖️", color: "blue" },
    "masse grasse": { icon: "📊", color: "purple" },
    "points forts": { icon: "💪", color: "green" },
    "recommandation": { icon: "🎯", color: "green" },
  };

  function getSectionStyle(title: string): { icon: string; color: string } {
    const lower = title.toLowerCase();
    for (const [key, val] of Object.entries(sectionIcons)) {
      if (lower.includes(key)) return val;
    }
    return { icon: "📋", color: "gray" };
  }

  return (
    <div className="space-y-6">
      <SectionTitle>Analyse visuelle IA</SectionTitle>

      {/* Photo thumbnails */}
      {availablePhotos.length > 0 && (
        <div className="flex gap-3 overflow-x-auto pb-2">
          {availablePhotos.map((photo, i) => (
            <img
              key={i}
              src={photo}
              alt={`Photo ${i + 1}`}
              className="w-20 h-28 object-cover rounded-lg border border-white/10 shrink-0"
            />
          ))}
        </div>
      )}

      {intro && (
        <Card>
          <p className="text-sm text-white/70 leading-relaxed">{intro}</p>
        </Card>
      )}

      {parsedSections.length > 0 ? (
        parsedSections.map((section, i) => {
          const style = getSectionStyle(section.title);
          return (
            <Card key={i}>
              <div className="flex items-start gap-3">
                <span className="text-xl shrink-0">{style.icon}</span>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <p className="text-sm font-semibold text-white">{section.title}</p>
                    <Badge color={style.color as "green" | "blue" | "purple" | "orange"}>
                      {i + 1}/5
                    </Badge>
                  </div>
                  <div className="text-sm text-white/70 leading-relaxed whitespace-pre-line">
                    {section.content}
                  </div>
                </div>
              </div>
            </Card>
          );
        })
      ) : (
        <Card>
          <div className="text-sm text-white/70 leading-relaxed whitespace-pre-line">{analysis}</div>
        </Card>
      )}

      <InfoBox variant="info">
        <p className="text-xs">
          Cette analyse visuelle est générée par IA et doit être considérée comme indicative.
          Pour un diagnostic médical ou un suivi précis de composition corporelle, consulte un professionnel.
        </p>
      </InfoBox>
    </div>
  );
}
