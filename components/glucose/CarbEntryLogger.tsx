"use client";

/**
 * CarbEntryLogger — saisie de glucides mangés SANS (ou avec peu d') insuline
 * (re-sucrage pendant une course, compote quand on est bas, collation non
 * bolussée). Ces entrées alimentent le plan nuit (predictGlucoseCurve via
 * carbEntries) pour qu'il tienne compte de TOUT ce que tu manges.
 *
 * Remplace le bloc "Glucides sans insuline" qui vivait dans l'ancienne carte
 * "Prédiction 8h" (supprimée). Composant autonome, toujours visible.
 *
 * Fix sept. 2026 : renommé "Ajouter des glucides" (le titre technique
 * "Glucides sans insuline" ne se reconnaissait pas comme le geste
 * d'urgence cherché) et remonté sous les 3 tuiles du haut sur /diabete,
 * avant la courbe 8h — Ethan doit pouvoir l'atteindre sans défiler quand
 * il vient de se re-sucrer. Il n'y a et il ne doit y avoir qu'une seule
 * section d'ajout de glucides dans l'app.
 */

import { useState } from "react";
import { Apple, Plus, Trash2 } from "lucide-react";
import { useStore } from "@/lib/store";

/** "HH:MM" de l'instant courant. */
function nowHHMM(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** "HH:MM" → ISO aujourd'hui ; si dans le futur (oubli de la veille) → recule d'un jour. */
function hhmmToISO(hhmm: string): string {
  if (!hhmm) return new Date().toISOString();
  const [h, m] = hhmm.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return new Date().toISOString();
  const d = new Date();
  d.setHours(h, m, 0, 0);
  if (d.getTime() > Date.now() + 60_000) d.setDate(d.getDate() - 1);
  return d.toISOString();
}

export default function CarbEntryLogger() {
  const carbEntries = useStore((s) => s.carbEntries);
  const addCarbEntry = useStore((s) => s.addCarbEntry);
  const removeCarbEntry = useStore((s) => s.removeCarbEntry);

  const [showForm, setShowForm] = useState(false);
  const [label, setLabel] = useState("");
  const [carbG, setCarbG] = useState("");
  const [prot, setProt] = useState("");
  const [fat, setFat] = useState("");
  const [time, setTime] = useState("");

  const open = () => {
    setTime(nowHHMM());
    setShowForm(true);
  };

  const submit = () => {
    const carbs = parseFloat(carbG.replace(",", "."));
    if (!Number.isFinite(carbs) || carbs <= 0) return;
    const p = parseFloat(prot.replace(",", "."));
    const f = parseFloat(fat.replace(",", "."));
    addCarbEntry({
      id: `carb-${Date.now()}`,
      label: label.trim() || undefined,
      carbsGrams: carbs,
      proteinGrams: Number.isFinite(p) && p > 0 ? p : undefined,
      fatGrams: Number.isFinite(f) && f > 0 ? f : undefined,
      insulinUnits: 0,
      eatenAt: hhmmToISO(time),
    });
    setLabel("");
    setCarbG("");
    setProt("");
    setFat("");
    setTime("");
    setShowForm(false);
  };

  // Entrées encore en digestion (< 4h) — pour l'affichage.
  const active = carbEntries.filter(
    (e) => Date.now() - new Date(e.eatenAt).getTime() < 4 * 3_600_000,
  );

  return (
    <section className="surface-1 rounded-3xl p-5 mb-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Apple className="w-4 h-4 text-diabete" />
          <h2 className="text-base font-semibold text-text-primary">Ajouter des glucides</h2>
        </div>
        {!showForm && (
          <button
            type="button"
            onClick={open}
            className="flex items-center gap-1 text-xs text-accent-ink bg-accent rounded-full px-2.5 py-1 tap-scale"
          >
            <Plus className="w-3.5 h-3.5" /> Ajouter
          </button>
        )}
      </div>

      <p className="text-[11px] text-text-tertiary mt-1 leading-snug">
        Glucides mangés sans injection : re-sucrage, compote, collation non bolussée.
        Pris en compte dans le plan nuit.
      </p>

      {active.length > 0 && (
        <div className="flex flex-col gap-1.5 mt-3">
          {active.map((e) => {
            const min = Math.round((Date.now() - new Date(e.eatenAt).getTime()) / 60000);
            return (
              <div
                key={e.id}
                className="flex items-center justify-between text-xs bg-bg-secondary rounded-lg px-2.5 py-1.5"
              >
                <span className="text-text-secondary">
                  <span className="text-text-primary font-medium">{e.label || "Glucides"}</span>
                  {" · "}
                  {e.carbsGrams}g gluc
                  {e.proteinGrams ? ` · ${e.proteinGrams}g prot` : ""}
                  {e.fatGrams ? ` · ${e.fatGrams}g lip` : ""}
                  {" · il y a "}
                  {min}min
                </span>
                <button
                  type="button"
                  onClick={() => removeCarbEntry(e.id)}
                  className="text-text-tertiary hover:text-error tap-scale"
                  aria-label="Supprimer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {showForm && (
        <div className="mt-3 flex flex-col gap-2 animate-slide-up">
          <div className="flex gap-2">
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Aliment (ex: compote) — optionnel"
              className="flex-1 rounded-lg bg-bg-secondary border border-border-default px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary"
            />
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="rounded-lg bg-bg-secondary border border-border-default px-2 py-2 text-sm num text-text-primary shrink-0"
              aria-label="Heure d'ingestion"
            />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <label className="flex flex-col gap-1">
              <span className="label">Glucides (g)</span>
              <input type="number" inputMode="decimal" value={carbG} onChange={(e) => setCarbG(e.target.value)} placeholder="39" className="w-full rounded-lg bg-bg-secondary border border-border-default px-2 py-2 text-sm num text-text-primary" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="label">Prot. (g)</span>
              <input type="number" inputMode="decimal" value={prot} onChange={(e) => setProt(e.target.value)} placeholder="0" className="w-full rounded-lg bg-bg-secondary border border-border-default px-2 py-2 text-sm num text-text-primary" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="label">Lip. (g)</span>
              <input type="number" inputMode="decimal" value={fat} onChange={(e) => setFat(e.target.value)} placeholder="0" className="w-full rounded-lg bg-bg-secondary border border-border-default px-2 py-2 text-sm num text-text-primary" />
            </label>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={submit} disabled={!carbG} className="flex-1 rounded-lg bg-accent text-accent-ink text-sm font-medium py-2 disabled:opacity-40 tap-scale">
              Ajouter
            </button>
            <button type="button" onClick={() => setShowForm(false)} className="rounded-lg bg-bg-secondary text-text-secondary text-sm px-4 py-2 tap-scale">
              Annuler
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
