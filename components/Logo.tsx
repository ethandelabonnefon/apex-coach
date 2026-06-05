/**
 * APEX Logo — "Pulse Cockpit" (juin 2026).
 *
 * Direction 2 du brand guide : un signal ECG dont le pic anguleux
 * forme un "A" via la barre horizontale du milieu. Raconte la double
 * identité performance + instrument médical en une seule forme.
 *
 * Usage :
 *   <Logo size={28} />                          → couleur accent (lime)
 *   <Logo size={20} color="var(--text-primary)" /> → custom color
 *   <Logo size={16} withWordmark />             → logo + "APEX"
 *
 * Le SVG est dessiné en stroke (currentColor) pour qu'il hérite de la
 * couleur depuis le parent via CSS si besoin.
 */

interface LogoProps {
  /** Taille en px (carré). Défaut 28. */
  size?: number;
  /** Override couleur (sinon hérite via currentColor). */
  color?: string;
  /** Afficher le wordmark "APEX" à droite. */
  withWordmark?: boolean;
  /** Sous-titre sous le wordmark (ex: "Precision Coach"). */
  tagline?: string;
  /** Classe additionnelle sur le conteneur. */
  className?: string;
}

export default function Logo({
  size = 28,
  color,
  withWordmark = false,
  tagline,
  className = "",
}: LogoProps) {
  const strokeColor = color ?? "var(--accent)";
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <LogoMark size={size} color={strokeColor} />
      {withWordmark && (
        <span className="flex flex-col leading-none">
          <span
            className="text-sm font-semibold tracking-tight"
            style={{ color: "var(--text-primary)" }}
          >
            APEX
          </span>
          {tagline && (
            <span className="label mt-0.5" style={{ fontSize: "9px" }}>
              {tagline}
            </span>
          )}
        </span>
      )}
    </span>
  );
}

/**
 * LogoMark — pure SVG, sans wordmark. Utile pour favicon, splash, etc.
 *
 * Construction :
 *  - Une baseline horizontale (le "signal au repos")
 *  - Qui monte en pic anguleux vers le sommet (le "pic atteint")
 *  - Une barre horizontale à mi-pic forme la traverse du "A"
 *  - Un dot au sommet (le moment précis du pic — signature instrument)
 *
 * Stroke 2px, linecap round → feel propre et technique.
 */
export function LogoMark({
  size = 28,
  color = "var(--accent)",
}: {
  size?: number;
  color?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 28 28"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="APEX"
      role="img"
    >
      {/* Baseline → pic → baseline (mountain forme un A) */}
      <path d="M2 17 L9 17 L14 5 L19 17 L26 17" />
      {/* Traverse du A à mi-pic */}
      <path d="M11 12 L17 12" />
      {/* Dot au sommet — signature "pic instantané" */}
      <circle cx="14" cy="5" r="1.4" fill={color} stroke="none" />
    </svg>
  );
}
