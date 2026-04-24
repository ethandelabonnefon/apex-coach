@AGENTS.md

# APEX Coach - Reference Documentation

## Stack Technique

- **Framework**: Next.js 16.2.1 (App Router, Turbopack)
- **Runtime**: React 19.2.4, TypeScript (strict mode)
- **State**: Zustand 5.0.12 avec persistence localStorage (`apex-coach-storage`)
- **Styling**: Tailwind CSS 4 + PostCSS, design system premium (tokens via `@theme`)
- **Design System**: clsx 2.1.1, tailwind-merge 3.5, class-variance-authority 0.7.1
- **Fonts**: Inter (primary, via `next/font`), Geist/Geist Mono (legacy), JetBrains Mono (stats)
- **AI**: Anthropic Claude Sonnet 4 (`@anthropic-ai/sdk` v0.80.0) - toutes les routes API
- **Charts**: Recharts 3.8.1
- **Dates**: date-fns 4.1.0
- **PWA**: Service worker + manifest.json + install banner
- **Scripts**: `npm run dev` (Turbopack), `npm run build`, `npm run lint`

## Structure des Dossiers

```
apex-coach/
├── app/                          # Pages & API routes (App Router)
│   ├── page.tsx                  # Dashboard principal
│   ├── layout.tsx                # Layout racine (Geist font, nav, coach)
│   ├── globals.css               # Styles globaux + thème dark
│   ├── api/
│   │   ├── analyze-photos/       # Vision Claude : analyse morpho photos
│   │   ├── coach-chat/           # Chat IA interactif (actions + modifications)
│   │   ├── generate-muscu-program/ # Génération programme muscu (retry 529/503)
│   │   ├── generate-running-plan/  # Plan running semi-marathon
│   │   └── update-programs/      # Comparaison diagnostics + MAJ programme
│   ├── diabete/                  # Suivi glycémie, calculateur bolus, IOB
│   │   ├── page.tsx              # Page principale (glucose, bolus, logs)
│   │   ├── parametres/           # Config ratios insuline, ISF, cibles
│   │   └── patterns/             # 4 patterns glycémiques documentés
│   ├── muscu/
│   │   ├── page.tsx              # Programme actif, volume/muscle, body map
│   │   ├── progression/          # Analyse volume, plateaux, surcharge
│   │   └── seance/[id]/          # Séance individuelle (exercices, tracking)
│   ├── running/
│   │   ├── page.tsx              # Plan 14 semaines semi-marathon
│   │   └── zones/                # Zones Z1-Z5 (allures, FC, sensations)
│   ├── nutrition/                # Diagnostic nutrition, TDEE, macro tracking
│   ├── profil/
│   │   ├── page.tsx              # Editeur profil utilisateur
│   │   └── diagnostic/           # Page diagnostic unifiée (3 onglets)
│   └── diagnostic/               # Ancien formulaire diagnostic (legacy)
│
├── components/
│   ├── ui.tsx                    # LEGACY: anciens composants UI (Card, Button, Badge, Modal) — utilisés par pages existantes
│   ├── ui/                       # DESIGN SYSTEM (Phase 1) : Button, Card, Input, NumberInput, StatCard, Badge, Progress, Skeleton
│   ├── layout/                   # Layout primitives : PageLayout, Container, Section
│   ├── navigation.tsx            # Sidebar desktop (64px) + bottom nav mobile
│   ├── coach/
│   │   ├── CoachButton.tsx       # FAB flottant draggable (z-40, safe zones)
│   │   ├── CoachPanel.tsx        # Panel chat IA
│   │   └── CoachProvider.tsx     # Context provider état coach
│   ├── body-map/                 # Carte musculaire visuelle (15 muscles)
│   ├── diagnostic/
│   │   ├── MuscuDiagnosticForm.tsx    # 5 étapes muscu + T1D
│   │   ├── RunningDiagnosticForm.tsx  # 5 étapes running + T1D
│   │   ├── PhotoCapture.tsx           # Capture photos (sans capture= pour iOS)
│   │   ├── DiagnosticSummary.tsx      # Résumé avant soumission
│   │   └── SectionEditor.tsx          # Sections éditables post-diagnostic
│   ├── musculation/              # PersonalizationBadge, ModifyDaysModal, ReasoningModal
│   ├── nutrition/                # NutritionDiagnosticForm, NutritionResults
│   └── programs/                 # ProgramUpdateModal
│
├── lib/
│   ├── utils.ts                  # cn() — merge Tailwind classes (clsx + tailwind-merge)
│   ├── store.ts                  # Zustand store (profil, diabète, programmes, diagnostics)
│   ├── constants.ts              # Defaults (USER_PROFILE, DIABETES_CONFIG, MUSCU_PROGRAM)
│   ├── program-generation-flow.ts # Orchestrateur : AI-first + fallback local
│   ├── insulin-calculator.ts     # Bolus, correction, IOB, impact glycémique
│   ├── running-science.ts        # VMA, zones, prédictions courses, conseils glucose
│   ├── muscu-science.ts          # 1RM (Epley), volume, plateaux, phases
│   ├── nutrition-calculator.ts   # BMR + NEAT + TEF + exercice = TDEE + macros
│   ├── meal-distribution.ts      # Répartition macros par repas
│   ├── coach-actions.ts          # Actions coach (change_exercise, add_session, adjust_volume)
│   ├── diagnostic-comparison.ts  # Diff ancien/nouveau diagnostic
│   ├── body-analysis/            # Analyse mensurations, force, combinaison
│   ├── calculators/              # Fonctions calcul nutrition + running
│   ├── data/
│   │   ├── exercises.ts          # Base de données 50+ exercices (61KB)
│   │   ├── exercises-database.ts # Types (MuscleGroup, Equipment, Exercise)
│   │   └── split-templates.ts    # Templates PPL, Upper/Lower, Full Body, Bro
│   └── generators/
│       ├── program-generator-local.ts  # Générateur déterministe (fallback)
│       ├── exercise-selector.ts        # Sélection par morpho/mobilité/équipement
│       └── volume-calculator.ts        # Volume cible par muscle selon statut
│
├── types/index.ts                # Types TS (UserProfile, ActiveProgram, Exercise, etc.)
├── hooks/usePWA.ts               # Hook installation PWA
└── public/
    ├── manifest.json             # Config PWA
    ├── sw.js                     # Service worker
    └── icons/                    # Icônes app
```

