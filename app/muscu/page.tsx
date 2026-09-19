"use client";

import Link from "next/link";
import { CalendarDays, ArrowRight } from "lucide-react";

/**
 * Page d'attente du module Séances (sept. 2026).
 *
 * L'ancien module musculation (programme généré, séances, progression,
 * body map, coach de modification) a été retiré : il est remplacé par le
 * module « calendrier & séances » importé du programme Notion, en cours de
 * construction. L'entrée de navigation est conservée pour ne pas casser
 * les habitudes ni les liens existants.
 */
export default function MuscuPlaceholderPage() {
  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-3xl mx-auto">
      <p className="label">Séances</p>
      <h1 className="mt-1 text-2xl font-semibold text-text-primary">
        Module en reconstruction
      </h1>

      <section className="surface-1 mt-6 p-5">
        <div className="flex items-start gap-4">
          <div className="h-10 w-10 rounded-lg bg-bg-tertiary flex items-center justify-center flex-shrink-0">
            <CalendarDays size={20} className="text-text-secondary" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-text-primary">
              Calendrier &amp; séances — bientôt ici
            </p>
            <p className="mt-1 text-sm text-text-secondary leading-relaxed">
              Programme Phase 0 importé de Notion, séances datées et cochables,
              feu Whoop appliqué à la séance du jour, modes Stable / Nomade /
              Voyage. Les séances de force déjà loggées restent lues par le
              suivi diabète.
            </p>
          </div>
        </div>
      </section>

      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
        <Link
          href="/running"
          className="surface-1 p-4 flex items-center justify-between hover:bg-bg-tertiary transition-colors"
        >
          <span className="text-sm font-medium text-text-primary">Running</span>
          <ArrowRight size={16} className="text-text-tertiary" />
        </Link>
        <Link
          href="/diabete"
          className="surface-1 p-4 flex items-center justify-between hover:bg-bg-tertiary transition-colors"
        >
          <span className="text-sm font-medium text-text-primary">Briefing pré-sport</span>
          <ArrowRight size={16} className="text-text-tertiary" />
        </Link>
      </div>
    </div>
  );
}
