"use client";

/**
 * useTheme — gestion du thème light / dark avec :
 *  - respect de la préférence système (prefers-color-scheme) par défaut ("system")
 *  - override manuel persistant (localStorage "apex-theme")
 *  - application via data-theme sur <html> (voir globals.css)
 *  - mise à jour du <meta name="theme-color"> pour la barre d'état PWA
 *
 * Le FOUC est évité par le script inline dans app/layout.tsx qui pose
 * data-theme avant le premier paint. Ce hook ne fait que synchroniser
 * l'état React et réagir aux changements (choix utilisateur + système).
 */

import { useCallback, useEffect, useState } from "react";

export type ThemeChoice = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

const STORAGE_KEY = "apex-theme";

/** Couleur de la barre d'état PWA par thème résolu (= --bg-primary). */
const THEME_COLOR: Record<ResolvedTheme, string> = {
  light: "#f5f5f7",
  dark: "#000000",
};

function readStoredChoice(): ThemeChoice {
  if (typeof window === "undefined") return "system";
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "light" || v === "dark" || v === "system") return v;
  } catch {
    /* localStorage indisponible (mode privé) — fallback système */
  }
  return "system";
}

function systemPrefersDark(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function resolve(choice: ThemeChoice): ResolvedTheme {
  if (choice === "system") return systemPrefersDark() ? "dark" : "light";
  return choice;
}

/** Applique le choix au DOM : attribut data-theme + meta theme-color. */
function applyChoice(choice: ThemeChoice) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;

  if (choice === "system") {
    root.removeAttribute("data-theme");
  } else {
    root.setAttribute("data-theme", choice);
  }

  const resolved = resolve(choice);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", THEME_COLOR[resolved]);
}

export function useTheme() {
  const [choice, setChoiceState] = useState<ThemeChoice>("system");
  const [resolved, setResolved] = useState<ResolvedTheme>("light");
  const [mounted, setMounted] = useState(false);

  // Hydratation : lit le choix stocké une fois monté côté client.
  useEffect(() => {
    const stored = readStoredChoice();
    setChoiceState(stored);
    setResolved(resolve(stored));
    setMounted(true);
  }, []);

  // Réagit aux changements de préférence système quand on est en mode "system".
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      if (readStoredChoice() === "system") {
        applyChoice("system");
        setResolved(systemPrefersDark() ? "dark" : "light");
      }
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const setChoice = useCallback((next: ThemeChoice) => {
    try {
      if (next === "system") localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore write errors */
    }
    applyChoice(next);
    setChoiceState(next);
    setResolved(resolve(next));
  }, []);

  return { choice, resolved, setChoice, mounted };
}