## Design System (Phase 2 — "Precision Instrument", avril 2026)

Refonte créative après analyse de Linear, Raycast, Arc, Strava, MacroFactor. Identité **Precise. Athletic. Clinical.** — instrument de performance médicale, pas un tracker amateur.

### Direction créative
- **Signature typographique** : JetBrains Mono tabular-nums pour TOUS les chiffres. Les métriques sont les héros.
- **Label cockpit** : uppercase 10px tracking-wide (`.label` utility) — feel instrument de précision
- **Hiérarchie par surfaces, pas par borders** : `surface-1 / surface-2 / surface-3` au lieu d'empiler des bordures
- **Accent primaire Electric Lime** `#D4FF4F` — énergie contenue (remplace l'ancien `#10B981`)
- **Accent secondaire Soft Lavender** `#B4A7FF` — recovery, T1D, données cliniques

### Tokens (globals.css `@theme`)
- **Backgrounds** : `bg-bg-primary` (#0A0A0B), `bg-bg-secondary` (#111113), `bg-bg-tertiary` (#18181B), `bg-bg-elevated` (#1F1F23), `bg-bg-hover` (#26262B)
- **Texte** : `text-text-primary` (#FAFAFA), `text-text-secondary` (#A1A1AA), `text-text-tertiary` (#71717A), `text-text-disabled` (#3F3F46), `text-ink` (inverse pour texte sur accent)
- **Accent primaire** : `bg-accent` (#D4FF4F), `bg-accent-hover` (#C7F026), `bg-accent-pressed`, `bg-accent-subtle`, `text-accent-ink` (noir sur lime)
- **Accent secondaire** : `bg-accent-2` (#B4A7FF), `bg-accent-2-hover`, `bg-accent-2-subtle`
- **Bordures** : `border-border-subtle` (6% white), `border-border-default` (10%), `border-border-strong` (16%) — rgba au lieu de hex
- **États** : `success` (#7AE582), `warning` (#FFAE5C), `error` (#FF6B6B), `info` (#7FC7FF) — palette chaude cohérente
- **Catégories** : `muscu` (lime), `running` (sky #7FC7FF), `nutrition` (amber #FFAE5C), `diabete` (lavender #B4A7FF)
- **Glucose** : `glucose-low` (#FF6B6B), `glucose-normal` (#7AE582), `glucose-high` (#FFAE5C), `glucose-critical` (#FF3B3B)
- **Fonts** : `font-sans` → Inter (letter-spacing -0.01em), `font-mono` → JetBrains Mono

### Composants UI (`components/ui/`)
- **Button / Card / Input / NumberInput / StatCard / Badge / Progress / Skeleton** : Phase 1, inchangés mais récupèrent les nouveaux tokens via CSS variables
- **HeroMetric** : métrique géante mono, avec label cockpit, delta directionnel (↑/↓/→), subtitle optionnel, tones (default/accent/accent-2/warning/error), sizes (md/lg/xl)
- **MetricCard** : card 1-métrique avec label uppercase, valeur mono, unit discrète, delta, hint, sparkline intégrée
- **Ring** : arc de progression SVG 0–100%, stroke animé cubic-bezier, children custom au centre (utilisé pour calories/adherence)
- **Sparkline** : courbe SVG inline avec gradient area + dot terminal, dimensions custom, color via CSS var
- **Pulse** : dot pulsant "vital signal" (tones accent/success/warning/error/info) — signature UI

### Layout & Navigation
- **Sidebar desktop** (60 col, 240px) : logo lime carré "A", label "Precision Coach", nav avec active indicator latéral (barre lime verticale) + fond `accent-subtle`, bloc user en bas
- **Bottom nav mobile** : 5 items avec active "dot indicator" coloré par catégorie au-dessus de l'icône + glow, tap-scale feedback
- **Header mobile** : glass (saturate 180% + blur 20px), logo compact + bouton profil rond
- **Icons** : `lucide-react` (Gauge, Dumbbell, Footprints, Apple, Droplet, UserRound, ArrowUpRight, ChevronRight, Target) — remplace les emojis

### Utilitaires signature
- `.num` / `.num-hero` : mono tabular-nums avec letter-spacing -0.02em / -0.04em
- `.label` : uppercase 10px tracking-wide text-tertiary (cockpit feel)
- `.surface-1 / .surface-2 / .surface-3` : hiérarchie par profondeur (bg-secondary → tertiary → elevated)
- `.glass` : backdrop saturate 180% + blur 20px (headers/toolbars)
- `.glow-accent / .glow-accent-2 / .glow-ring` : ombres lime/lavender
- `.dot-pulse` : animation ping pour status indicator
- `.hover-lift` : translateY(-2px) transition 200ms
- `.tap-scale` : scale 0.97 active (feedback iOS)
- `.stagger > *` : animation slide-up décalée children 1-8 (entry sequence)
- `.animate-in / .animate-slide-up / .animate-pulse-subtle / .skeleton` (shimmer)
- `::selection` + `:focus-visible` globalement stylés avec l'accent lime

### Compatibilité & migration
- `tailwind.config.ts` chargé via `@config` directive dans globals.css (Tailwind 4)
- Legacy tokens (`--accent-green`, `card`, `neon-*`, `progress-bar`, etc.) **toujours conservés** pour ne pas casser pages non migrées
- Ancien `components/ui.tsx` coexiste avec `components/ui/` (résolution TS : `.tsx` gagne sur `@/components/ui` — importer les nouveaux composants via `@/components/ui/HeroMetric` etc.)
- viewport themeColor mis à jour : `#0A0A0B` (était `#00ff94`)
- layout.tsx utilise `lg:ml-60` (sidebar 240px) et `pb-24` pour bottom nav mobile

## Fonctionnalites Implementees

### Gestion Diabete T1 (module central)
- Calculateur de bolus avec ajustements pre-workout (running: -50%, muscu: aucune reduction)
- Calcul IOB (Insulin On Board) avec modele de decroissance lineaire
- Estimation impact glycemique post-repas (courbe 4h, granularite 15min)
- 4 patterns glycemiques documentes : remontee 16h, phenomene de l'aube, post-musculation, running Z2
- Ratios insuline configurables par creneaux horaires (matin 1:5, midi 1:7, soir 1:9)
- ISF (35 mg/dL/U), cible glucose (110), plage (70-180), duree active (195 min)
- Logging glucose + tendance, logging injections

### Systeme de Diagnostic (3 modules)
- **Morphologique** (6 etapes dans /profil/diagnostic) : mensurations, longueurs segmentaires, mobilite, historique force, points faibles, photos
- **Musculation** (5 etapes) : objectifs, disponibilite, preferences, experience, contraintes T1D
- **Running** (5 etapes) : profil, physiologie (VO2max/FC), test terrain (6min/Cooper), objectifs, contraintes T1D
- **Nutrition** (4 etapes) : physique, activite, objectif, preferences/T1D
- Historique diagnostics (max 50 entrees) avec comparaison diff

### Generation de Programmes
- **Strategie hybride** : API Claude d'abord, fallback generateur local si echec
- **Muscu** : split personnalise (PPL/Upper-Lower/Full Body/Bro), volume par muscle, exercices adaptes a la morphologie/mobilite/equipement, protocole T1D
- **Hard limits enforces** : MAX 6 exercices et MAX 20 sets par seance (valide cote API, cote client, et generateur local)
- **Suggestions de charges** : basees sur les 1RM du diagnostic (ex: 77% du 1RM pour hypertrophie 6-8 reps)
- **Split templates simplifies** : groupes musculaires parents uniquement (evite explosion exercices)
- **Volume calculator** : cap par muscle selon nombre de muscles dans la seance (5+ muscles → max 4 sets, 4 → max 5, 3 → max 6)
- **Affichage volume** : utilise `volumeDistribution` du programme genere quand disponible, fallback sur calcul par keyword matching
- **Running** : plan 14 semaines semi-marathon, 5 zones (VMA), periodisation (Base/Build/Peak/Taper), protocole T1D par type de seance
- Retry automatique sur erreurs 529/503 (backoff exponentiel)

### Coach IA
- Chat conversationnel Claude Sonnet 4 (contexte : profil, programme, diagnostic)
- Actions applicables : changer exercice, ajouter seance, ajuster volume
- Modifications appliquees cote client via `applyCoachModification()`
- Versioning du programme a chaque modification

### Module Muscu
- Body map visuel (15 muscles, 4 statuts : strong/normal/improve/weak)
- Analyse mensurations vs ideaux (ratios hauteur)
- Base de 50+ exercices avec cues, alternatives, morphologie ideale
- Tracking seances (reps, poids, difficulte, pump, glycemie avant/apres)
- Phases : Accumulation (3s) > Intensification (2s) > Deload (1s)
- Volume landmarks Israetel (MEV/MRV/MAV par muscle)

### Module Running
- Calcul VMA depuis VO2max (VMA = VO2max / 3.5) ou tests terrain
- 5 zones d'entrainement avec allures, FC, sensations
- Predictions courses (5K, 10K, semi, marathon) par % VMA
- Conseils glucose pre-course selon niveau glycemique

### Module Nutrition
- Calcul TDEE (BMR Mifflin-St Jeor ou Katch-McArdle + NEAT + exercice + TEF)
- Macros adaptes a l'objectif (bulk/cut/maintain/recomp)
- Ajustement low-carb pour T1D
- Logger repas avec presets rapides + suivi quotidien vs cibles

### PWA & UI
- Service worker pour acces offline
- Banniere d'installation
- Navigation responsive (sidebar desktop 64px, bottom nav mobile)
- Theme dark glassmorphism (bg #0a0a0f, accent #00ff94)
- CoachButton draggable avec safe zones (evite chevauchement contenu)

## Fonctionnalites En Cours / A Terminer

- ~~Execution plan running~~ : **FAIT** — tracking par seance (distance, duree, pace, glycemie, ressenti), progression hebdomadaire, indicateurs dans la vue 14 semaines
- ~~Tracking seance muscu~~ : **FAIT** — pre-remplissage poids depuis derniere seance, affichage historique par exercice, suggestion de progression
- ~~Distribution repas dynamique~~ : **FAIT** — plan de repas visible dans le tracker avec slots horaires, adherence par creneau, macros cibles par repas, suggestions alimentaires
- ~~Analyse photos~~ : **FAIT** — flux E2E operationnel (capture → API Claude Vision → affichage BodyAnalysisResult → persistence dans historique diagnostics avec photos et analyse consultables)
- ~~Mise a jour programme post-diagnostic~~ : **FAIT** — modal avec bouton "Appliquer au programme" qui met a jour exercices et volumes dans le programme actif, versioning automatique

## Audit UX (avril 2026)
- **Programme par defaut** : CAS 1 (pas de diagnostic) affiche desormais les cartes sessions avec exercices, sets, et liens "Commencer"
- **Seance dynamique** : page seance supporte les programmes AI-generes (activeProgram) en plus du programme statique, plus de "Seance introuvable"
- **Types session-client** : ExerciseCard accepte les types flexibles (cues/alternatives optionnels, notes unknown safe)
- **Pages verifiees** : Dashboard, Muscu, Running, Nutrition, Diabete (bolus + parametres), Profil, Diagnostic — aucun crash, pas de NaN/undefined affiche

## Conventions de Code

- **Langue** : interface 100% francais, code en anglais, commentaires mixtes
- **Composants** : `"use client"` systematique, un fichier par composant
- **State** : Zustand avec `useStore()` + selectors, `useStore.setState()` pour resets
- **Styling** : classes Tailwind inline, pas de CSS modules, theme via globals.css
- **API routes** : `app/api/*/route.ts`, POST uniquement, JSON in/out
- **IA** : Claude Sonnet 4 (`claude-sonnet-4-20250514`), max tokens varies (1200-6000)
- **Types** : centralises dans `types/index.ts`, interfaces explicites
- **Formulaires** : multi-etapes avec state local (`useState`) + sauvegarde store a la soumission
- **Boutons** : `touch-action: manipulation` + `cursor-pointer select-none` pour iOS
- **Persistence** : localStorage via Zustand persist, limites max (500 lectures, 50 diagnostics)

## Points d'Attention Critiques

### Logique Diabete T1
- **Bolus pre-workout** : running reduit de 30-50%, muscu NE reduit PAS (muscu augmente la glycemie +30-70 mg/dL)
- **Cibles glucose** : 140 mg/dL pre-muscu, 150 mg/dL pre-running
- **IOB** : decroissance lineaire sur `insulinActiveDuration` (195 min par defaut)
- **Patterns** : phenomene de l'aube (5-8h, +30-60), post-muscu (hyperglycemie +30-70, pic 30-60min), running Z2 (hypoglycemie -40-80), remontee 16h (+40-80)
- **Ratio insuline Ethan** (format naturel) : Matin 1,5U/10g (plus fort — dawn phenomenon), Midi 1U/10g, Goûter 1,2U/10g, Soir 1U/10g. En interne stocké en g par U (= 10 / Uper10g). ISF = 100 mg/dL par U (0,5U corrige 50 mg/dL au-dessus de la cible)
- Le systeme est entierement T1D-first, pas de mode non-diabetique

### Calculs Running
- VMA = VO2max / 3.5
- FC max = 208 - 0.7 * age (Tanaka)
- Zones basees sur % VMA (Z1: 60-70%, Z2: 70-80%, Z3: 80-88%, Z4: 88-95%, Z5: 95-100%)
- Predictions courses : 5K a 95% VMA, 10K a 90%, semi a 85%, marathon a 80%
- Test 6min : VMA = distance(m) / 100 / 1.16
- Test Cooper : VMA = (distance - 504) / 45

### Alertes Glycemie
- < 70 mg/dL : HYPO - ne pas courir, 15-20g glucides rapides
- 70-120 : trop bas pour courir, prendre glucides
- 120-180 : zone ideale
- 180-250 : OK pour Z2, risque pour intervalles
- > 250 : verifier cetones, ne pas courir si > 1.0 mmol/L

### Equipment / Diagnostic
- `equipment` peut etre string OU array (normaliser avec `Array.isArray` avant `.filter()`)
- Morphologie accepte francais (court/moyen/long) et anglais (short/medium/long)
- Experience accepte francais (debutant/intermediaire/avance) et anglais

### CoachButton
- Storage key `apex-coach-btn-pos-v2` (v1 invalide pour eviter positions stale)
- Safe zones Y : top <= 80px ou bottom >= innerHeight - 156px
- Snap X : bord gauche ou droit apres drag

### iOS Safari
- Pas de `capture=` sur `<input type="file">` (sinon force camera au lieu de galerie)
- Touch targets minimum 44px
- `touch-action: manipulation` sur boutons pour eviter delays
- `viewport-fit=cover` pour safe areas

## Etat Actuel du Projet

Le projet est une PWA fonctionnelle deployee sur Vercel. **Toutes les fonctionnalites planifiees sont implementees.** Les modules principaux (diagnostic, generation programme, coach IA, suivi diabete, running tracking, nutrition tracking) sont operationnels. Le build TypeScript passe sans erreur.

### Fonctionnalites completees recemment (avril 2026) :
- Suivi hebdomadaire running avec tracking par seance (distance, duree, pace, glycemie, ressenti)
- Persistence set-by-set muscu avec pre-remplissage poids depuis derniere seance
- Plan de repas dynamique visible dans le tracker nutrition avec adherence par creneau
- Flux E2E analyse photos (capture → Claude Vision → affichage → historique)
- Application des changements programme post-diagnostic au programme actif
- **Design System Phase 1** : tokens `@theme` Tailwind 4, 8 composants UI + 3 layout, font Inter, utilitaires cn/glass/glow, legacy preserve (aucune regression sur pages existantes)
- **Design System Phase 2 — Refonte "Precision Instrument"** : nouvelle palette Electric Lime + Soft Lavender, composants signature (HeroMetric, MetricCard, Ring, Sparkline, Pulse), typography mono tabular-nums pour toutes les métriques, navigation refaite avec icons lucide-react et active indicators, utilitaires `.surface-1/2/3`, `.label`, `.num`, `.stagger`, glass headers saturate 180%
- **Page Muscu migrée Phase 2** : 3 états (no diagnostic / diagnostic sans programme / programme actif) refondus avec hero label cockpit, MetricCard pour phase/RIR/volume/1RM, périodisation cycle 6 semaines colorée par tokens (muscu/warning/accent-2), sessions en `surface-1` avec Badge muscu et focus lime, volume landmarks MEV/MAV/MRV avec status Badge coloré et barres de progression. Icônes lucide (Dumbbell, Calendar, TrendingUp, Target, Sparkles). Composants legacy (PageHeader, Card, SectionTitle, ProgressBar, InfoBox) remplacés par le design system Phase 2
- **Phase 5 — Clarté diabète + séance muscu + pourquoi ce programme (avril 2026)** :
  - **Ratios insuline Ethan** : DIABETES_CONFIG mis à jour avec les vraies valeurs (Matin 1,5U/10g, Midi 1U/10g, Goûter 1,2U/10g, Soir 1U/10g). ISF 100 mg/dL/U (0,5U corrige 50 mg/dL au-dessus de la cible). Stockés en format interne (g par U) avec conversion vers format naturel pour l'UI
  - **Page paramètres diabète refonte Phase 2** : affichage et édition en format naturel "X U pour 10g de glucides" et "X U pour 50 mg/dL au-dessus de la cible" (plus de ratios 1:5, 1:7 cryptiques). Helpers `gPerUtoUper10g` / `uPer10gToGperU` / `formatU`. Surface-1, label cockpit, num tabular, tap-scale, icônes lucide (ArrowLeft, Plus, Trash2, Pencil, Check, X, AlertTriangle, Info). Inline editing par ratio avec validation
  - **Reasoning bolus en langage naturel** : `insulin-calculator.ts` affiche désormais "Ratio matin : 1,5U pour 10g → 35g = 5,3U" au lieu de "Ratio 1:6.67". Correction : "X mg/dL au-dessus → YU (0,5U pour 50 mg/dL)"
  - **Séance muscu : reps cibles claires + RIR expliqué** : header exo réformé (format "3 séries × 6-8 reps" en lime, RIR et Repos discrets). Bloc explicatif inline "Objectif : fais X répétitions par série, en gardant N rep en réserve (RIR = Reps In Reserve : ce qu'il te reste dans le réservoir)". Placeholder input reps = target range (ex. "6-8"). Tooltip sur colonne RIR avec explication complète
  - **Modal "Pourquoi ce programme ?" refonte Phase 2** : sheet bottom-up sur mobile / centré desktop avec glass sticky header, sections clairement titrées (Split choisi, Volume par muscle trié décroissant avec Badge status coloré, **Pourquoi ces exercices** avec raisonnement 1-par-exo groupé par session, Protocole T1D avant/après/alertes, Analyse complète, Prédictions). Icônes lucide (Split, BarChart3, Droplet, Sparkles, Target, Dumbbell, X)
  - **Page muscu : CTA dédié** : nouvelle carte "Pourquoi ce programme ?" en bas de page (surface-1, icône Sparkles muscu, badge IA) pour accès visible à l'analyse. Retrait du bouton ghost redondant dans la rangée d'actions
  - **Diagnostics (morpho/muscu/running/nutrition) : non touchés** — déjà implémentés et opérationnels
- **Phase 6 — Intégration LibreLink Up (FreeStyle Libre 2 live, avril 2026)** : lecture temps réel du capteur via l'API LibreLinkUp Abbott, sans saisie manuelle :
  - **Package** : `@diakem/libre-link-up-api-client` v0.7.2 — factory `LibreLinkUpClient({ username, password, clientVersion })` avec `.read()` qui renvoie `{ current: LibreCgmData, history: LibreCgmData[] }`. Gestion automatique du login + redirect région EU
  - **Architecture serveur** : `lib/libre-link/{config,client,utils}.ts` + routes `GET /api/glucose/current` et `/api/glucose/history`. Cache module-level 60s côté serveur pour éviter de spammer Abbott. Credentials via `LIBRELINK_EMAIL` + `LIBRELINK_PASSWORD` (pas préfixés NEXT_PUBLIC → serveur uniquement, jamais dans le bundle client). `clientVersion` par défaut 4.9.0
  - **Architecture client** : hook `hooks/useGlucose.ts` avec auto-refresh 5 min + refresh visibilité onglet + refetch manuel + états `loading/error/notConfigured`. Mode `"current"` (léger) ou `"history"` (current + 8h de points à 15 min chrono)
  - **Composants** : `GlucoseStat.tsx` (tuile Dashboard avec flèche Abbott + dot pulse "live") et `GlucoseWidget.tsx` (hero /diabete avec age label "il y a X min" qui tick toutes les 30s). Tous deux fallback gracieusement sur la dernière lecture manuelle du store si credentials manquants ou API KO
  - **Wiring** : Dashboard → `<GlucoseStat fallback...>`, /diabete hero → `<GlucoseWidget fallback...>`, bouton "Utiliser la valeur live" sous l'input Glycémie du calculateur bolus (pas d'auto-seed — explicite > implicite pour T1D)
  - **Seuils glycémiques** : hypo 70 / low 80 / target 90-140 / high 180 / hyper 250 (mg/dL). Utilitaires `glucoseTone()` → "hypo"|"low"|"target"|"high"|"hyper", `glucoseToneColor()`, `glucoseToneLabel()` FR, `trendArrow()` (↓↓ ↘ → ↗ ↑↑), `trendLabel()` FR ("Chute rapide", "Descente", "Stable", "Montée", "Montée rapide")
  - **Sécurité** : `lib/libre-link/client.ts` importe `"server-only"` pour garantir qu'il ne fuite pas côté client. Reset automatique du singleton sur 401 pour forcer un relogin
- **Phase 7 — Graphique 8h + correction auto + push notifications (avril 2026)** : les 3 améliorations post-intégration LibreLink qui rendent l'app T1D-grade :
  - **Graphique 8h** (`components/glucose/GlucoseChart.tsx`) : courbe AreaChart Recharts lisant `/api/glucose/history`. Bandes de référence colorées en fond (hypo rouge / target vert / high orange / hyper rouge), lignes de seuil pointillées à 70 et 180, tooltip custom avec `bg-elevated`, stats synthèse (moyenne + temps en plage colorisé). Gradient lime sur l'area. Skeleton / empty states propres. Placé entre le hero et le calculateur bolus.
  - **Correction auto-suggérée** (`components/glucose/CorrectionSuggestion.tsx`) : carte qui s'affiche uniquement quand `current.value > targetRange.max` (180). Calcule `(glucose - 110) / 100` arrondi à 0,5U. **Safety T1D** : si IOB > 0,5U → refuse la suggestion pour éviter le stacking ; si hyper > 250 → warning "vérifier cétones". Bouton direct "Enregistrer la correction (XU)" qui log avec `mealType: "correction"`, `carbsGrams: 0`, note `correction hyper — suggestion auto`.
  - **Push notifications iOS** (infra complète) :
    - **Clés VAPID** : générées via `npx web-push generate-vapid-keys`, stockées en env vars (`NEXT_PUBLIC_VAPID_PUBLIC_KEY` côté client, `VAPID_PRIVATE_KEY` + `VAPID_SUBJECT` serveur)
    - **Storage** : Vercel KV (Redis) pour persister la subscription + timestamps anti-spam (`push:subscription`, `push:last-hypo-alert`, `push:last-hyper-alert`, `push:last-back-in-range`) via `@vercel/kv`. Helpers dans `lib/push/store.ts` (`"server-only"`)
    - **Logique alerte** (`lib/push/alerts.ts`) : `checkGlucoseAndAlert()` lit le snapshot Abbott → si hypo (<70) : push urgence `[200,100,200,100,400]` vibration + requireInteraction, backoff 20 min ; si hyper (>250) : push normal, backoff 30 min. `sendGlucosePush()` gère 404/410 (subscription expirée → clean auto)
    - **API routes** : `POST/DELETE /api/push/subscribe` (valide le shape + persiste), `GET /api/push/test` (push de validation), `GET /api/cron/glucose-check` (auth via `Bearer ${CRON_SECRET}` OU `?secret=` — routine toutes les 5 min via `vercel.json` crons)
    - **Service worker** (`public/sw.js` v2) : handlers `push` et `notificationclick` ajoutés. Tag par type (hypo/hyper) pour remplacer les anciennes notifs. Au tap : focus la fenêtre existante via `clients.matchAll` + `navigate(targetUrl)`, sinon `openWindow('/diabete')`
    - **UI** (`components/glucose/PushOptIn.tsx`) : bouton "Activer les alertes" avec gestion fine des états (`loading / not-supported / requires-standalone / denied / ready / subscribing / testing / subscribed / error`). Détection iOS Safari vs PWA standalone (Web Push iOS exige app installée sur home screen ≥ iOS 16.4). Test automatique à l'activation (envoie un push "notif test envoyée ✅")
    - **Cron externe** (cron-job.org, `*/5 * * * *`) : le plan Vercel Hobby limite les crons à 1/jour (bloque silencieusement les deploys si `vercel.json` contient un cron sub-daily → toujours laisser `vercel.json` minimal `{"$schema":"..."}`). On utilise donc un cron gratuit cron-job.org qui ping `https://apex-coach-dusky.vercel.app/api/cron/glucose-check?secret=${CRON_SECRET}` toutes les 5 min. Schedule activé + "désactivation auto sur trop d'échecs" ON pour anti-spam. `CRON_SECRET` stocké **non-Sensitive** dans les env vars Vercel (Sensitive bloque la lecture ET Copy to Clipboard, ce qui empêche de le réutiliser dans le cron externe)
  - **Déploiement prod** : `npx vercel deploy --prod --yes` (CLI) contourne les webhooks GitHub (parfois cassés). Link initial : `npx vercel link` → crée `.vercel/project.json`
  - **Env vars totales à configurer sur Vercel** : ANTHROPIC_API_KEY, LIBRELINK_EMAIL, LIBRELINK_PASSWORD, LIBRELINK_CLIENT_VERSION, NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT, CRON_SECRET (**non-Sensitive**) (+ les KV_* auto-injectées quand on lie un store KV au projet)
  - **Phase 7 déployée et live en prod (21 avril 2026)** : test push reçu sur iPhone d'Ethan ✅, cron-job.org créé et testé HTTP 200 ✅, graphique 8h + correction auto opérationnels dans /diabete ✅
- **Phase 8 — Refonte scientifique du calculateur nutrition (avril 2026)** : correction des deux bugs majeurs qui faisaient exploser la TDEE à des valeurs irréalistes (Ethan 86kg recevait 5937 kcal/j pour un bulk +0.5kg/sem, soit ~60% trop haut) :
  - **Bug #1 : double-comptage NEAT vs exercice** — l'ancien `ACTIVITY_MULTIPLIERS` (sedentary 1.2 → very_active 1.9) est la table Harris-Benedict classique qui INCLUT déjà l'exercice 3-5×/sem. Puis le code ajoutait les calories d'exercice par-dessus. Fix : nouveau `NEAT_MULTIPLIERS` (1.2 à 1.55) pour NEAT **uniquement** (job + marche hors sport), + `JOB_NEAT_BONUS` additif (desk 0 / standing +0.05 / physical +0.1). L'exercice est ajouté explicitement ensuite
  - **Bug #2 : formule running ~5× trop haute** — `weight × 0.9 kcal/min` donnait 77 kcal/min pour 86kg (équivalent sprint à 16 km/h soutenu). Fix : formule MET-based standard ACSM `kcal/min = (MET × 3.5 × weightKg) / 200` avec 8.3 MET pour running modéré Z2 (jogging 9-10 km/h, cohérent prep semi-marathon). Idem pour muscu : 5.5 MET (vigoureux) au lieu de constante 5.5 kcal/min
  - **Mode "objectif chiffré"** — nouveau champ `targetTimelineWeeks` dans `NutritionDiagnosticData`. Si l'utilisateur fournit `targetWeight` + `targetTimelineWeeks`, on calcule le delta en **inversant depuis l'objectif** : `kcalDelta = (targetWeight - currentWeight) × 7700 / weeks / 7` (7700 kcal = 1 kg, standard accepté). Clampé à ±800 kcal/j. Override le mode `aggressiveness` historique (gardé comme fallback pour rétrocompat du form). Le form step 2 ("Objectif") expose maintenant 2 inputs côte-à-côte (poids cible + semaines) avec preview live du rythme calculé en kg/sem
  - **Sanity checks** — `NutritionCalculation.warnings: string[]` avec messages FR humainement lisibles. Warnings déclenchés si : TDEE/BMR > 2.6 (séances surévaluées ?), target < BMR×1.1 (déficit trop agressif, risque métabolique), target > BMR×2.8 (surplus excessif, prise de gras dominant), target < 1500 kcal pour homme ou 1200 pour femme (non recommandé sans suivi médical), rythme timeline > ±800 kcal/j (non soutenable, suggestion d'étaler). Affichés en bannière `warning` dans `NutritionResults`
  - **Nouveaux champs dans `NutritionCalculation`** : `calorieDelta` (surplus/déficit vs TDEE), `weeklyWeightChangeKg` (variation prévue, 2 décimales), `surplusSource` ("timeline" | "aggressiveness" | "maintain")
  - **NutritionResults refondu en Phase 2** — surface-1, num-hero 6xl/7xl lime pour target kcal, tokens catégoriels, icônes lucide (Target, Flame, Dumbbell, Footprints, TrendingUp/Down/Minus, AlertTriangle, Check, Undo2, ChevronDown, Info), plus d'emojis. Sections : header objectif + bannière warnings si any + hero kcal avec TDEE/delta/kg/sem + macros 3 lignes colorées + breakdown collapsible avec hints ("Mifflin-St Jeor", "Formule MET 5.5/8.3", "~10% du TDEE brut") + meal plan collapsible + tip T1D + "Sources & méthode" (Mifflin, Ainsworth Compendium, Helms et al.)
  - **Nouveau champ `averageMuscuDuration`** (défaut 60 min) dans le diagnostic + UI option (30/45/60/75/90 min) sur step 1 quand muscuSessionsPerWeek > 0. Remplace la constante hardcodée `muscuDuration = 60`
  - **Cas Ethan (86kg → 92kg en 12 sem)** : BMR 1930 + NEAT 579 (light, desk) + exercise 525 (4×60 muscu + 3×45 running) + TEF 303 = **TDEE 3337**. Mode timeline : +550 kcal/j → **target 3887 kcal/j** pour +0.5kg/sem (vs 5937 en v1, soit -34%). Macros : 189g prot (2.4g/kg bulk + bonus runner), 86g lipides, 552g glucides
- **Phase 9 — Diabète : ratios modifiables + migration localStorage + bolus correct (avril 2026)** : correction des 3 bugs bloquants remontés par Ethan (impossible de modifier "U pour 10g", bolus 60g midi = 8,5U au lieu de 6U, raisonnement affichait "1,4 U/10g" pour midi au lieu de 1 U/10g configuré) :
  - **Bug racine : localStorage pré-Phase 5 persisté** — Zustand `persist` hydrate le state depuis localStorage, ce qui écrasait les valeurs de `DIABETES_CONFIG` même après mise à jour des constantes. Les vieilles installations gardaient `ratios.lunch = 7` (format "1:7" legacy) → `60g / 7 = 8,57U` au lieu de `60g / 10 = 6U`. Fix : persist `version: 2` + fonction `migrate()` dans `lib/store.ts` qui détecte les vieilles valeurs (heuristique `lunch < 9` ou `morning < 6`) et réimporte `DIABETES_CONFIG.ratios` + `insulinRatios` + `insulinSensitivityFactor` sans toucher au reste du state (glucose, injections, etc.)
  - **Bug stale useState** — `RatioSentence` dans `app/diabete/parametres/page.tsx` faisait `useState(formatU(unitsPer10g))` qui ne se resynchronise JAMAIS quand le prop `unitsPer10g` change (après migration ou update externe). Fix : `useEffect(() => { if (!editing) setDraft(formatU(unitsPer10g)); }, [unitsPer10g, editing])` pour sync le draft local quand le store change
  - **Type extension snack** — ajout `snack: number` dans `DiabetesConfig.ratios` (types/index.ts). Extension de `DIABETES_CONFIG.ratios` dans `lib/constants.ts` pour inclure snack : `{ morning: 10/1.5, lunch: 10, snack: 10/1.2, dinner: 10 }`. Logique de sync legacy dans la page parametres étendue aux 4 slots (matin/midi/goûter/soir) au lieu de 3
  - **UX ratios enfin modifiables** : pencil edit button **toujours visible** (retrait du `opacity-0 group-hover:opacity-100` qui le masquait sur mobile), boutons Valider/Annuler inline pendant l'édition, support décimale française (`parseFrenchNumber()` accepte "1,5" ou "1.5"), bouton "Réinitialiser mes ratios" en bas de page avec dialog de confirmation qui reset tout à `DIABETES_CONFIG` (filet de sécurité si la migration rate)
  - **Cas Ethan (après hard refresh post-deploy)** : migration auto détecte `lunch = 7 < 9` → réimporte `{ morning: 6.67, lunch: 10, snack: 8.33, dinner: 10 }`. Reasoning bolus affiche désormais "Ratio du midi : 1U pour 10g → 60g = 6U". Total bolus 60g midi glycémie normale = **6,0U** (vs 8,5U avant). Plus de valeurs bloquées en édition, plus d'incohérence UI/calc
- **Phase 3 (dashboard) — Page d'accueil épurée (avril 2026)** : refonte du Dashboard selon la même philosophie que les 4 pages principales :
  - **Hero** : "Bonjour/Bel après-midi/Bonsoir, {Ethan}." (prénom en lime), date lisible en label
  - **1 action du jour** (pas plus) : priorité dynamique → séance muscu du jour si programmée (surface-1, icône muscu, flèche ArrowUpRight) > sinon alerte diabète si glycémie hors plage > sinon carte "Jour de repos"
  - **3 stats max** : Glycémie (avec tendance ↑↓→ vs lecture précédente), Calories (X / target), Séances (X/Y cette semaine) — chaque tuile est `num-hero` coloré par token de catégorie et cliquable
  - **Accès rapide** : grid 2×2 de QuickLinks (Muscu, Running, Nutrition, Diabète) avec icône tinted par couleur de catégorie + chevron
  - Retrait : Sparkline glucose, ratios cockpit, MetricCard grid 4, sections détaillées par module, goals strip. Tout ce contenu vit dans les pages dédiées
- **Phase 3 — Simplification radicale des 4 pages principales (avril 2026)** : philosophie "clair, pas 12000 infos, une action primaire par page" :
  - **Muscu** : hero "Séance du jour" lisible (today computed via DAYS_FR + getDay), exos format `3×12` direct en lime, liste 7 jours compacte, rest day hero si aucun match, retrait body map + landmarks + périodisation complète (seulement phase/RIR/focus en hero)
  - **Running** : hero semaine courante avec 3 stats essentielles (séances X/Y, km X/Y, VMA) + chevrons prev/next, cards séances avec distance big-num + pace range + intervalles + T1D glucose badges si completée, grid compacte prédiction semi + zones, plan 14 semaines bars avec Check icon complete, tip T1D 4 badges glucose
  - **Nutrition** : hero Ring calories (size 168 strokeWidth 12 color `--nutrition`) avec num-hero central + MacroRows (protéines/glucides/lipides avec Progress bars et remaining), logger minimal (quick-foods grid 6 presets + manual repli), repas du jour cards compactes avec Badge nutrition + macros one-liner, tip T1D bolus 1-liner
  - **Diabète** : hero dual (Glycémie avec Pulse tone + IOB Syringe) en surface-2, CALCULATEUR BOLUS central avec glow-accent et résultat hero num-hero 6xl/7xl `{total}U` lime-lavender, 2 BolusInput géants (glucides + glycémie), meal selector 4 chips, switch pré-workout avec muscu/running chips colorés par tokens, adjustments Badge warning, action "Enregistrer l'injection (XU)" qui save direct, reasoning dans `<details>` masqué, grid secondaire log glycémie + historique injections, footer ratios chips compacts
  - Toutes les 4 pages : `.stagger` entry animation, `.tap-scale`, icons lucide (Calculator, Syringe, Droplet, Apple, Dumbbell, Footprints, TrendingUp/Down, Minus, AlertTriangle, ChevronRight, Settings, Sparkles), zéro emoji, tokens catégoriels (muscu/running/nutrition/diabete) utilisés systématiquement

Le profil utilisateur par defaut est configure pour Ethan, 21 ans, 188cm, 85kg, DT1 sous Novorapid + FreeStyle Libre.

Toutes les routes API utilisent Claude Sonnet 4 cote serveur (cle API dans .env.local). La generation de programmes utilise une strategie hybride (AI-first + fallback local) pour la fiabilite.
