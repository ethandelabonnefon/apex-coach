"use client";

import { Card, Badge, SectionTitle, Button, InfoBox } from "@/components/ui";
import type { DiagnosticEntry } from "@/lib/store";

interface DiagnosticSummaryProps {
  entry: DiagnosticEntry;
  onEditAll: () => void;
  onEditSection: (section: string) => void;
  onViewPhotoHistory?: () => void;
}

function SectionHeader({ title, icon, onEdit }: { title: string; icon: string; onEdit: () => void }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-2">
        <span className="text-base">{icon}</span>
        <h3 className="text-sm font-semibold text-white/90">{title}</h3>
      </div>
      <button
        onClick={onEdit}
        className="text-xs text-white/30 hover:text-[#00ff94] transition-colors px-2 py-1 rounded-lg hover:bg-white/[0.05]"
      >
        Modifier
      </button>
    </div>
  );
}

function MeasurementGrid({ items }: { items: { label: string; value: string; unit?: string }[] }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {items.map((item) => (
        <div key={item.label} className="p-2.5 rounded-lg bg-white/[0.03]">
          <p className="text-[10px] text-white/35 uppercase tracking-wider">{item.label}</p>
          <p className="text-base font-semibold mt-0.5">
            {item.value || "—"}
            {item.value && item.unit && (
              <span className="text-xs text-white/30 font-normal ml-1">{item.unit}</span>
            )}
          </p>
        </div>
      ))}
    </div>
  );
}

function MobilityBadge({ value }: { value: string }) {
  if (!value) return <Badge color="gray">Non testé</Badge>;
  if (value === "Facilement") return <Badge color="green">Normale</Badge>;
  if (value === "Difficilement") return <Badge color="orange">Limitée</Badge>;
  return <Badge color="red">Bloquée</Badge>;
}

