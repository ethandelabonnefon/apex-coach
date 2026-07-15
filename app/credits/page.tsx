import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export const metadata = {
  title: "Crédits — APEX Coach",
};

type Credit = {
  title: string;
  author: string;
  license: string;
  licenseUrl: string;
  sourceUrl: string;
  note?: string;
};

const CREDITS: Credit[] = [
  {
    title: "Human Body (modèle 3D)",
    author: "vistaalienprime",
    license: "CC BY 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
    sourceUrl:
      "https://sketchfab.com/3d-models/human-body-f022e4a3641943328b2fbfdf0f7c3e1e",
    note: "Figure de récupération colorée selon le Recovery Whoop sur le tableau de bord.",
  },
];

export default function CreditsPage() {
  return (
    <div className="max-w-[720px] mx-auto px-4 sm:px-6 lg:px-10 py-6 lg:py-10">
      <Link
        href="/profil"
        className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary transition-colors mb-6"
      >
        <ArrowLeft size={16} />
        Retour
      </Link>

      <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight mb-2">
        Crédits & licences
      </h1>
      <p className="text-sm text-text-secondary mb-8">
        Ressources tierces utilisées dans APEX Coach, avec leur attribution.
      </p>

      <ul className="space-y-4">
        {CREDITS.map((c) => (
          <li key={c.title} className="surface-1 p-5">
            <p className="text-base font-semibold tracking-tight">{c.title}</p>
            <p className="text-sm text-text-secondary mt-1">
              par{" "}
              <span className="text-text-primary font-medium">{c.author}</span> ·{" "}
              <a
                href={c.licenseUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent hover:underline"
              >
                {c.license}
              </a>
            </p>
            {c.note && (
              <p className="text-xs text-text-tertiary mt-2">{c.note}</p>
            )}
            <a
              href={c.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block text-xs text-accent hover:underline mt-3"
            >
              Source →
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
