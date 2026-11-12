"use client";

/**
 * Apparence & matériel — ce qui restait d'utile de l'ancienne page Profil
 * (retirée en nov. 2026 avec les modules sport et nutrition) : le thème, le
 * nom de l'insuline rapide et celui du capteur.
 *
 * Les deux noms sont de simples libellés : ils s'affichent en tête de la
 * page Suivi et sont recopiés sur chaque injection enregistrée. Aucun
 * calcul n'en dépend. Enregistrés à la sortie du champ, sans bouton : pas
 * d'état « non sauvegardé » à gérer pour deux mots.
 */

import { useState } from "react";
import { useStore } from "@/lib/store";
import { ThemeToggle } from "@/components/ThemeToggle";

function LabelField({
  label,
  value,
  onCommit,
}: {
  label: string;
  value: string;
  onCommit: (next: string) => void;
}) {
  const [draft, setDraft] = useState(value);

  return (
    <label className="block">
      <span className="eyebrow block mb-1.5">{label}</span>
      <input
        type="text"
        value={draft}
        maxLength={40}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          const next = draft.trim();
          if (next && next !== value) onCommit(next);
          else setDraft(value);
        }}
        className="w-full h-11 px-3 rounded-lg border border-border-default bg-bg-secondary text-sm text-text-primary focus:outline-none focus:border-accent"
      />
    </label>
  );
}

export default function DeviceSettings() {
  const profile = useStore((s) => s.profile);
  const updateProfile = useStore((s) => s.updateProfile);

  return (
    <section className="panel mb-4">
      <div className="panel-hd">
        <h2>Apparence & matériel</h2>
      </div>

      <div className="flex items-center justify-between gap-3 mb-4">
        <div>
          <p className="text-sm font-medium text-text-primary">Thème</p>
          <p className="text-xs text-text-tertiary mt-0.5">Clair, sombre, ou celui du téléphone.</p>
        </div>
        <ThemeToggle />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* `key` = valeur du store : si elle change sous nos pieds
            (restauration d'une sauvegarde), le champ repart de la nouvelle
            valeur au lieu de garder un brouillon périmé. */}
        <LabelField
          key={`rapid-${profile.insulinRapid}`}
          label="Insuline rapide"
          value={profile.insulinRapid}
          onCommit={(insulinRapid) => updateProfile({ insulinRapid })}
        />
        <LabelField
          key={`cgm-${profile.cgmType}`}
          label="Capteur"
          value={profile.cgmType}
          onCommit={(cgmType) => updateProfile({ cgmType })}
        />
      </div>
    </section>
  );
}