export default function DiagnosticSummary({ entry, onEditAll, onEditSection, onViewPhotoHistory }: DiagnosticSummaryProps) {
  const m = entry.mensurations || {};
  const l = entry.longueurs || {};
  const h = entry.historique || {};
  const mob = entry.mobilite || {};
  const ratios = entry.analysis?.ratios || [];
  const recommendations = entry.analysis?.recommendations || [];
  const date = new Date(entry.date).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2">
            Mon Diagnostic Morphologique
          </h2>
          <p className="text-xs text-white/40 mt-1">Dernière mise à jour : {date}</p>
        </div>
        <Button variant="secondary" onClick={onEditAll}>
          Modifier tout
        </Button>
      </div>

      {/* Mensurations */}
      <Card>
        <SectionHeader title="Mensurations" icon="📏" onEdit={() => onEditSection("mensurations")} />
        <MeasurementGrid
          items={[
            { label: "Poitrine", value: m.chest, unit: "cm" },
            { label: "Épaules", value: m.shoulders, unit: "cm" },
            { label: "Taille", value: m.waist, unit: "cm" },
            { label: "Hanches", value: m.hips, unit: "cm" },
            { label: "Bras relâché", value: m.armRelaxed, unit: "cm" },
            { label: "Bras contracté", value: m.armFlexed, unit: "cm" },
            { label: "Cuisse", value: m.thigh, unit: "cm" },
            { label: "Mollet", value: m.calf, unit: "cm" },
          ]}
        />
        {(l.armSpan || l.torsoLength) && (
          <div className="mt-3 pt-3 border-t border-white/[0.06]">
            <p className="text-[10px] text-white/35 uppercase tracking-wider mb-2">Longueurs segmentaires</p>
            <div className="grid grid-cols-2 gap-3">
              {l.armSpan && (
                <div className="p-2.5 rounded-lg bg-white/[0.03]">
                  <p className="text-[10px] text-white/35">Envergure</p>
                  <p className="text-base font-semibold">{l.armSpan} <span className="text-xs text-white/30 font-normal">cm</span></p>
                </div>
              )}
              {l.torsoLength && (
                <div className="p-2.5 rounded-lg bg-white/[0.03]">
                  <p className="text-[10px] text-white/35">Tronc</p>
                  <p className="text-base font-semibold">{l.torsoLength} <span className="text-xs text-white/30 font-normal">cm</span></p>
                </div>
              )}
            </div>
          </div>
        )}
      </Card>

      {/* Ratios */}
      {ratios.length > 0 && (
        <Card>
          <SectionHeader title="Ratios calculés" icon="📐" onEdit={() => onEditSection("mensurations")} />
          <div className="space-y-2">
            {ratios.map((r, i) => (
              <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-white/[0.02]">
                <div>
                  <p className="text-sm text-white/80">{r.label}</p>
                  <p className="text-[10px] text-white/30">Idéal : {r.ideal}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold">{r.value}</span>
                  {r.status === "good" && <Badge color="green">OK</Badge>}
                  {r.status === "warning" && <Badge color="orange">A travailler</Badge>}
                  {r.status === "neutral" && <Badge color="gray">Info</Badge>}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Force */}
      <Card>
        <SectionHeader title="Tests de force" icon="🏋️" onEdit={() => onEditSection("historique")} />
        <MeasurementGrid
          items={[
            { label: "DC 1RM", value: h.benchPress1RM, unit: "kg" },
            { label: "Squat 1RM", value: h.squat1RM, unit: "kg" },
            { label: "Deadlift 1RM", value: h.deadlift1RM, unit: "kg" },
            { label: "OHP 1RM", value: h.ohp1RM, unit: "kg" },
            { label: "Tractions", value: h.pullups, unit: "reps" },
            { label: "Années d'entraînement", value: h.trainingHistory, unit: "ans" },
          ]}
        />
        {h.injuries && (
          <div className="mt-3 p-2.5 rounded-lg bg-[#ff9500]/5 border border-[#ff9500]/10">
            <p className="text-[10px] text-[#ff9500]/60 uppercase tracking-wider">Blessures / limitations</p>
            <p className="text-xs text-white/60 mt-1">{h.injuries}</p>
          </div>
        )}
      </Card>

      {/* Mobilité */}
      <Card>
        <SectionHeader title="Mobilité" icon="🤸" onEdit={() => onEditSection("mobilite")} />
        <div className="space-y-2">
          {[
            { label: "Épaules (mains derrière le dos)", value: mob.shoulderMobility },
            { label: "Hanches (squat complet)", value: mob.hipMobility },
            { label: "Chevilles (genou au mur)", value: mob.ankleMobility },
          ].map((item) => (
            <div key={item.label} className="flex items-center justify-between p-2 rounded-lg bg-white/[0.02]">
              <p className="text-sm text-white/70">{item.label}</p>
              <MobilityBadge value={item.value} />
            </div>
          ))}
        </div>
      </Card>

      {/* Points faibles */}
      {entry.weakPoints.length > 0 && (
        <Card>
          <SectionHeader title="Points faibles identifiés" icon="🎯" onEdit={() => onEditSection("weakPoints")} />
          <div className="flex flex-wrap gap-2">
            {entry.weakPoints.map((wp) => (
              <Badge key={wp} color="orange">{wp}</Badge>
            ))}
          </div>
        </Card>
      )}

      {/* Photos */}
      {entry.photos && entry.photos.length > 0 && (
        <Card>
          <SectionHeader title={`Photos (${date})`} icon="📸" onEdit={() => onEditSection("photos")} />
          <div className="flex gap-3">
            {entry.photos.map((photo, i) => (
              <img
                key={i}
                src={photo}
                alt={`Photo ${i + 1}`}
                className="w-24 h-32 object-cover rounded-lg border border-white/10"
              />
            ))}
          </div>
          {onViewPhotoHistory && (
            <button
              onClick={onViewPhotoHistory}
              className="mt-3 text-xs text-[#00d4ff] hover:text-[#00d4ff]/80 transition-colors"
            >
              Voir l'historique photos
            </button>
          )}
        </Card>
      )}

      {/* Analyse IA */}
      {entry.photoAnalysis && (
        <Card>
          <SectionHeader title="Analyse visuelle IA" icon="🤖" onEdit={() => onEditSection("photos")} />
          <div className="text-sm text-white/70 leading-relaxed whitespace-pre-line max-h-64 overflow-y-auto">
            {entry.photoAnalysis}
          </div>
        </Card>
      )}

      {/* Recommandations */}
      {recommendations.length > 0 && (
        <Card>
          <SectionTitle>Recommandations</SectionTitle>
          <div className="space-y-2">
            {recommendations.map((rec, i) => (
              <div key={i} className="flex gap-3 p-2 rounded-lg bg-white/[0.02]">
                <div className="w-5 h-5 rounded-full bg-[#00ff94]/15 flex items-center justify-center shrink-0 mt-0.5">
                  <span className="text-[#00ff94] text-[10px] font-bold">{i + 1}</span>
                </div>
                <p className="text-xs text-white/70 leading-relaxed">{rec}</p>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
