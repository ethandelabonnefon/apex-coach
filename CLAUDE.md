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
- **Ratio insuline** : varie par moment (matin plus fort 1:5, soir plus faible 1:9)
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
- **Design System Phase 2 — Refonte "Precision Instrument"** : nouvelle palette Electric Lime + Soft Lavender, composants signature (HeroMetric, MetricCard, Ring, Sparkline, Pulse), typography mono tabular-nums pour toutes les métriques, navigation refaite avec icons lucide-react et active indicators, utilitaires `.surface-1/2/3`, `.label`, `.num`, `.stagger`, glass headers saturate 180%, Dashboard refondu en preview

Le profil utilisateur par defaut est configure pour Ethan, 21 ans, 188cm, 85kg, DT1 sous Novorapid + FreeStyle Libre.

Toutes les routes API utilisent Claude Sonnet 4 cote serveur (cle API dans .env.local). La generation de programmes utilise une strategie hybride (AI-first + fallback local) pour la fiabilite.
