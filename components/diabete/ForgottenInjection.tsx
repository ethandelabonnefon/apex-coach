"use client";

/**
 * ForgottenInjection — saisie rétroactive d'une injection oubliée.
 *
 * Demande d'Ethan (sept. 2026) : « j'ai fait une unité pour corriger et j'ai
 * oublié de le rentrer dans l'application, je ne peux pas dire que j'ai fait
 * de l'insuline à sept heures. Ça fausse un peu l'algorithme. »
 *
 * Toutes les autres écritures d'injection posent `injectedAt: new Date()` :
 * il n'existait aucun moyen d'en dater une dans le passé. Une injection
 * manquante fait sous-estimer l'insuline active, donc la prédiction, le
 * plafonnement de la dose suivante et le plan de la nuit travaillent sur une
 * image fausse — dans le sens qui ajoute de l'insuline en trop.
 */

import { useState } from "react";
import { Clock, Plus, X } from "lucide-react";
import { useStore } from "@/lib/store";
import { inferMealTimeFromClock } from "@/lib/insulin-calculator";
import {
  buildForgottenInjectionDate,
  normalizeForgottenUnits,
  type ForgottenDay,
} from "@/lib/forgotten-injection";

function formatTimeValue(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export default function ForgottenInjection() {
  const addInsulinLog = useStore((s) => s.addInsulinLog);

  const [open, setOpen] = useState(false);
  const [units, setUnits] = useState("1");
  const [day, setDay] = useState<ForgottenDay>("today");
  const [time, setTime] = useState(() => formatTimeValue(new Date()));
  const [carbs, setCarbs] = useState("");
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setUnits("1");
    setDay("today");
    setTime(formatTimeValue(new Date()));
    setCarbs("");
    setError(null);
  }

  function handleSubmit() {
    setError(null);

    const parsedUnits = normalizeForgottenUnits(Number(units.replace(",", ".")));
    if (parsedUnits === null) {
      setError("Unités invalides — entre 0,5 et 30 U.");
      return;
    }

    const built = buildForgottenInjectionDate(day, time, Date.now());
    if (!built.ok) {
      setError(built.error);
      return;
    }

    const parsedCarbs = carbs.trim() === "" ? 0 : Number(carbs.replace(",", "."));
    if (!Number.isFinite(parsedCarbs) || parsedCarbs < 0 || parsedCarbs > 400) {
      setError("Glucides invalides.");
      return;
    }

    // Le créneau se déduit de l'heure saisie — un champ de moins à remplir.
    // Sans glucides, c'est une correction : le créneau n'a pas de sens.
    const mealType = parsedCarbs > 0 ? inferMealTimeFromClock(built.at) : "correction";

    const dayLabel = day === "today" ? "aujourd'hui" : "hier";
    const carbsLabel = parsedCarbs > 0 ? ` avec ${parsedCarbs} g de glucides` : "";
    if (
      typeof window !== "undefined" &&
      !window.confirm(
        `Enregistrer ${parsedUnits} U à ${time} ${dayLabel}${carbsLabel} ?\n\nElle comptera dans ton insuline active et dans le calcul de tes prochaines doses.`,
      )
    ) {
      return;
    }

    addInsulinLog({
      id: crypto.randomUUID(),
      units: parsedUnits,
      insulinType: "rapide",
      mealType,
      carbsGrams: parsedCarbs,
      // Inconnue rétroactivement. Sans danger : la validation des doses lit la
      // vraie glycémie dans l'archive, et l'historique par type de repas
      // écarte déjà les lignes dont la glycémie de départ est absente.
      glucoseBefore: 0,
      notes: "saisie rétroactive — injection oubliée",
      injectedAt: built.at,
    });

    reset();
    setOpen(false);
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setTime(formatTimeValue(new Date()));
          setOpen(true);
        }}
        className="mt-3 w-full min-h-11 flex items-center justify-center gap-2 text-xs font-semibold text-text-secondary bg-bg-tertiary hover:bg-bg-hover border border-border-subtle rounded-xl py-2.5 transition-colors tap-scale"
      >
        <Plus className="w-3.5 h-3.5 shrink-0" />
        J&apos;ai oublié une injection
      </button>
    );
  }

  return (
    <div className="mt-3 rounded-xl bg-bg-tertiary border border-border-subtle p-3 space-y-3 animate-slide-up">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-diabete" />
          <p className="text-xs font-semibold text-text-primary">Injection oubliée</p>
        </div>
        <button
          type="button"
          onClick={() => {
            reset();
            setOpen(false);
          }}
          aria-label="Fermer"
          className="p-1.5 -m-1.5 min-h-11 min-w-11 flex items-center justify-center text-text-tertiary hover:text-text-secondary tap-scale"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="label">Unités</span>
          <input
            type="number"
            inputMode="decimal"
            step="0.5"
            min="0.5"
            max="30"
            value={units}
            onChange={(e) => setUnits(e.target.value)}
            className="mt-1 w-full min-h-11 num text-base font-semibold bg-bg-secondary border border-border-subtle rounded-lg px-3 text-text-primary"
          />
        </label>
        <label className="block">
          <span className="label">Heure</span>
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className="mt-1 w-full min-h-11 num text-base font-semibold bg-bg-secondary border border-border-subtle rounded-lg px-3 text-text-primary"
          />
        </label>
      </div>

      <div>
        <span className="label">Quand</span>
        <div className="mt-1 grid grid-cols-2 gap-2">
          {(["today", "yesterday"] as const).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDay(d)}
              className={`min-h-11 text-xs font-medium rounded-lg border transition-colors tap-scale ${
                day === d
                  ? "bg-diabete/15 border-diabete/40 text-diabete"
                  : "bg-bg-secondary border-border-subtle text-text-secondary"
              }`}
            >
              {d === "today" ? "Aujourd'hui" : "Hier"}
            </button>
          ))}
        </div>
      </div>

      <label className="block">
        <span className="label">Glucides (optionnel)</span>
        <input
          type="number"
          inputMode="numeric"
          min="0"
          max="400"
          placeholder="0 pour une correction"
          value={carbs}
          onChange={(e) => setCarbs(e.target.value)}
          className="mt-1 w-full min-h-11 num text-base font-semibold bg-bg-secondary border border-border-subtle rounded-lg px-3 text-text-primary placeholder:text-text-tertiary placeholder:font-normal placeholder:text-xs"
        />
      </label>

      {error && <p className="text-xs text-error">{error}</p>}

      <button
        type="button"
        onClick={handleSubmit}
        className="w-full min-h-11 bg-diabete/15 hover:bg-diabete/25 border border-diabete/30 text-diabete text-sm font-semibold rounded-lg py-2.5 transition-colors tap-scale"
      >
        Enregistrer
      </button>
    </div>
  );
}
