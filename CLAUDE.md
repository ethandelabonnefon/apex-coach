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

Le projet est une PWA fonctionnelle deployee sur Vercel. **Toutes les fonctionnalites planifiees sont implementees**, incluant la **Phase 11 "Diabète Intelligence Layer" (mai 2026, 6 blocs + 5 itérations de calibrage)**. Les modules principaux (diagnostic, generation programme, coach IA, suivi diabete, running tracking, nutrition tracking) sont operationnels. Le build TypeScript strict passe sans erreur. Validé en preview navigateur cas par cas.

### Phase la plus récente (mai 2026) : Diabète Intelligence Layer
- **Bolus Calculator v2** : FPU + split dose, trend arrow adjustment, IOB stacking advisor, pre-workout advisor, conseil de timing d'injection
- **Meal Logger** : 9 quick-tags (Pâtes, Riz, Pizza…) × 3 tailles avec pré-fill macros, score complexité digestive, historique par tag avec suggestions
- **Pattern Engine** : 5 règles cliniques (nuit-hyper, recurring-hypo, post-meal-spike, dawn, CV-degradation) avec push notif locale + UI cartes dismiss
- **Métriques cliniques** : GMI (HbA1c estimée), GRI Klonoff zones A-E, calendrier 30j heatmap par score quotidien, AGP 14j (médiane + P25-P75)
- **Bilan IA v2** : enrichissement contexte Claude (patterns + sport + macros), insights croisés, suggestions diabéto-style
- **Sport-Glucose Correlation** : 5 checkpoints T-30→T+120 calculés à la volée, 2 onglets muscu/running, recommandation pré-sport perso
- **Briefing pré-sport indépendant** : advisor "filet de sécurité" qui détecte IOB + glycémie live + split en attente → recos actionnables (manger glucides, réduire/décaler la 2e dose) avec boutons inline qui modifient le store

Voir `### Phase 11 — "Diabète Intelligence Layer"` plus bas pour les détails par bloc.

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
- **Phase 10a — Multi-profils ratios + archive glycémie 90j + page historique (avril 2026)** : poser les fondations pour le bilan hebdo AI (Phase 10b+c). Le T1D doit pouvoir changer de ratios selon la période (sèche/bulk/maintenance), et on a besoin d'au moins 30j de data pour détecter des patterns. Trois blocs :
  - **Bloc 1 — Multi-profils** : nouveau type `RatioProfile` (types/index.ts) avec `{ id, name, description, ratios, insulinRatios, ISF, basalDose, createdAt }`. `DiabetesConfig` devient `{ profiles: RatioProfile[], activeProfileId, targetGlucose, targetRange, insulinActiveDuration, knownPatterns, [mirrors flat] }`. Les champs flat (`ratios`/`insulinRatios`/`ISF`) sont des **miroirs du profil actif** synchronisés par les setters — zéro refactor des 5 consumers existants
  - **Actions store** : `setActiveRatioProfile(id)` (bascule + sync miroirs + sync UserProfile.basalDose), `addRatioProfile`, `updateRatioProfile` (resync miroirs si profil actif), `deleteRatioProfile` (garde-fous : interdit de supprimer le dernier ou l'actif), `duplicateRatioProfile(id, newName)` avec regénération des IDs (évite collision d'IDs d'insulinRatios)
  - **Migration persist v3** : détecte absence de `cfg.profiles` → wrap les valeurs existantes dans un profil "Par défaut" (reprend exactement ce que l'user avait), puis clone en "Sèche" (basal -1U) et "PDM" (basal +1U) comme points de départ. Les IDs d'insulinRatios sont préfixés `r-cut-*` / `r-bulk-*` pour éviter les collisions cross-profiles. Zéro perte de data existante
  - **Tag profileId sur InsulinLog** : auto-rempli par `addInsulinLog` avec `diabetesConfig.activeProfileId` si non fourni → chaque dose sait sous quel profil elle a été faite (base pour les analyses futures "TIR en Sèche vs PDM")
  - **UI `/diabete/parametres`** : nouvelle section "Profil actif" en haut de page avec chips cliquables (Check sur l'actif, double-clic pour renommer), chip "Nouveau profil" qui duplique l'actif avec un nom choisi, basal dose éditable inline dans la carte du profil actif (mirror UserProfile.basalDose), actions supprimer par profil (hors actif) avec dialog de confirmation. Design system Phase 2 : surface-2, glow-accent sur chip actif, tap-scale, icônes lucide (Copy, Trash2, History, Check, Pencil, X)
  - **Bloc 2 — Archive glucose 90j** : Vercel KV sorted set `glucose:archive` (score = timestamp ms, value = JSON `{t, value, trend, isHigh, isLow}`). Helpers dans `lib/glucose-archive/store.ts` : `archivePoints()` (dédupe par timestamp avant insert via `zrange byScore`), `purgeOldPoints()` (supprime > RETENTION_MS), `readPoints(from, to)`, `getArchiveMeta()`. Volumétrie : 90j × 96 pts/j × ~120B = ~1 MB, trivial pour KV Hobby 256 MB
  - **Cron archive** : `GET /api/cron/archive-glucose` (Bearer `CRON_SECRET`), appelé toutes les 4h via cron-job.org. Chevauchement avec l'historique Libre 8h pour redondance (un cron qui rate est rattrapé par le suivant). Flow : fetch snapshot Libre → map en `ArchivedPoint[]` → `archivePoints()` avec dédupe → `purgeOldPoints()` → retourne stats
  - **Route lecture** : `GET /api/glucose/archive?days=7|14|30|90` (pas d'auth — aucun PII sensible), clamp 1-90j, retourne `{ points, range, meta }`. Consumée par la page historique
  - **Bloc 3 — Page `/diabete/historique`** : sélecteur période (7/14/30/90j) en chips, 3 sections :
    1. **Stats récap** : grid 4 tuiles (Moyenne ± SD, TIR %, CV %, Hypos/Hypers) colorisées par tone (success/warning/error selon seuils), + barre de répartition par zone (hypo/low/target/high/hyper) avec légende et % inline
    2. **Pattern par heure** : bar chart Recharts 24 barres (moyenne glycémique par heure du jour agrégée sur toute la fenêtre) colorées par zone glycémique (vert target, orange high, rouge hyper/hypo). Lignes de seuil 70/180 en pointillés. Top 3 heures à risque affichées en chips sous le chart
    3. **Line chart période** : ComposedChart avec gradient lime, zone cible 80-180 surlignée vert, seuils 70/180 pointillés, **triangles lavender overlay** pour chaque injection insuline dans la fenêtre (lien cause-effet bolus → glycémie). Pour 30/90j : bucketise à l'heure (moyenne) pour éviter de laguer Recharts
  - **Lien navigation** : bouton "Historique" ajouté dans le header `/diabete` à côté de Patterns et Paramètres. Bouton "Historique" aussi accessible depuis `/diabete/parametres`
  - **Cron externe à configurer manuellement sur cron-job.org** : nouvelle entrée `*/240` (ou cron expression `0 */4 * * *`) → `https://apex-coach-dusky.vercel.app/api/cron/archive-glucose?secret=${CRON_SECRET}`
  - **Ce qu'on a pas encore fait (à venir Phase 10b+c)** : moteur stats déterministe (détection patterns par créneau + post-meal spike par mealType), génération bilan hebdo dominical via Claude Sonnet 4, push notif "ton bilan hebdo est prêt"
- **Phase 10b — Moteur stats déterministe (avril 2026)** : `lib/glucose-archive/analytics.ts`, fonction pure `buildWeeklyReport({ points, injections, range, profileNameById })` qui produit un `WeeklyReport` JSON consommable par Claude :
  - `overall` : count/avg/sd/cv/TIR/hypoCount/hyperCount sur la fenêtre
  - `byTimeBucket` : 8 créneaux de 3h (00-03h, 03-06h, 06-09h, …, 21-00h) avec stats par bucket
  - `byHour` : 24 buckets horaires (alimente la viz pattern existante)
  - `riskyHours` : top 3 heures avec moyenne la plus haute (count >= 2)
  - `postMeal` : pour chaque mealType, courbe glycémique à T+0/+1h/+2h/+3h post-injection (tolérance ±15min sur le sample), avgPeak, avgDelta, hypoFollowupCount (nb d'injections où la glycémie est repassée < 80 dans les 3h)
  - `hypoEvents` / `hyperEvents` : top 5 épisodes regroupés en runs continus (gap max 30 min) avec startMs/endMs/durationMin/min ou maxValue/pointCount
  - `byProfile` : stats par profil ratio actif au moment de chaque injection (avgPeak, avgDelta, hypoFollowup post-bolus pour ce profil) — base pour comparer Sèche vs PDM
  - Pure function — aucun import serveur, testable standalone
- **Phase 10c — Bilan IA hebdomadaire (avril 2026)** : `POST /api/diabete/weekly-insight` qui combine le moteur Phase 10b + Claude Sonnet 4 pour produire un bilan en langage naturel avec suggestions incrémentales.
  - **Body** : `{ days?: number, injections: InsulinLog[], profiles: { id, name }[], activeProfileName?: string }`. Les injections viennent du store client (pas archivées en KV pour l'instant). `days` clamp 1-90.
  - **Flow** : (1) `readPoints(fromMs, toMs)` depuis KV → (2) normalize injections + filter à la fenêtre → (3) `buildWeeklyReport()` → (4) prepare `claudeContext` minimal (pas tous les points raw, juste les agrégats déterministes) → (5) call Claude Sonnet 4 avec system prompt T1D-strict → (6) parse JSON output → return `{ report, insight }`
  - **System prompt T1D-strict** (règles dures non-négociables) : jamais d'auto-apply, increments max ±10% sur ratio bolus / ±10 mg/dL sur ISF / ±1U sur basal, données insuffisantes (< 14j ou < 3 injections par bucket) → pas de suggestion concrète juste observation, CV > 50 → pas de conclusion sur les ratios (régularité d'abord), hypos = priorité absolue (jamais monter un ratio si hypos sur ce repas), patterns nommés (dawn 5-9h, remontée 16h, hypo post-repas, pic excessif > 220), confidence high/medium/low calibrée sur taille échantillon, summary rappelle systématiquement validation diabéto
  - **Output JSON strict** : `{ summary, highlights[2-4], suggestions[max 4]{area, suggestion, rationale, confidence}, warnings[max 3], generatedAt }`. `area` ∈ {ratio-midi, ratio-matin, ratio-soir, ratio-snack, isf, basal, timing, regularite, autre}
  - **Garde-fous serveur** : si `pointsCount === 0` → court-circuit, retour direct sans appel Claude. Si `kv_not_configured` → 503.
  - **UI `/diabete/historique`** : nouvelle section "Bilan IA · {days}j" en haut (juste après le sélecteur de période), CTA Sparkles "Générer" / "Régénérer" / "Analyse…" avec spinner Loader2. Affichage structuré : summary lavender (surface accent-2), warnings warning, highlights avec CheckCircle2 success, suggestions en cards avec area label, confidence badge coloré (Forte/Modérée/Faible), suggestion en bold + rationale en text-tertiary. Footer "Généré le X · valide avec ton diabéto". L'insight reset si l'user change de période (les stats ne match plus).
  - **Génération 100% manuelle, par décision produit** : Ethan préfère déclencher le bilan à la demande quand il a besoin d'analyser une période — pas de cron dominical, pas de push notif, pas de persist KV des bilans. Le bouton "Générer / Régénérer" sur `/diabete/historique` est l'unique entry point. Cette décision simplifie l'archi (pas de Phase 10d) et évite la fatigue de notification. Si jamais on revient là-dessus plus tard, l'infra (route + moteur stats) est déjà prête, il suffirait d'ajouter `/api/cron/weekly-bilan` qui appelle l'endpoint et envoie la push.
  - **Phase 10b+c déployée et live en prod (25 avril 2026)** : `dpl_8v1H1sacJQebxJfD3Dm3Z6mVeVjn` — testé sur 7j (126 points, 0 injection enregistrée à ce stade). Claude joue parfaitement son rôle de filet de sécurité : il identifie le pic post-déjeuner (13-15h à 189-200 mg/dL = pattern "remontée 16h" documenté), félicite TIR 79,4%, mais refuse de proposer des ajustements ratios sans data d'injections. Les 3 warnings affichés ("pas assez de data", "impossible d'analyser sans injections", "reviens avec plus de data") sont la preuve que le system prompt T1D-strict tient. **Pour que les bilans deviennent actionnables, Ethan doit logger ses injections** via le calculateur de bolus de `/diabete` — chaque injection enregistrée alimente `byMeal`, `postMeal` curve T+0/+1h/+2h/+3h, et `byProfile` pour comparer Sèche vs PDM.

## Module Diabète T1 — État actuel (avril 2026) et Roadmap Phase 11+

### Pipeline existant (complet et stable)
- **Live data** : LibreLink Up → glycémie temps réel (Phase 6) + graphique 8h (Phase 7)
- **Calculateur bolus** : multi-profils ratios (Phase 10a) + format naturel "X U pour 10g" (Phase 5)
- **Alertes safety** : push iOS hypo <70 / hyper >250 avec backoff anti-spam (Phase 7) + correction auto-suggérée si glucose >180 et IOB <0,5U (Phase 7)
- **Archive long terme** : Vercel KV 90j alimentée par cron 4h (Phase 10a)
- **Page historique** : 7/14/30/90j avec stats récap, pattern par heure, courbe + injections overlay (Phase 10a)
- **Bilan IA à la demande** : Claude Sonnet 4 avec system prompt T1D-strict, suggestions incrémentales validées par diabéto (Phase 10b+c)

### Profil diabète Ethan (mai 2026) — à utiliser comme contexte pour toute décision
- **Schéma insuline** : Novorapid (rapide, stylo) + Lantus (basale, stylo)
- **Basale** : 28U Lantus le soir ~19h20-19h30, au moment du dîner
- **Ratios rapide** : Matin 1,5U/10g — Midi 1U/10g — Goûter 1,2U/10g — Soir 1U/10g
- **ISF** : 100 mg/dL par U (0,5U corrige 50 mg/dL au-dessus de cible 110)
- **Durée active insuline** : 195 min (~3h15)
- **Sport** : muscu ou running le soir après dîner (~20h), parfois weekend l'après-midi (rarement le matin)
- **Capteur** : FreeStyle Libre 2 via LibreLink Up

### Problèmes glycémiques identifiés (mai 2026)
1. **Hyperglycémie nocturne post-gros repas** : grosses portions de pâtes le soir (70g+ glucides) → digestion 4-5h dépasse la durée d'action du Novorapid (~3h15) → montée nocturne. Cas classique de FPU (Fat-Protein Units) non couvert. Solution : split dose (2e injection à T+2h30-3h)
2. **Stacking IOB goûter 17h30 + dîner 19h + sport 20h** : chevauchement de deux bolus rapprochés + muscu → soit hypo (IOB cumulé trop fort) soit hyper (sous-dosage par peur de l'hypo). Le système doit calculer l'IOB combiné et donner un avis contextuel pré-sport
3. **Absence de contexte repas dans les analyses** : seuls les glucides sont loggés, pas le type de repas ni les macros complètes (lipides, protéines). Le bilan IA ne peut pas distinguer un ratio mal calibré d'un repas à digestion lente
4. **Ethan utilise Yazio** pour le suivi nutrition (calories, macros détaillées) mais pas de connexion API → import manuel possible (copier les macros ou screenshot)

### Phase 11 — "Diabète Intelligence Layer" (livrée mai 2026) ✅

Architecture en **6 blocs livrés** + 5 itérations de calibrage post-livraison. Tout déployé sur `main`, build TS strict passe, validé en preview navigateur.

**Status par bloc** :

| Bloc | Status | Commit principal |
|---|---|---|
| 1 — Bolus Calculator v2 (FPU + trend + IOB advisor) | ✅ livré | `2f94e98` |
| 2 — Meal Logger intelligent (quick-tags + complexité + historique) | ✅ livré | `e963047` |
| 3 — Pattern Engine proactif (5 règles + push notif locale) | ✅ livré | `f72c7fd` |
| 4 — Métriques cliniques avancées (GMI + GRI + Calendrier + AGP) | ✅ livré | `4552296` |
| 5 — Bilan IA v2 contextualisé (patterns + sport + meal context) | ✅ livré | `5c06948` |
| 6 — Sport-Glucose Correlation Engine | ✅ livré | `215f743` |

**Itérations de calibrage post-livraison** :
- `0eb5b8b` Seuils split dose relevés (FPU ≥ 2 + carbs ≥ 40 + fpuBolus ≥ 1.5) — fix faux positifs sur salades / sandwichs
- `d201774` Conseil de timing d'injection (pré-bolus / pendant / après) selon glycémie + trend
- `c547a91` Briefing pré-sport indépendant (advisor "filet de sécurité" entre injections)
- `b90adae` Calibrage briefing pré-sport (caps physiologiques, fenêtre > 120min → "re-vérifie")
- `de8edf9` Trend Libre intégrée au calcul + transparence UI complète (breakdown des drops)

**Recap fonctionnel pour Ethan** :
- Le calculateur de bolus de `/diabete` est maintenant un advisor multi-facteurs : **glucides + macros (FPU split dose) + trend Libre + IOB stacking + pre-workout + meal-tag history + conseil de timing d'injection**
- La page `/diabete/historique` affiche **GMI (HbA1c estimée), GRI Klonoff, calendrier heatmap 30j, AGP 14j, corrélation sport-glycémie 2 onglets, patterns détectés, bilan IA hebdomadaire à la demande**
- La section **"Briefing pré-sport"** (toggle on `/diabete`) est l'advisor "filet de sécurité" entre deux moments d'injection — détecte automatiquement IOB + glycémie live + split dose en attente, donne des recommandations actionnables (manger glucides, réduire ou décaler la 2e dose) avec **boutons d'action inline** qui modifient directement le store Zustand
- Tous les calculs ont des **garde-fous physiologiques** (caps drop, floors glycémie, alternatives "re-vérifie ta glycémie 30min avant" pour les fenêtres trop longues)

**Détails complets** : voir les sections `### Phase 11 — Bloc N` ci-dessous.

**Évolutions futures possibles (hors roadmap active)** : import historique LibreView, export CSV pour partage diabéto, intégration Dexcom G7 si changement capteur, connexion API Yazio si disponible, persistance des checkpoints sport (actuellement calculés à la volée depuis l'archive — suffisant tant que l'archive 90j tient).

### Phase 11 — Bloc 1 : Bolus Calculator v2 (mai 2026)
Première salve de la "Diabète Intelligence Layer". Le calculateur de bolus passe d'un simple ratio + correction à un advisor multi-facteurs.

- **FPU (Fat-Protein Units)** : `lib/insulin-calculator.ts` accepte maintenant `fatGrams` et `proteinGrams`. Calcule `totalFPU = (fat*9 + prot*4) / 100`, dérive `fpuBolus = (totalFPU * 10) / ratio`, et classe la complexité digestive en `simple` (< 1 FPU, ~2h), `moderate` (1-3 FPU, ~3-4h) ou `complex` (≥3 FPU, ~5h). Helper réutilisable `getDigestiveComplexity()` exporté.
- **Split dose suggéré** : si `totalFPU >= 1` → return inclut `splitDose: { now, later, delayMinutes }` avec délai 90/120/150min selon FPU (1/2/3+). `now` = bolus glucides+correction+trend, `later` = `ceil(fpuBolus)` (stylo, pas de demi-unités). Reasoning naturel "Repas complexe (3,3 FPU) : digestion ~5h. Suggestion split : 6U maintenant, puis 4U dans 2h30."
- **Trend arrow adjustment (slide rule)** : `trendArrow` (1=↓↓ ... 5=↑↑) en input → ajustement -1U/-0.5U/0/+0.5U/+1U. Le bouton "Utiliser la valeur live" récupère AUSSI la trend depuis le hook `useGlucose` et la passe au calculateur. La flèche s'affiche dans le champ glycémie (suffixe juste avant `mg/dL`). Reasoning "Tendance ↗ : +0,5U (glycémie en montée au moment du bolus)".
- **Alerte IOB stacking enrichie** : encadré au-dessus du résultat quand IOB > 1U. Affiche le détail "IOB actif : 2,3U (lunch de 12h45)", explique que le bolus glucides n'est PAS réduit, montre la correction réduite anti-stacking, et calcule le **total effectif** (`finalUnits + IOB`) qui travaille réellement sur la glycémie.
- **Pre-workout advisor contextuel** : encadré sous le toggle pré-entraînement quand actif. Calcule `estimatedGlucoseAtWorkout = currentGlucose - (IOB × ISF × min(1, minutesUntilWorkout/activeDuration))`. Messages dynamiques :
  - **Muscu** : <120 → "Risque d'hypo, mange Xg" (rouge), >250 → "Trop haute, corrige et attends 30min" (orange), sinon → "Safe, +30 à +50 mg/dL attendu" (vert)
  - **Running** : <140 → "Risque d'hypo, mange Xg de glucides rapides" (rouge), >250 → "Vérifie cétones" (orange), sinon → "Safe, emporte du sucre" (vert)
- **Push notification rappel split dose** : nouveau type `SplitDoseReminder` (types/index.ts) persisté dans le store Zustand (`splitDoseReminders[]` avec `addSplitDoseReminder` / `updateSplitDoseReminder` / `removeSplitDoseReminder`). À chaque tick (60s), la page `/diabete` regarde les rappels `pending` arrivés à échéance → tire `serviceWorker.showNotification()` locale et marque comme `fired`. Service worker `public/sw.js` v3 : `requireInteraction: true` pour `type === "split-dose"`.
- **UI rappels split dose** : section dédiée au-dessus du calculateur avec liste des rappels en attente (countdown si pas encore dû, surface lime si dû). Boutons "Logger" (auto-crée un `InsulinLog` `isSplitDose: true` avec `parentInjectionId`) ou "Annuler" (poubelle). Toast informatif après log d'une injection avec split dose : "Rappel programmé : 4U dans 2h30…" (auto-disparaît après 6s).
- **Champs étendus `InsulinLog`** : `fatGrams?`, `proteinGrams?`, `mealTag?`, `mealSize?`, `trendArrow?`, `isSplitDose?`, `parentInjectionId?` — tous optionnels pour rétrocompat avec les anciennes injections persistées. La liste des injections affiche maintenant les macros si présentes (`Xg lip · Yg prot`) et un badge "split" pour les injections de couverture FPU.
- **Block UI calculateur** : champ "Lipides & protéines (optionnel)" rétractable (collapsé par défaut, ne pollue pas l'UI quand non utilisé). Quand FPU >= 1, le résultat hero affiche "Maintenant : XU" (label) + un bloc lavender "Puis dans 2h30 : YU · couverture FPU". Breakdown grid passe à 4 cases si fpuBolus > 0 ou trendBolus ≠ 0 (Glucides, Correction, FPU, Tendance).
- **Build TS** : passe sans erreur. Toutes les features testées dans le preview : champ glycémie 87 → flèche →, FPU 25g lip + 30g prot → split 3U + 4U dans 2h30, badge "Complexe", advisor running affiche "Risque d'hypo, mange 16g de glucides rapides".

### Phase 11 — Bloc 2 : Meal Logger intelligent (mai 2026)
Capture du contexte repas au moment du bolus, sans friction. Alimente les blocs 3+5 (pattern engine, bilan IA) et le block 6 (meal-tag history).

- **Quick-tags visuels** (`lib/meal-tags.ts`) : 9 tags `MEAL_TAGS` ciblés sur le quotidien d'Ethan (Pâtes, Riz, Pizza, Sandwich, Salade, Snack sucré, Viande+accomp., Petit-déj, Autre). Chaque tag définit `iconName` (lucide), `avgFat`, `avgProtein`, `complexity`. Mappés en composants React via `MEAL_TAG_ICONS` dans la page diabète (Wheat, Soup, Pizza, Sandwich, Salad, Cookie, Beef, Croissant, UtensilsCrossed). **Aucun emoji** — design system Phase 2 strict.
- **Tailles repas** : `MEAL_SIZES` (Normal 1×, Gros 1.3×, Énorme 1.6×) — multiplicateur appliqué sur `avgFat`/`avgProtein` du tag pour pré-remplir les champs lipides/protéines. Helper `inferMacrosFromTag(tagId, sizeId)`.
- **UI dans le calculateur** : section "Type de repas" entre Glycémie et "Repas" (sélecteur horaire). Grid 3 colonnes de chips avec icône lucide + label. Toggle de sélection (re-clic → désélection). Quand un tag est sélectionné, chips de taille apparaissent en dessous (animate-slide-up). Pré-remplit auto les champs lipides/protéines, déplie le block macros, et affiche "(pré-remplis)" dans le label. Si l'user override les macros manuellement (`macrosManuallyEdited`), les valeurs ne sont plus écrasées par les changements de tag/size.
- **Score complexité digestive (Bloc 2.2)** : `getDigestiveComplexity(carbs, fat, prot)` exporté de `lib/insulin-calculator.ts`. Renvoie `{ level, estimatedDigestionHours, message, fpu }`. UI : petit hint coloré sous le breakdown bolus (vert simple / orange moderate / rouge complex) avec icône Clock + message ("Digestion longue ~5h. Re-check glycémie à T+3h."). Affiché uniquement si fat > 0 OU prot > 0.
- **Historique par type de repas (Bloc 2.3)** : `lib/meal-analytics.ts` exporte `getMealTypeHistory(insulinLogs, archivePoints, mealTag, limit=5)` — pure function. Croise les `InsulinLog[]` filtrés par `mealTag` (et `!isSplitDose` pour éviter les doublons FPU) avec les points archive 30j fetched depuis `/api/glucose/archive?days=30`. Calcule deltaT2h, deltaT4h, peak (fenêtre 4h), et génère une suggestion contextuelle :
  - delta T+4h ≥ +60 mg/dL → "envisage un split dose pour couvrir la digestion lente"
  - delta T+2h ≥ +80 mg/dL → "ton ratio actuel sous-dose ces repas"
  - peak ≥ 220 mg/dL → "essaie un pré-bolus 15min avant"
  - sinon `suggestion: null` (rien d'affiché — pas de bruit)
- **UI suggestion historique** : petit encadré lavender (Info icon + texte secondary) sous les chips de taille, visible uniquement si count ≥ 3 ET suggestion non-null. Évite les recommandations basées sur trop peu de data.
- **Champs étendus `InsulinLog`** : `mealTag` et `mealSize` propagés à chaque `addInsulinLog`. La liste des injections affiche maintenant le tag (ex: `#pates · big` en lavender) en plus des macros.
- **Build TS** : passe. Testé dans preview : Pâtes + Énorme → 24g lip + 40g prot pré-remplis, split 6U + 4U dans 2h30, badge "Complexe", hint "Digestion longue (~5h). Re-check à T+3h."

### Phase 11 — Bloc 3 : Pattern Engine proactif (mai 2026)
Détection automatique des patterns glycémiques récurrents avec push notification locale et UI inline. Standard clinique : règle des 3 jours / 4 sur 7.

- **Moteur déterministe** (`lib/glucose-archive/pattern-engine.ts`) : pure function `detectPatterns(points, injections, config, nowMs)` → `DetectedPattern[]`. Aucun import serveur, testable standalone. Trie par sévérité (`alert > warning > info`) en sortie.
- **5 règles implémentées** :
  - **night-hyper** (warning) : ≥3 nuits sur les 5 dernières où la moyenne 23h-6h > 180. Suggestion "split dose si repas riche le soir, ou ajustement Lantus avec diabéto".
  - **recurring-hypo** (alert — priorité absolue) : ≥3 hypos < 70 dans le même créneau de 2h sur 7j (compté en jours uniques, pas en points). Suggestion dynamique selon créneau : 19h-21h → "réduis bolus goûter 0,5U les jours sport", 0h-6h → "basal nocturne trop fort", 12h-14h → "ratio midi trop agressif".
  - **post-meal-spike** (warning) : ≥3 bolus du même `mealType` (sur 14j, hors split-doses) où la glycémie dépasse 220 dans les 3h post-injection. Compte par `mealType`, prend le top. Suggestion "pré-doser 15min avant ou +0,1U/10g".
  - **dawn-phenomenon** (info) : ≥3 jours sur 5 où la glycémie 5h-8h > 160 SANS injection nocturne 0h-5h ce jour-là (filtre les corrections de minuit qui auraient masqué le pattern). Suggestion "ajustement Lantus avec diabéto".
  - **cv-degradation** (info) : CV semaine courante > 36% ET semaine précédente ≤ 36%. Garde-fou : min 50 points par fenêtre. Suggestion "regarde si quelque chose a changé : repas, sport, stress, sommeil".
- **Architecture client-side** (par décision archi — Phase 12 pourrait archiver les injections en KV pour côté serveur) : la détection tourne dans un hook React, pas un cron. Les injections sont dans le store Zustand côté client. Le moteur s'exécute au mount + à chaque changement d'`insulinLogs`.
- **Hook `hooks/usePatternDetection.ts`** : fetch `/api/glucose/archive?days=14`, combine avec `insulinLogs` du store, appelle `detectPatterns()`. Cache localStorage avec TTL 6h (`apex-pattern-detection-v1`) — évite recalcul à chaque nav. Compare les ids détectés avec ceux du cache précédent (`notifiedIds`) → tire `serviceWorker.showNotification()` pour les **nouveaux** patterns uniquement (pas de re-tirage si déjà vu cette session).
- **Persistance dismissed** (`apex-pattern-dismissed-v1`) : Set d'ids ignorés via le bouton "Compris". Filtré côté UI (pas côté hook) pour permettre un reset facile (`resetDismissed()` exposé).
- **UI sur `/diabete`** : nouvelle section entre la courbe 8h et la correction suggérée. Si 0 pattern visible → rien (pas de section vide). Cards `surface-1` avec border colorée par sévérité (error/warning/border-default), icône lucide en haut-gauche (AlertTriangle / AlertCircle / Info), titre bold + timeWindow uppercase à droite, message en text-secondary, suggestion en italic lavender, bouton "Compris" (X icon) en bas à droite.
- **Push notification** : `sw.js` tag `pattern-${type}` avec `data.url = "/diabete"` — au tap, focus la page diabète. Le requireInteraction reste à false pour les patterns (différent des hypos).
- **Build TS** : passe. Testé dans preview avec faux patterns injectés : 3 niveaux de sévérité bien différenciés, dismiss fonctionne (persisté), localStorage cleanup propre.

### Phase 11 — Bloc 4 : Métriques cliniques avancées (mai 2026)
Enrichissement de la page `/diabete/historique` avec les 4 métriques cliniques de référence T1D : GMI, GRI, score quotidien, AGP.

- **GMI (Glucose Management Indicator)** ajouté à `GlucoseStatsSummary` dans `lib/glucose-archive/analytics.ts` ET dans la fonction `stats()` legacy de la page historique. Formule Bergenstal et al. 2018 : `GMI = 3.31 + 0.02392 × meanGlucose_mg_dL`. Interprétation : <6.5% excellent / 6.5-7% bon (cible T1D) / 7-8% à améliorer / >8% intervention.
- **GRI (Glycemia Risk Index)** Klonoff et al. 2022 : `GRI = 3.0×vLow + 2.4×low + 1.6×vHigh + 0.8×high` (capé 0-100, en pourcentages). Seuils sévères vLow=54 / vHigh=250 mg/dL. Interprétation par zone : A 0-20 / B 20-40 / C 40-60 / D 60-80 / E 80-100. Champs additionnels exposés : `vLowPct`, `vHighPct`.
- **StatTiles GMI + GRI** dans `/diabete/historique` : grid 2 colonnes ajoutée sous les 4 stats existantes (Moyenne / TIR / CV / Hypos). Couleur dynamique success/warning/error selon la zone GRI ou le seuil GMI 7%/8%. Hint texte explicite ("≈ HbA1c estimée", "Zone A · excellent").
- **`buildDailyScores(points)`** dans `analytics.ts` : group par jour calendaire local, calcule pour chaque jour le score composite `0.6×TIR + 0.2×(100−CV) + 0.2×hypoFreeBonus` (hypoFreeBonus = 100 si 0 hypo / 50 si 1 / 0 si 2+). Filtre les jours < 24 points (moins de 6h de data) → `score: null`. Retourne `DailyScore[]` trié chronologiquement.
- **`GlucoseCalendar.tsx`** : grille calendrier 30j (ou min(30, days)) en surface-1. 7 colonnes (lun-dim, alignée par weekday). Chaque case = un jour avec n° (1er du mois → label mois abrégé). Couleurs heatmap : vert ≥80, lime 60-80, orange 40-60, rouge <40, transparent si data insuffisante. Tap → tooltip surface-2 avec score + label (Excellent/Bon/Moyen/À améliorer) + grid 4 stats (Moyenne, TIR, CV, Hypos). Légende inline en bas.
- **`buildAgpProfile(points)`** dans `analytics.ts` : 48 buckets de 30min (00:00, 00:30, …). Pour chaque slot calcule `median`, `p10`, `p25`, `p75`, `p90` via fonction `quantile()` interpolée. Renvoie `AgpSlot[]`.
- **`AGPChart.tsx`** : ComposedChart Recharts avec 2 bandes Area (lavender 10% opacité pour P10-P90, 22% pour P25-P75) + 1 Line lime médiane. Bande de fond verte 70-180 (target), seuils 70 (rouge) et 180 (orange) en pointillés. XAxis ticks 00:00/04:00/08:00/12:00/16:00/20:00. Tooltip custom surface-2 avec médiane + percentiles. Garde-fou : "pas assez de données" si totalCount < 50.
- **Toggle Vue courbe / Vue AGP** dans `/diabete/historique` : state `chartView: 'line' | 'agp'`. Boutons icon+label dans le header de la section ; en mode AGP, la section line chart originale est remplacée par `<AGPChart>` (header simplifié au-dessus du chart). Préserve l'expérience existante : par défaut `line`.
- **Build TS** : passe. Vérifié dans preview avec mock fetch (2976 points sur 30j) : GMI 6,8%, GRI 10/100 Zone A, calendrier 30j heatmap colorée par score, toggle AGP affiche médiane lime + bandes lavender + tooltip 19:30 médiane 157.

### Phase 11 — Bloc 5 : Bilan IA v2 contextualisé (mai 2026)
Enrichissement du `POST /api/diabete/weekly-insight` avec 3 nouveaux signaux croisés et reformulation des suggestions en mode "diabéto perso".

- **Body API étendu** (rétrocompat — tous les nouveaux champs sont optionnels) :
  - `detectedPatterns?: ClientDetectedPattern[]` — patterns du moteur déterministe (Bloc 3) : type, severity, title, message, occurrences, timeWindow, suggestion. Capés à 6.
  - `workoutSessions?: WorkoutSummary[]` — séances muscu/running depuis `completedWorkouts` + `completedRunningSessions` du store. Filtrés à la fenêtre temporelle, triés desc, capés à 30. Schéma : `{ date, type, startTime?, durationMin }`.
  - `mealContext?: MealContextEntry[]` — `InsulinLog[]` filtrés à la fenêtre (hors split-doses) et mappés vers `{ mealType, mealTag?, mealSize?, carbsGrams, fatGrams?, proteinGrams?, injectedAt, glucoseBefore }`. Capés à 40.
- **Préparation côté client (`/diabete/historique`)** : `generateInsight()` lit `usePatternDetection` + workouts du store, calcule `fromMs` selon `days`, normalise les dates en ISO et envoie le tout au POST.
- **System prompt v2** : nouvelle introduction qui liste les 3 signaux enrichis et demande explicitement à Claude de les **CROISER** (confirmer/nuancer/infirmer les patterns détectés, corréler sport ↔ glycémie, distinguer ratio mal calibré vs digestion lente FPU).
- **Règle 8 — Insights croisés** :
  - Hypo récurrente le soir + muscu post-dîner + IOB cumulé du goûter → suggérer réduction goûter avec dates précises.
  - Pics nocturnes + mealTag complexe (pates/pizza/viande) sans split → c'est le FPU, pas le ratio.
  - Dawn ≥ 4j/7 + Lantus 19h30 → mentionner explicitement la corrélation horaire.
  - Post-meal-spike + macros non renseignées → demander de logger pour départager.
- **Règle 9 — Formulation diabéto perso (Bloc 5.2)** : suggestions formulées comme un endocrinologue donnant des consignes claires :
  - "Passe ton ratio midi de 1U/10g à 1,1U/10g pendant 3 jours et observe" (au lieu de "envisager d'ajuster").
  - Toujours : valeur actuelle → valeur suggérée → durée du test → quoi observer.
  - Toujours : "Si ça cause des hypos, reviens à ta dose précédente et parle à ton diabéto."
  - Citer les **repas spécifiques** ou **dates** qui justifient la suggestion.
- **Garde-fous existants conservés** (Phase 10c) : pas d'auto-apply, increments max ±10%, données insuffisantes → pas de suggestion concrète, hypos = priorité absolue, JSON strict en sortie.
- **Build TS** : passe. La route est rétrocompat : un client qui n'envoie pas les nouveaux champs reçoit le même bilan qu'avant (les signaux enrichis sont normalisés en arrays vides).

### Phase 11 — Bloc 6 : Sport-Glucose Correlation Engine (mai 2026)
Mesurer l'impact RÉEL du sport sur la glycémie d'Ethan, et personnaliser le pre-workout advisor avec ses propres données plutôt que des moyennes académiques.

- **Pure functions** (`lib/sport-glucose-analytics.ts`) :
  - `enrichSession(session, archivePoints)` calcule 5 checkpoints (T-30, T+0, T+30, T+60, T+120) en cherchant le point archive le plus proche de chaque offset (tolérance ±18min). Renvoie `EnrichedSportSession` avec `delta` (T+30 − T-30), `peak` et `trough`.
  - `summarizeSportImpact(sessions, type)` agrège les sessions enrichies par type (muscu/running) → `SportImpactSummary` avec `trackedCount`, `avgDelta`, `worstDelta` (pour muscu = max, running = min), `avgCurve` (5 points moyennés).
  - `computeAvgSportImpact(sessions, type, minSample=3)` exposé pour le pre-workout advisor — retourne null si `trackedCount < minSample` (force le fallback générique).
  - **Pas de persistance** : tout est calculé à la volée depuis l'archive Vercel KV (qui contient 90j de Libre 2). L'archive est la source de vérité — pas besoin d'un job de "rattrapage" ou de persister les checkpoints. Les nouvelles séances sont enrichies au prochain rendu.
- **Composant `SportGlucoseCorrelation.tsx`** : 2 onglets Muscu / Running (compteurs inline), 3 stats récap (Trackées / Delta moyen / Pire delta) avec tone dynamique (vert si attendu = +/− selon le type, orange si inattendu, rouge pour worstDelta), insight texte personnalisé ("ta glycémie monte de 56 mg/dL en moyenne pendant la muscu"), courbe LineChart Recharts T-30→T+120 avec ReferenceArea cible 70-180 + ReferenceLine T+0 dashed, recommandation lavender ("Avec une glycémie de départ de 130, tu risques d'être à 186 à T+30min en muscu, basé sur tes 5 dernières séances").
- **Intégration `/diabete/historique`** : nouvelle section après le calendrier, avant le pattern par heure. Mappe `completedWorkouts` + `completedRunningSessions` du store en `SportSession[]` (filtrés à la fenêtre courante) et passe les `archivePoints` du fetch existant. Aucun fetch supplémentaire — réutilise les données déjà chargées.
- **Pre-workout advisor enrichi (Bloc 6.3)** : `app/diabete/page.tsx` calcule `enrichedSportSessions` depuis le store + archive 30j. L'advisor appelle `computeAvgSportImpact()` ; si ≥ 3 séances trackées avec checkpoints valides, le message bascule en mode personnalisé : "D'après tes séances, ta glycémie va monter de +56 mg/dL en moyenne". Affiche aussi `~glycémie pendant` en plus de "à T+Xmin" + une mention discrète "basé sur tes séances trackées". Fallback gracieux (valeurs académiques +30-50 muscu / −40-80 running) si insuffisant.
- **Build TS** : passe. Vérifié dans preview avec mock 1300 points archive + 5 muscu + 3 running injectées : tab Muscu affiche +56 mg/dL delta moyen (pic à 186 prédit), tab Running passe en bleu sky avec courbe stable (delta +5), recommandations personnalisées affichées correctement.

### Phase 11 — Ajustement seuils split dose (mai 2026)
Retour terrain Ethan : pour une salade (8g lip + 12g prot, FPU 1.2), le système suggérait un split dose alors que la salade ne pose aucun problème de digestion lente. Le seuil initial `totalFPU >= 1` était trop bas et générait des faux positifs sur tous les repas modérés.

- **Nouveaux seuils** dans `lib/insulin-calculator.ts` (`useSplit`) — les 3 doivent être réunis :
  - `totalFPU >= 2.0` — vraie digestion longue, pas juste "un peu de matière grasse"
  - `carbsGrams >= 40` — un repas léger en carbs ne pose pas de problème d'absorption tardive même avec FPU élevé (cas salade + huile + protéines)
  - `fpuBolus >= 1.5` — si l'apport calculé est < 1,5U, le split donnerait < 2U arrondi → casser en deux apporte zéro valeur
- **Délais simplifiés** : `delayMinutes = totalFPU >= 3 ? 150 : 120` (le palier 90min n'est plus atteignable puisqu'on ne split plus en dessous de 2 FPU).
- **Cas validés en preview** :
  - Salade 30g/8/12 (FPU 1.2) → pas de split ✅
  - Sandwich 50g/12/15 (FPU 1.68) → pas de split ✅
  - Pâtes normal 60g/15/25 (FPU 2.35) → split 6U + 3U dans 2h ✅
  - Pâtes énorme (FPU 3.76) → split avec délai 2h30 ✅
- Le badge "Modéré" / "Complexe" reste affiché dès qu'on renseigne des macros (info utile sur la digestion), mais le split dose ne se déclenche plus que sur les vrais repas lourds.

### Phase 11 — Conseil de timing d'injection (mai 2026)
Ajout d'un hint contextualisé sous le breakdown bolus pour indiquer **quand** injecter (avant/pendant/après le repas) selon la glycémie actuelle et la trend.

- **Helper** `getInjectionTimingAdvice()` dans `lib/insulin-calculator.ts` — pure function qui retourne `{ tone, headline, rationale } | null` selon 5 cas :
  1. Glycémie < 90 OU trend ↓↓ → **"Injecte au moment du repas"** (info, bleu) — pas de pré-bolus, sinon hypo précoce
  2. Trend descendante simple (↘) → **"Injecte au moment du repas"** — laisse la glycémie se stabiliser
  3. Glycémie > 180 OU trend montante (↗ / ↑↑) → **"Injecte 20-30 min avant le repas"** (warning, orange) — pré-bolus plus long
  4. Snack avec < 20g glucides → **"Injecte au moment du goûter"** — absorption rapide, pas critique
  5. Cas standard (en plage, trend stable) → **"Injecte idéalement 15 min avant le repas"** (diabete, lavender) — pré-bolus T1D classique
- Renvoie `null` quand pas de repas (`carbsGrams === 0` OU `mealTime === 'other'`) ou en mode pré-workout (l'advisor sport prend le relais).
- **UI** : encadré coloré sous le hint digestive complexity, juste avant le bouton "Enregistrer l'injection". Headline en bold, rationale en text-[10px] opacity-80. Icône Clock à gauche.
- **Cas validés en preview** :
  - 60g + 120 mg/dL → "15 min avant" (lavender)
  - 60g + 75 mg/dL → "au moment du repas" (info)
  - 60g + 210 mg/dL → "20-30 min avant" (warning)

### Phase 11 — Briefing pré-sport indépendant (mai 2026)
Nouvelle section **"Briefing pré-sport"** sur `/diabete` qui sert d'advisor "filet de sécurité" entre deux moments d'injection — indépendant du calculateur de bolus. Cas typique : Ethan a déjà fait son bolus dîner avec split dose en attente, et il décide d'aller faire du running 30min plus tard. Le briefing détecte le risque et propose des actions concrètes.

- **Helper** `computePreSportBriefing()` dans `lib/insulin-calculator.ts` — pure function qui prend en input :
  - `currentGlucose` + `trendArrow` (depuis live ou manuel)
  - `iobUnits` (insulin on board calculé)
  - `isfMgPerU` + `insulinActiveMinutes` (config T1D)
  - `workoutType` + `minutesUntilWorkout` (planifié)
  - `pendingSplitUnits` + `pendingSplitMinutesUntil` (split dose en attente)
  - `personalSportImpact` (impact perso depuis Bloc 6, fallback académique)
  
  Retourne `{ estimatedAtWorkoutStart, estimatedDuringWorkout, risk, recommendations[] }`.

- **5 types de recommandations** :
  - `eat-carbs` → "Mange Xg de glucides rapides avant le sport" (calcul `carbsNeeded = ceil((target − estimated) / 4)`)
  - `reduce-split` → "Réduis ta 2e dose à Xu au lieu de Yu" (suggéré quand split tombe avant un running ou quand estimé < 100)
  - `delay-split` → "Ou décale ta 2e dose à après le sport" (alternative)
  - `delay-workout` → "Glycémie trop haute, attends 30min" (si > 250 + muscu)
  - `check-glucose` → "Vérifie tes cétones avant de courir" (si > 250 + running)
  - `safe` → "Tu peux y aller, rien à ajuster" (fallback OK)

- **UI dans `/diabete`** : nouvelle section entre "Rappels split dose" et le calculateur de bolus, avec :
  - Toggle on/off (par défaut off — pas de bruit visuel)
  - Sélecteur **Muscu / Running** (chips lime/sky)
  - **Slider** "Dans combien de min" (5 → 180min, step 5)
  - Encadré coloré (red=risk / orange=caution / green=safe) avec **glycémie estimée** au début ET pendant le sport
  - Liste des recommandations avec icônes lucide-react contextuelles (Apple, Minus, Clock, AlertTriangle, AlertCircle, CheckCircle2)
  - **Boutons d'action inline** : "Réduire à XU →" et "Décaler de 1h30 →" qui modifient directement le `splitDoseReminder` en attente via `updateSplitDoseReminder()`

- **Auto-détection du split en attente** : le briefing prend automatiquement le split `pending` le plus proche dans le temps. Pas besoin de le sélectionner manuellement.

- **Cas validés en preview** :
  - Glyc 65 + muscu 30min (pas IOB, pas split) → 1 reco "Mange 17g de glucides rapides" (rouge)
  - Glyc normale + IOB 5.7U + split 4U/15min + running 30min → 3 recos : 51g glucides + Réduire à 2U + Décaler de 1h30, glycémie estimée -53 au début (donc grosse hypo prédite), boutons d'action fonctionnels.

### Phase 11 — Calibrage briefing pré-sport (mai 2026)
Retour terrain Ethan : pour une fenêtre de 180min, le système recommandait "Mange 191g de glucides rapides" avec une glycémie estimée à -633 mg/dL. La formule pure `IOB × ISF × fraction(temps)` est mathématiquement correcte mais ignore les facteurs compensateurs (digestion en cours, contre-régulation hormonale, glucides résiduels du repas) → prédictions absurdes pour les fenêtres longues.

- **Plafonnement physiologique** : `PRACTICAL_DROP_CAP = 0.5` — la fraction de drop appliquée est plafonnée à 50% du potentiel total `IOB × ISF`. Reflète mieux la réalité observée chez les T1D bien régulés (en pratique l'IOB chute moins que le théorique car d'autres facteurs compensent).
- **Floor à 40 mg/dL** : `estimatedAtWorkoutStart = max(40, raw)` — en dessous c'est juste pas réaliste, l'utilisateur aurait corrigé bien avant.
- **Cap glucides à 60g** : la recommandation `eat-carbs` ne propose plus de chiffres absurdes.
- **Fenêtre > 120min** → bascule sur une recommandation honnête : *"Re-vérifie ta glycémie 30 min avant le sport"*. À cette distance, les facteurs compensateurs dominent et la prédiction perd toute valeur. Plutôt qu'un chiffre faussement précis, on demande à l'utilisateur de revenir à 30-60min du sport pour une prédiction fiable.
- **Cas validés** :
  - 5 min → "Mange 19g" (réaliste)
  - 30 min → 3 recos cohérentes (23g glucides + Réduire à 3U + Décaler)
  - 90 min → mêmes recos
  - 180 min → "Re-vérifie ta glycémie 30 min avant" (plus de chiffre absurde)

### Phase 11 — Trend Libre intégrée + transparence UI briefing (mai 2026)
Retour terrain : "il faut que le briefing prenne ma glycémie actuelle, qu'il voie la flèche montée/descente/stable, qu'il calcule en fonction". L'IOB et la glycémie de base étaient déjà passés au helper, mais la **trend Libre** ne servait qu'à déclencher des conditions annexes — elle n'impactait pas la prédiction de glycémie. Ajout de l'effet trend dans le calcul + transparence UI complète sur les inputs utilisés.

- **Effet trend dans `computePreSportBriefing`** : `dropFromTrend = -trendVelocity × min(30, minutesUntilWorkout)`. Vitesses Abbott conservatives (mg/dL/min) :
  - ↓↓ (1) : -1.5 — chute rapide
  - ↘ (2) : -0.7 — descente
  - → (3) : 0
  - ↗ (4) : +0.7 — montée
  - ↑↑ (5) : +1.5 — montée rapide
  - Cap à 30min pour éviter le double-comptage avec l'IOB sur les fenêtres longues (la trend reflète déjà l'effet IOB en cours).
- **`breakdown` exposé en sortie** : `{ glucoseInput, trendArrowUsed, dropFromIob, dropFromSplit, dropFromTrend, sportImpact }` — permet à l'UI d'afficher la décomposition exacte du calcul.
- **Section "Données utilisées" dans l'UI** : surface-2 entre le slider et le bloc résultats, affiche :
  - **Glycémie** live avec flèche trend + âge ("100 ↘ (0min)")
  - **IOB** actuel
  - **Split en attente** si présent (units + minutes)
  - Bouton **"Rafraîchir"** (Activity icon) qui force un re-fetch manuel
- **Auto-refresh à l'activation** : `useEffect` qui appelle `refetchGlucose()` dès que `briefingActive === true` → garantit une lecture fraîche, pas un cache obsolète.
- **Décomposition inline du calcul** : sous "Glycémie estimée" du bloc résultats, ligne grise type `100 (actuel) -21 (trend)` qui montre exactement comment on est arrivé au chiffre. Pédagogie + confiance.
- **Cas validés** :
  - Glyc 100 ↘ + IOB 0 + muscu 30min → breakdown "100 (actuel) -21 (trend)" → estimated 79 → "Mange 15g"
  - Glyc 67 → + IOB 0 → breakdown "67 (actuel)" → estimated 67 → "Mange 16g"
- **Hook `useGlucose` étendu** : utilisation de `refetch` et `lastFetchedAt` pour driver le bouton refresh (avec animation Activity spin pendant la requête).

### Phase 11 — Calibrage final split dose (mai 2026, basé sur recherche scientifique)
Retour terrain Ethan : "20g lipides + 20g protéines (crêpes Nutella + pain de mie complet) → le système suggère un split dose de 4U dans 1h30, mais en pratique je n'en ai pas besoin." Recherche menée sur les guidelines NHS Cambridge / Whittington / ADA / Pankowska Warsaw method.

**Findings scientifiques** :
- 1 FPU = 100 kcal (fat × 9 + prot × 4) = équivalent à 10g glucides
- **Seuil "high-fat" = > 30g lipides** (NHS Cambridge, Whittington, Calgary)
- **Seuil "high-protein" = > 40g protéines** (idem)
- Un repas peut avoir FPU élevé sans atteindre ces seuils → pas split-worthy
- **Index glycémique compte** : glucides rapides + lipides → digestion principale rapide même avec FPU élevé (ADA Diabetes Care 2015)
- **MDI (stylos) ≠ pompe** : étude récente trouve "no benefit and mild hypoglycemia common" pour le split MDI → seuils plus stricts + 50/50 préféré au 100% différé

**Calibrage final** (`lib/insulin-calculator.ts` + `lib/meal-tags.ts`) :

1. **Seuils cumulatifs durcis** (les 5 doivent être réunis) :
   - `totalFPU >= 2.5` (au lieu de 2.0)
   - `fat >= 30 OU prot >= 40` (NOUVEAU — seuils absolus NHS/ADA)
   - `carbsGrams >= 50` (au lieu de 40)
   - `fpuBolus >= 1.5` (inchangé)
   - `glycemicProfile !== 'fast'` (NOUVEAU — voir 2)

2. **Profil glycémique par tag** (nouveau champ `glycemicProfile: 'fast' | 'medium' | 'slow'` sur `MealTag`) :
   - **slow** : pates, riz, pizza, plat-viande
   - **medium** : sandwich, autre
   - **fast** : salade, snack-sucre, petit-dej (tag pour crêpes/pain blanc/céréales)
   - Helper exporté `getGlycemicProfile(tagId)`

3. **Délais Pankowska adaptés MDI** :
   - FPU 2.5-3 → **90 min**
   - FPU 3-4 → **120 min**
   - FPU > 4 → **150 min**

4. **Split 50/50** (nouveau) : quand split actif, 50% du fpuBolus est intégré au bolus initial, 50% en 2e injection. Cf NHS MDI "split 50/50 préféré au 100% différé" pour limiter le risque d'hypo précoce. Sans split → 100% du fpuBolus dans bolus initial (ou rien si FPU minime).

5. **Reasoning pédagogique** : si fastCarbs + FPU + carbs rempliraient les autres seuils mais glucides rapides → message explicite "Pas de split dose : tu manges des glucides rapides (X FPU mais digestion principale rapide). Le bolus initial couvre tout."

**Cas validés** :
| Repas | FPU | Avant | Après |
|---|---|---|---|
| Crêpes Nutella + pain de mie 60g/20/20 (cas Ethan) | 2.6 | Split 4U dans 1h30 | Pas de split (glucides rapides) ✅ |
| Salade 30g/8/12 | 1.2 | Pas de split | Pas de split ✅ |
| Sandwich 50g/12/15 | 1.7 | Pas de split | Pas de split ✅ |
| Pâtes normal 60g/15/25 | 2.4 | Split | Pas de split (15g lip < 30, 25g prot < 40) — bolus intègre FPU |
| Pâtes énorme 100g/35/50 | 5.2 | Split | Split 3U dans 2h30 ✅ |
| Pizza 80g/30/25 | 3.7 | Split | Split 2U dans 2h ✅ |
| Viande+accomp. 60g/25/45 | 4.1 | Split | Split 3U dans 2h30 ✅ |
| Petit-déj XL 100g/30/35 | 4.1 | Split | Pas de split (glucides rapides) ✅ |

### Phase 11 — Correction split 50/50 → 100% différé (mai 2026, retour terrain)
Retour terrain Ethan : "Pâtes énormes 100g de glucides + 24g lip + 40g prot → l'app donne 12U + 2U dans 2h → j'ai 5 hypos récurrentes à 12h-14h. J'aurais dû faire 10U + 4U environ."

**Diagnostic** : le split 50/50 implémenté précédemment (basé sur une mauvaise interprétation de NHS Cambridge) chargeait 50% du FPU dans le bolus initial. Pour 100g/24/40, ça donnait 10U glucides + 1.88U FPU = ~12U d'un coup → pic insuline excessif → hypo systématique 1-2h après le repas. Le 2U différé ne compensait pas l'hypo précoce déjà déclenchée.

**Vraie lecture de la littérature** : NHS Cambridge dit "50% of the new dose (carbs + increase) au repas, 50% 1-1.5h après" — c'est un protocole d'étalement TOTAL pour pompes. Pour MDI (stylos), le modèle Pankowska classique (100% glucides au repas + 100% FPU différé en 2e injection ponctuelle) est mieux adapté : pas de pic insuline excessif, couverture séquentielle.

**Fix** (`lib/insulin-calculator.ts`) :
```typescript
// AVANT (50/50, causait hypos précoces)
const fpuBolusNow = useSplit ? fpuBolus / 2 : fpuBolus;
const fpuBolusLater = useSplit ? fpuBolus / 2 : 0;

// APRÈS (100% différé, Pankowska classique)
const fpuBolusNow = useSplit ? 0 : fpuBolus;
const fpuBolusLater = useSplit ? fpuBolus : 0;
```

**Reasoning mis à jour** : "Split classique : 10U maintenant (juste les glucides), puis 4U dans 2h pour couvrir les graisses/protéines."

**Cas validés** :
| Repas | FPU | Bug 50/50 | Fix 100% différé |
|---|---|---|---|
| 🍝 Pâtes Énorme 100g/24/40 (cas Ethan) | 3.76 | 12U + 2U → hypo | **10U + 4U dans 2h** ✅ |
| 🍕 Pizza 80g/30/25 | 3.7 | 10U + 2U | **8U + 4U dans 2h** ✅ |
| 🥩 Viande 60g/25/45 | 4.1 | 8U + 3U | **6U + 5U dans 2h30** ✅ |

Le total insuline reste le même (carbBolus + fpuBolus) mais réparti différemment : pas de surcharge initiale, donc pas d'hypo précoce. Le FPU couvre uniquement la digestion lente, comme prévu par Pankowska.

### Phase 11 — Macros : auto-calibration perso + hint Yazio + badge confiance (mai 2026)
Discussion produit Ethan : "Quelle est la meilleure façon de procéder ? Je clique sur petit/normal/énorme, ou je remplis vraiment précisément les lipides/protéines ?" → réponse : presets OK pour repas légers, mais **macros précises essentielles pour les repas split-worthy** (pâtes, pizza, viande+accomp.). 3 améliorations UI pour guider ce choix :

- **Auto-calibration personnelle** (`getAvgMacrosForTag` dans `lib/meal-analytics.ts`) : calcule la moyenne des macros (fat/prot) saisies réellement dans les 5 derniers `InsulinLog` pour un tag donné. Filtre les split doses pour éviter les doublons. Renvoie `{ count, avgFat, avgProtein }`.
- **Carte historique macros perso** (dans `/diabete`, sous la grille des tags) : visible uniquement si `count ≥ 3` ET écart vs preset ≥ 5g sur fat ou prot (sinon pas pertinent). Affiche "Tes 5 derniers 'Pâtes' : ~22g lip + 28g prot (preset 15/25)" + bouton **"Utiliser ma moyenne →"** qui remplit fat/prot avec les valeurs perso et flag `macrosManuallyEdited = true` (donc plus de re-override par preset).
- **Hint Yazio sync** : si l'utilisateur sélectionne un tag avec `glycemicProfile === 'slow'` (pâtes/riz/pizza/viande+accomp.) ET n'a pas encore édité les macros manuellement → encadré warning "Repas riche : pour une dose précise, copie tes vraies macros depuis Yazio plutôt que le preset" + bouton **"Ouvrir lipides & protéines →"** qui déplie le block macros.
- **Badge de confiance** dans le résultat hero du calculateur, à côté du label "Dose à injecter" :
  - 🟢 **Macros précises** (success, ShieldCheck) : `macrosManuallyEdited === true` OU macros saisies sans tag
  - 🟡 **Preset** (warning, Shield) : tag sélectionné, valeurs preset utilisées → tooltip "Override avec tes vrais chiffres Yazio pour fiabilité maximale"
  - ⚫ **Sans macros** (text-tertiary, ShieldAlert) : aucune macro renseignée → tooltip "OK pour repas léger / correction"
- État `macrosConfidence: 'precise' | 'preset' | 'none'` calculé via `useMemo` à partir de `fatGrams`, `proteinGrams`, `macrosManuallyEdited`, `mealTag`.
- **Workflow optimal documenté** (réponse Ethan) : Pâtes/Pizza/Viande+accomp. → toujours macros précises depuis Yazio. Salade/Snack/Petit-déj → presets OK (split dose ne se déclenche pas de toute façon). Repas standard répété → ajuster manuellement à partir du preset.

### Phase 11 — FPU jamais intégré au bolus initial (mai 2026, fix critique)
Retour terrain Ethan #2 : "74g glucides + 23g lip + 29g prot → l'app dit 11U au lieu de 7-8U attendus. Je sais pertinemment que ça va me faire faire une hypo."

**Diagnostic** : la logique précédente intégrait `fpuBolus` (100% du FPU théorique) dans le bolus initial pour tous les repas non split-worthy. Pour le cas Ethan :
- Bolus glucides = 7.4U
- FPU = (23×9 + 29×4) / 100 = 3.23 FPU → fpuBolus = 3.23U
- Pas de split (fat 23 < 30 ET prot 29 < 40 → seuils NHS non atteints)
- Mais fpuBolus intégré au bolus initial → **7.4 + 3.23 = 10.6U → 11U** → **hypo systématique**

**Logique correcte** (NHS conservative MDI) :
- **useSplit = TRUE** → bolus initial = glucides+correction uniquement (pas de FPU), FPU 100% différé en 2e injection
- **useSplit = FALSE** → bolus initial = glucides+correction uniquement, **PAS de FPU du tout** (le bolus glucides seul suffit pour les repas non split-worthy)

**Fix** (`lib/insulin-calculator.ts`) :
```typescript
// AVANT (FPU intégré si pas split → hypo)
const fpuBolusNow = useSplit ? 0 : fpuBolus;

// APRÈS (FPU jamais dans bolus initial)
const fpuBolusNow = 0;
const fpuBolusLater = useSplit ? fpuBolus : 0;
```

**Reasoning enrichi** : 3 cas explicites désormais documentés pour transparence :
- **Glucides rapides + FPU élevé** : "Pas de split dose : tu manges des glucides rapides. Le bolus initial couvre les glucides."
- **FPU notable (1.5-2.5)** : "FPU notable mais en dessous des seuils high-fat/high-protein. Surveille la glycémie à T+3h."
- **FPU élevé (≥2.5) mais en dessous des seuils absolus** (cas Ethan 74/23/29) : "FPU élevé (3,2) mais ni high-fat (23g < 30g) ni high-protein (29g < 40g). Le bolus couvre les glucides — surveille la glycémie à T+3h."

**Cas validés** :
| Repas | FPU | Avant | Après |
|---|---|---|---|
| 🍽️ **74g + 23 lip + 29 prot (cas Ethan)** | 3.23 | 11U → hypo | **8U** ✅ + message FPU élevé |
| 🥞 Crêpes Nutella 60g/20/20 | 2.6 | 9U | **6U** ✅ |
| 🍝 Pâtes Énorme 100g/24/40 (split) | 3.76 | 10U + 4U | **10U + 4U dans 2h** ✅ (inchangé) |
| 🍕 Pizza 80g/30/25 (split) | 3.7 | 8U + 4U | **8U + 4U dans 2h** ✅ (inchangé) |

Le bolus initial ne contient désormais que **glucides + correction + trend**. Le FPU n'apparaît que via la **2e injection différée** (split dose) ou simplement comme **information de surveillance** (reasoning) pour les repas border-line.

### Phase 11 — Calibrage scientifique FPU avec 3 garde-fous (mai 2026, retour terrain critique)
Retour terrain Ethan : "152g glucides + 82g lipides + 94g protéines → l'app me demande 12U dans 2h30 alors que j'étais à 160 mg/dL sans rien faire, j'aurais fait une hypo sévère. 7-8U max."

**Diagnostic scientifique** : le facteur "1 FPU = 10g glucides équivalents" est l'**extrapolation théorique maximale de Pankowska 2009**, mais en pratique MDI les études cliniques ultérieures (Bell et al. 2015, NHS Cambridge, Smart et al. 2018) montrent que :
- Seulement ~50% des protéines deviennent du glucose (gluconéogenèse partielle)
- Les lipides ralentissent l'absorption mais ne créent pas du glucose proportionnellement
- Le risque d'hypo sévère en MDI justifie un facteur empirique plus conservatif
- Aucun protocole sérieux ne recommande une 2e dose >40% du bolus initial sans titration progressive

**3 garde-fous cumulatifs** (`lib/insulin-calculator.ts`, constantes en haut du fichier) :

| Garde-fou | Constante | Valeur | Effet |
|---|---|---|---|
| Facteur conversion FPU | `FPU_CARB_EQUIVALENT_FACTOR` | **6** (au lieu de 10) | 1 FPU ≈ 6g glucides équivalents (empirique MDI) |
| Cap relatif | `LATER_DOSE_RELATIVE_CAP` | **0.4** | Max 40% du bolus glucides initial |
| Cap absolu | `LATER_DOSE_ABSOLUTE_CAP` | **8** | Plafond absolu MDI 8U max en 2e injection |

**Formule** :
```typescript
const theoretical = Math.ceil(fpuBolusLater);
const relativeMax = Math.floor(carbBolus * 0.4);
const laterUnits = Math.min(theoretical, relativeMax, 8);
```

**Reasoning enrichi** : quand un cap est appliqué, message explicite "Sécurité MDI : XU théoriques plafonnés à YU (max 40% du bolus initial ou 8U absolus) pour éviter une hypo précoce."

**Cas validés en preview** :

| Repas | Avant (10× factor, no cap) | Après (6× factor + caps) | Validation |
|---|---|---|---|
| 🔥 **Ton midi 152/82/94 (Pâtes)** | 16U + **12U** → hypo sévère ❌ | 16U + **6U dans 2h30** | ✅ cohérent avec ton intuition (7-8U max) et glycémie observée 160 mg/dL sans rien faire |
| Pâtes énorme 100/24/40 | 10U + 4U | 10U + **3U dans 2h** | ✅ (FPU théorique 2.6U → ceil 3U, pas de cap déclenché) |
| Pizza 80/30/25 | 8U + 4U | 8U + **3U dans 2h** | ✅ |
| Viande 60/25/45 | 6U + 5U | 6U + **2U dans 2h30** | ✅ avec cap "3U → 2U" (40% × 6U = 2.4 → floor 2) |

Le cas Ethan midi est passé de **28U total** (16+12, hypo garantie) à **22U total** (16+6) avec un mécanisme transparent qui explique pourquoi le cap a été appliqué.

**Sources scientifiques** :
- [Pankowska Method (original 2009)](https://pubmed.ncbi.nlm.nih.gov/19614757/)
- [Bell et al. 2015, Diabetes Care — Optimized Mealtime Insulin Dosing for Fat and Protein](https://diabetesjournals.org/care/article/38/6/1008/37384)
- [NHS Cambridge MDI guidance — start at 20% add-on, titrate up](https://www.cuh.nhs.uk/patient-information/managing-high-fat-and-high-protein-meals-with-multiple-daily-insulin-injections-mdi/)
- [Smart et al. 2018 — Insulin dosing for fat and protein: is it time?](https://diabetesjournals.org/care/article/41/9/1818/36458)

### Phase F — Sensibilité insuline post-exercice + intégration Whoop (mai 2026)
Retour terrain Ethan : "Quand je cours à 18h et que je mange à 19h avec ma dose normale, je fais quasi systématiquement une hypo. L'app doit baisser le bolus après le sport."

Effet "insulin sensitivity ↑" post-exercice (Riddell & Zaharieva 2017, UCLA, Frontiers Endocrinology 2022) :
- Aérobie (running) → sensibilité augmentée pendant 12-24h
- Réduction du bolus recommandée : -25% à -75% selon intensité
- Pic à 1-2h post-séance, dégradation linéaire

**F1 — Détection séance + ajustement bolus (sans Whoop, fonctionne tout de suite)**

- **`lib/exercise-insulin-adjustment.ts`** : pure functions
  - `estimateStrain(source, durationMin, glucoseDelta?)` : estimation 0-21 depuis durée + type + delta glycémique pendant la séance (chute glycémie = effort intense)
  - `findMostRecentExercise(workouts, runningSessions, whoopStrainBySessionId?)` : trouve la séance la plus récente dans les 24h
  - `computeExerciseAdjustment(exercise, nowMs)` : applique le mapping strain → réduction + décroissance temporelle
- **Mapping strain → réduction max** (5 brackets, scientifiquement calibrés) :

| Strain | Type effort | Réduction max | Window |
|---|---|---|---|
| <6 | Récup | 0% | — |
| 6-9 | Cardio léger | 15% | 6h |
| 10-13 | Cardio modéré (45-60min) | 25% | 12h |
| 14-17 | Tempo/intervals/longue | 40% | 18h |
| 18+ | Très intense | 50% | 24h |

- **Décroissance dans la fenêtre** : 100% (0-2h) → 75% (2-6h) → 50% (6-12h) → 25% (12-24h) → 0% (>window)
- **Intégration `calculateBolus`** : nouveau paramètre `exerciseAdjustmentPct`. Applique sur `carbBolus + correctionBolus` (PAS sur fpuBolus différé qui reste critique pour FPU). Reasoning explicite "Sensibilité insuline ↑ : tu as fait du sport récemment → réduction de X% sur le bolus".
- **UI encadré "Sensibilité ↑"** dans `/diabete` (au-dessus des inputs du calculateur) : tone success, icône Footprints, info "Running il y a 1h20 · strain estimé 14/21 · fenêtre 18h (75% de l'effet actif)". Badge "Whoop" si données Whoop, sinon mention "estimé".

**F2 — Intégration Whoop OAuth (strain réel)**

- **Module serveur `lib/whoop/`** :
  - `store.ts` (server-only) : tokens dans Vercel KV (`whoop:tokens`), snapshot caché 5min (`whoop:snapshot`)
  - `client.ts` (server-only) : `buildAuthUrl`, `exchangeCodeForTokens`, `refreshAccessToken`, `getValidAccessToken` (auto-refresh), fetchers typés pour `/v2/cycle`, `/v2/recovery`, `/v2/activity/sleep`, `/v2/activity/workout`
  - Scopes : `read:profile read:cycles read:recovery read:sleep read:workout offline`
- **API routes Next.js** :
  - `GET /api/whoop/auth` → redirige vers OAuth Whoop avec cookie `state` httpOnly anti-CSRF
  - `GET /api/whoop/callback` → exchange code/state, save tokens KV, redirige `/diabete/parametres?whoop=connected|error`
  - `GET /api/whoop/sync` → fetch parallèle cycle/recovery/sleep/workout, snapshot caché 5min
  - `POST /api/whoop/disconnect` → cleanup tokens KV
  - `GET /api/whoop/status` → état (configured/connected/connectedAt/scope)
- **Component `WhoopConnection.tsx`** dans `/diabete/parametres` :
  - Wrappé `<Suspense>` car utilise `useSearchParams` (requis Next.js 16 strict)
  - États : not_configured (instructions setup app Whoop) / kv_not_configured / not_connected (bouton Connecter) / connected (info + bouton Déconnecter)
  - Toast après callback OAuth (connected ✅ / error)
- **Hook `useWhoop`** : appelle `/api/whoop/sync` auto-refresh 5min + visibilitychange. Expose `{ connected, snapshot: { cycleStrain, recoveryScore, hrvMs, rhrBpm, sleepDurationMin, sleepPerformance, lastWorkout }, loading, error, refetch }`.
- **Intégration `/diabete`** : si `whoop.connected && lastWorkout < 24h` → priorité au strain Whoop réel (`strainSource: 'whoop'`). Sinon → fallback estimation depuis nos données. Badge "Whoop" affiché dans l'encadré quand strain Whoop utilisé.

### 🔧 Setup Whoop pour Ethan (à faire 1 fois)

Pour activer F2 en prod :
1. **Créer une app sur [developer.whoop.com](https://developer.whoop.com)** (compte gratuit)
   - Redirect URI : `https://apex-coach-dusky.vercel.app/api/whoop/callback`
   - Scopes : `read:profile read:cycles read:recovery read:sleep read:workout offline`
2. **Récupérer Client ID + Client Secret** dans le dashboard
3. **Ajouter sur Vercel** (env vars, non-Sensitive pour pouvoir les copier) :
   - `WHOOP_CLIENT_ID` = ton client id
   - `WHOOP_CLIENT_SECRET` = ton client secret
   - `WHOOP_REDIRECT_URI` = `https://apex-coach-dusky.vercel.app/api/whoop/callback` (optionnel, auto-déduit en prod)
4. **Re-deploy** (`npx vercel deploy --prod --yes`)
5. **Aller sur `/diabete/parametres`** → bouton "Connecter Whoop" → OAuth flow → c'est branché

Tant que les env vars ne sont pas configurées, la section Whoop affiche un message d'instructions claires. F1 (détection sans Whoop) fonctionne en parallèle.

**Sources scientifiques** :
- [Riddell & Zaharieva 2017 — Insulin Management Strategies for Exercise in Diabetes](https://mriddell.lab.yorku.ca/files/2017/09/Zaharieva-Riddell-Insulin-management-strategies.pdf)
- [Frontiers in Endocrinology 2022 — Exercise timing implications T1D](https://www.frontiersin.org/journals/endocrinology/articles/10.3389/fendo.2022.1021800/full)
- [UCLA Health — T1D Exercise Guidelines](https://www.uclahealth.org/medical-services/endocrinology/diabetes/type-1-diabetes/exercise-guidelines)
- [Whoop Developer API](https://developer.whoop.com/api/)

### Phase F2 UI — Exposer les données Whoop dans l'app (mai 2026)
Après l'infra OAuth, expose les données Whoop visibles dans 3 endroits :

- **Composant `WhoopCard.tsx`** réutilisable avec 2 variants :
  - **`compact`** (3 stats clés : Recovery / Strain / Sommeil) — pour Dashboard et page Running. Silencieux si non connecté.
  - **`full`** (jauges + HRV/RHR + sommeil détaillé + dernier workout). Affiche CTA "Connecter Whoop" si non connecté.
- **Couleurs Whoop officielles** :
  - Recovery : 67-100 vert / 34-66 jaune / 0-33 rouge
  - Strain : 0-9 bleu (léger) / 10-13 vert (modéré) / 14-17 jaune (dur) / 18-21 rouge (très dur)
- **Intégration Dashboard `/`** : `<WhoopCard variant="compact" />` après hero + action du jour, avant glucose trend. Lien "Vue détaillée →" vers `/whoop`.
- **Intégration `/running`** : compact card en haut de page (après CTA séance GPS) pour voir Recovery avant de décider d'aller s'entraîner.
- **Nouvelle page `/whoop`** : vue détaillée plein écran avec :
  - Header retour Dashboard + lien Paramètres Whoop
  - 2 jauges (Recovery 100% / Strain /21) avec barres de progression colorées + label zone
  - HRV (ms) + RHR (bpm) mini-stats
  - Section Sommeil : durée totale + performance %
  - Dernière séance Whoop : strain + heures début/fin + sport
  - Bouton refresh manuel (icône RefreshCw + spin loader)
  - Timestamp "MAJ il y a Xmin" pour transparence sur la fraîcheur des données
- **Helpers de formatage** : `formatSleepDuration(min)` → "7h12", `timeAgo(iso)` → "il y a 1h30", `recoveryColor()` + `strainColor()` retournent `{ color, bg, label }` pour cohérence.

L'app expose donc maintenant **toutes les données Whoop** récupérées par F2 :
- Recovery, Strain, HRV, RHR, Sleep duration, Sleep performance, Last workout (avec sport, strain, durée).
- Utilisées **2 fois** : pour calculer la réduction insuline post-exercice (logique métier) ET pour informer l'utilisateur (UI).

### Phase F2 fix critique — Différenciation muscu vs cardio (juin 2026)
Retour terrain Ethan : "Hier muscu courte, l'app m'a réduit le bolus de 15% et j'ai été en hyper. La muscu n'a pas le même effet que le running sur la glycémie."

**Validation scientifique** (Yardley et al., Diabetes Care 2013) :
- Sensibilité insuline mesurée par clamp euglycémique : **inchangée à 12h ET 36h après résistance**
- Vs marquée augmentée après cardio aérobie
- Catécholamines (adrénaline) + glycogénolyse hépatique pendant la muscu → glycémie souvent stable voire en hausse
- "Resistance exercise is associated with a lower risk of hypoglycemia"

**Fix** (`lib/exercise-insulin-adjustment.ts`) :

1. **Nouveau type `ExerciseSource`** étendu : `"running" | "muscu" | "cardio-other"` (vélo, swim, etc. = cardio-other)

2. **Helper `classifySport(sportName)`** : mapping intelligent depuis le `sport_name` Whoop
   - "Running", "Trail Running", "Jogging" → `running`
   - "Weightlifting", "Strength", "Powerlifting", "CrossFit", "Functional Fitness", "Hyrox" → `muscu`
   - "Cycling", "Swimming", "Rowing", "Elliptical", "HIIT", "Cardio" → `cardio-other`
   - "Yoga", "Pilates", "Stretching" → `muscu` (effet glycémique minimal)
   - Fallback : `cardio-other` (plus prudent anti-hypo)

3. **Helper `getSportFactor(source, durationMin, strain)`** — multiplicateur appliqué au calcul de réduction :
   - **`running` / `cardio-other`** : 1.0 (effet plein, mapping strain → réduction direct)
   - **`muscu` < 45min** : **0.1** (quasi nul, anti-hypo négligeable)
   - **`muscu` 45-75min standard** : **0.25** (effet limité)
   - **`muscu` > 75min OU strain ≥ 16** : **0.5** (effet modéré, séances type CrossFit/HIIT muscu où il y a composante cardio)

4. **`ExerciseAdjustment` étendu** : expose désormais `source`, `durationMin`, `sportFactor` pour transparence UI

5. **Formule finale** : `reductionPct = bracket.maxReductionPct × decay × sportFactor`

**UI enrichie** (`/diabete`) :
- Encadré tone **warning** (orange) au lieu de **success** (vert) si `source === "muscu"` → l'utilisateur voit visuellement que c'est un cas différent
- Icône `Dumbbell` pour muscu, `Footprints` pour running/cardio
- Mention durée : "Muscu (45min) il y a 1,2h · strain 12/21 [Whoop]"
- Note explicative italique : "Muscu = effet glycémique moindre que cardio (Yardley 2013). Réduction limitée à X% de l'effet cardio."

**Cas validés** :

| Scénario | Avant (sans factor) | Après (avec factor) |
|---|---|---|
| Running 45min strain 12 à 1h | -25% | -25% ✅ (inchangé) |
| **Muscu 45min strain 12 à 1h** | -25% ❌ → hyper Ethan | **-6%** ✅ |
| Muscu 30min strain 9 à 30min | -15% ❌ | **-2%** (quasi 0) ✅ |
| Muscu 90min strain 17 à 1h | -40% | -20% ✅ (effet modéré) |
| Vélo 60min strain 12 à 2h | -25% | -25% ✅ (cardio-other = running) |
| Yoga 60min strain 8 | -15% | -1% ✅ (muscu < 45min effectif) |

**Sources scientifiques** :
- [Yardley et al. Diabetes Care 2013 — Resistance Versus Aerobic Exercise: Acute effects on glycemia in type 1 diabetes](https://diabetesjournals.org/care/article/36/3/537/38023/Resistance-Versus-Aerobic-ExerciseAcute-effects-on)
- [Yardley et al. Diabetes Care 2012 — Performing Resistance Exercise Before Versus After Aerobic Exercise on Glycemia](https://pmc.ncbi.nlm.nih.gov/articles/PMC3308306/)
- [Resistance Exercise in Type 1 Diabetes (Canadian Journal of Diabetes)](https://www.canadianjournalofdiabetes.com/article/S1499-2671(13)00851-4/abstract)

### Phase A — Running tracker GPS live (mai 2026)
Démarrage du module **"vrai Strava"** pour le running. Phase A = MVP tracking GPS sans carte (carte = Phase B prévue ensuite). Killer feature unique vs Strava : intégration native avec la glycémie live FreeStyle Libre + corrélation sport-glucose déjà existante.

- **Pure functions** (`lib/running-tracker.ts`) :
  - `haversineDistance(lat1, lon1, lat2, lon2)` : distance en mètres entre 2 points GPS (formule Haversine, précis ±0.5% < 100km)
  - `totalDistance(points[])` : distance cumulée avec filtrage du bruit (accuracy > 30m ignoré, segments < 3m ignorés)
  - `calculatePace(distMeters, durSec)` : retourne min/km, null si trop court
  - `instantPace(points, windowSize=5)` : allure instantanée sur fenêtre glissante (plus stable que pure instant)
  - `computeKmSplits(points)` : splits par km avec durée et allure
  - Helpers de formatage : `formatPace("5:23")`, `formatDuration("1:23:45")`, `formatDistance("12,34 km")`
- **Hook React** (`hooks/useRunningTracker.ts`) :
  - State : `status: 'idle' | 'tracking' | 'paused' | 'finished'`, `points: GpsPoint[]`, `distanceMeters`, `durationSec`, `paceLive`, `paceAvg`, `splits`
  - Actions : `start()`, `pause()`, `resume()`, `stop()`, `reset()`
  - Tracking via `navigator.geolocation.watchPosition` avec `enableHighAccuracy: true`, `maximumAge: 0`, `timeout: 15s`
  - **Wake Lock API** : `navigator.wakeLock.request('screen')` au start, release au stop. Re-acquire automatique au retour de visibilité (iOS peut release en background)
  - Tick chrono 1s avec gestion pause (accumulateur `pausedAccumSec`)
  - Gestion des erreurs GPS : permission refusée, timeout signal, etc. → message FR dans `gpsError`
  - Cleanup au unmount (sécurité si l'user quitte la page sans stop)
- **Composant UI** (`components/running/RunningTracker.tsx`) :
  - Écran plein écran (z-50, `fixed inset-0`) au démarrage de la séance
  - Hero "Durée" en `num-hero text-7xl` sky avec chrono live
  - 3 stats secondaires : Distance, Allure live, Allure moyenne
  - Boutons : Pause/Resume (toggle) + Stop (cercle sky avec icône Square)
  - Banner erreur GPS si `gpsError` (rouge avec instructions)
  - Footer hint "Garde APEX ouvert pendant la séance. L'écran reste allumé."
  - **Écran de récap au stop** : 4 stats hero (durée/distance/allure/splits), liste détaillée des splits par km, sélecteur ressenti 5 niveaux (great/good/ok/hard/bad), notes optionnelles, boutons "Abandonner" / "Enregistrer la séance"
- **Intégration `/running`** :
  - Bouton CTA hero "Démarrer une séance GPS" en haut de page (avant le status banner)
  - Surface-1 avec bordure running/25, glow-accent-2, icône MapPin sky
  - Au clic → overlay tracker plein écran
  - À l'enregistrement → ajout dans `completedRunningSessions` du store avec `sessionIndex: -1` (marqueur "séance libre GPS" filtrable)
  - Notes auto-générées : "GPS X points" si pas de notes user
- **iOS PWA constraints** : background tracking limité côté Safari quand l'écran est verrouillé. Mitigation = Wake Lock qui garde l'écran allumé pendant la séance. Brûle un peu plus de batterie (comme Strava) mais c'est le standard pour PWA tracker.
- **Build TS** : passe. Validé en preview : bouton CTA rendu sur `/running`, overlay s'ouvre au clic, chrono démarre (0:08 affiché), boutons pause/stop visibles, fallback GPS error correct sur Chromium sans permission.

### Phase B — Running tracker : carte Leaflet + trace live (mai 2026)
Intégration carte sur le tracker GPS. Choix techno : **Leaflet + OpenStreetMap (tiles CartoDB Dark Matter)** — gratuit sans clé API, fonctionne natif iOS Safari/PWA, design dark cohérent avec APEX. Migration vers MapKit JS possible plus tard sans changer l'API du composant.

- **Dépendances ajoutées** : `leaflet@1.9.4`, `react-leaflet@5.0.0`, `@types/leaflet` (devDep).
- **Composant `RunningMap.tsx`** (`components/running/RunningMap.tsx`) :
  - 2 modes : `"live"` (auto-pan + marker pulsant sur position courante) et `"replay"` (fit-bounds sur la bounding box, markers début vert / fin rouge).
  - Polyline sky (`#7FC7FF` = running color) qui se met à jour à chaque nouveau point GPS via `useMemo` sur `points`.
  - Filtre les points peu fiables (accuracy > 30m) avant de tracer.
  - Tiles **CartoDB Dark Matter** (gratuit, attribution OSM+CARTO obligatoire mais cachée pour ne pas polluer l'UI). Subdomain `{s}` géré par Leaflet.
  - Marker pulsant en live = 2 `CircleMarker` superposés (halo r=16 fillOpacity 0.15 + dot r=6 fillOpacity 1).
  - Throttle auto-pan à 1/sec pour éviter de désorienter l'utilisateur qui zoom manuellement.
  - `useMap` hook react-leaflet pour les comportements dynamiques (LiveAutoPan, ReplayFitBounds).
- **Intégration `RunningTracker.tsx`** :
  - Carte **plein écran en background** (`absolute inset-0`) pendant la séance.
  - Overlay top en **glass** (header + status GPS + erreurs) avec `backdrop-blur`.
  - Overlay bottom en glass : 4 stats compactes (Durée / Distance / Allure live / Allure moy.) + boutons Pause/Stop, footer indicator "X pts · ±Ym".
  - Nouveau composant `OverlayStat` : format vertical compact (label uppercase 9px + valeur num 16-18px).
  - Au stop → écran de récap avec **carte en mode replay** : trace complète, markers début/fin, fit-bounds auto sur la bounding box. Section dédiée `surface-1` 280px de hauteur avec badge "TRACE GPS" en overlay top-left et légende Départ/Arrivée en bottom-right.
- **Next.js 16 SSR** : `RunningMap` chargé via `next/dynamic` avec `ssr: false` car Leaflet a besoin du DOM. Loader `Loader2` spin pendant le chargement initial.
- **Import CSS Leaflet** : `import "leaflet/dist/leaflet.css"` dans `RunningMap.tsx` — Next.js gère l'injection automatique au bundle.
- **Validé en preview** : carte montée (`mapPresent: true`, 16 tuiles chargées), overlays glass top+bottom détectés à z-10, layout `fixed inset-0 z-50 bg-bg-primary` correct.

### Phase C — Running tracker : auto-tag glycémie + polyline colorée + altitude (mai 2026)
Killer feature T1D vs Strava : la séance running est **automatiquement enrichie** avec la glycémie live à plusieurs checkpoints, et la polyline est colorée selon la glycémie pour visualiser les zones à risque sur le tracé. Détection hypo proactive avec push notif locale.

- **Types étendus** (`types/index.ts`) :
  - Nouveau type `SessionGlucoseCheckpoint` : `{ label, offsetSec, value, timestamp, distanceMeters, trend? }`
  - `CompletedRunningSession` étendu avec optionnels : `gpsPoints?`, `glucoseCheckpoints?`, `elevationGainM?`
- **Helpers GPS étendus** (`lib/running-tracker.ts`) : `totalElevationGain(points)` (cumul positif avec filtre bruit altimétrique < 1m), `buildElevationProfile(points)` (array `{ distM, alt }` pour graphique).
- **Hook `useRunningTracker.ts` enrichi** :
  - Nouveaux state : `glucoseCheckpoints[]`, `liveGlucose`, `liveGlucoseTrend`
  - Helper `fetchAndStoreGlucose(label)` : fetch `/api/glucose/current`, stocke un checkpoint avec offset/distance/trend
  - **Auto-tag aux checkpoints** :
    - `T+0` au démarrage
    - `Km N` à chaque km franchi (détection via `Math.floor(distM / 1000)` dans le tick chrono)
    - `T+Nmin` toutes les 5 min (interval dédié)
    - `T+0 final` au stop
  - **Alerte hypo** : si `value < 80` et dernière alerte > 10min → push notif locale via service worker (`tag: "running-hypo"`)
  - Cleanup interval glucose au stop + reset
- **`RunningMap.tsx` : polyline colorée** :
  - Si `glucoseCheckpoints` fournis ET >= 2 → segmente la polyline en N sous-polylines colorées selon la glycémie active à chaque point GPS
  - `findGlucoseAt(ts)` : dernier checkpoint <= ts (interpolation step)
  - Couleurs : vert (target 80-180), orange (low 70-80 / high 180-250), rouge (hypo <70 / hyper >250)
  - Continuité visuelle : 1er point du nouveau segment dupliqué dans le précédent (pas de gap)
  - Fallback : si pas assez de checkpoints → polyline unique sky par défaut
- **UI tracker enrichie** :
  - Overlay bottom : passe à **5 colonnes** quand glycémie live dispo, avec une stat dédiée "Glycémie" + flèche trend + couleur tone (success/warning/error selon zone)
  - Helpers `glucoseTone(value)` et `trendArrowFromNum(num)` inline
- **UI récap : 2 nouveaux graphes** :
  - **Profil d'altitude** (Recharts AreaChart, 120px) : courbe sky avec gradient, axe X en km, tooltip "Altitude: Xm" à "Y.Y km". Affiché si ≥ 5 points d'altitude valides.
  - **Glycémie pendant la séance** (Recharts LineChart, 120px) : courbe lavender avec dots, axe X en minutes, bandes ref 70/180 (target green + lignes rouges/orange en pointillés), tooltip "Glycémie: X mg/dL à Y min". Affiché si ≥ 2 checkpoints.
  - Layout : grid 2 colonnes (sm:grid-cols-2) → côte à côte sur desktop, empilé sur mobile.
  - Nouvelle stat "Dénivelé +" dans la grid stats au-dessus si elevGain > 0.
- **Save enrichi** (`app/running/page.tsx`) : `handleSaveGpsSession` populate maintenant `gpsPoints`, `glucoseCheckpoints`, `elevationGainM`. Et déduit `glucoseBefore` du 1er checkpoint "T+0" non-final + `glucoseAfter` du checkpoint "final".
- **SportGlucoseCorrelation enrichi** (`lib/sport-glucose-analytics.ts`) :
  - `SportSession` étendu avec `glucoseCheckpoints?`
  - `enrichSession` : priorité aux checkpoints réels (tolérance ±5min) avant fallback archive (±18min). Convertit les checkpoints réels en `ArchivedPoint[]` pour réutiliser `findClosestPoint`.
  - Mapping `/diabete/historique` + `/diabete` met à jour le mapper pour passer `r.glucoseCheckpoints` à `SportSession`.
- **Validé en preview** : 5 stats overlay rendues incluant "Glycémie", build TS clean, tracker s'ouvre correctement après hard reload.

### Phase D — Page détail séance + replay scrubbable + auto-pause (mai 2026)
Finalisation du module running tracker : navigation vers les séances passées, replay scrubbable sur la trace, détection auto d'arrêt pendant la séance.

- **Page `/running/seance/[id]`** (`app/running/seance/[id]/page.tsx`) :
  - Next.js 16 dynamic route avec `params: Promise<{ id: string }>` + `use(params)` côté client
  - Lecture session depuis le store Zustand (`completedRunningSessions.find(r => r.id === id)`)
  - Fallback gracieux "Séance introuvable" avec lien retour si l'ID n'existe pas
  - Header : retour vers `/running` + bouton suppression (avec confirm)
  - Titre : date complète FR + label "Séance libre" ou "Semaine X" + ressenti emoji
  - 4-5 stats hero : Durée / Distance / Allure moy / Splits / (Dénivelé+ si dispo)
  - **Carte plein écran** avec polyline colorée par glycémie + scrub marker
  - **Replay scrubbable** : slider HTML5 `<input type="range">` + boutons Play/Pause + Reset
  - Play auto : `useEffect` avec `setInterval` calibré pour replay complet ~15s peu importe la longueur (intervalMs = 15000/length, clamp 20-200ms)
  - Stats live au point scrub : durée, distance, allure, altitude — calculées via `totalDistance(slice)` + delta temps
  - 2 graphes (altitude + glycémie) Recharts comme dans le récap
  - Splits par km détaillés
  - Notes en bas
- **`RunningMap` étendu** avec prop `scrubIndex?: number` (Phase D) :
  - Si scrubIndex valide → affiche 2 CircleMarker lavender (halo r=14 fillOpacity 0.25 + dot r=7 fillOpacity 1) sur le point GPS sélectionné
  - Compatible avec mode "replay" : le scrub marker apparaît en plus des markers début/fin classiques
- **Auto-pause dans `useRunningTracker`** :
  - Nouveau state `autoPaused: boolean` + ref miroir `autoPauseFlagRef` (évite stale state dans callbacks)
  - Refs `stillSinceRef` / `movingSinceRef` pour timer immobilité/mouvement
  - **Détection arrêt** : vitesse instantanée (Haversine simplifié sur les 5 derniers points) < 0.5 m/s pendant 10s consécutives → auto-pause
  - **Auto-resume** : vitesse > 1 m/s pendant 3s consécutives → reprise
  - Pause manuelle override l'auto-pause (flag remis à false)
  - Reset cleanup des refs au start/reset
  - UI : header overlay affiche "En pause" si manuelle, "Pause auto (arrêt détecté)" si auto
- **Section "Séances libres GPS" sur `/running`** :
  - Filtre `sessionIndex === -1` (marqueur séances libres GPS, distincts des séances du plan)
  - Affiche les 8 plus récentes triées par date desc
  - Card cliquable (Link) vers `/running/seance/[id]`
  - Stats compactes : date · distance · durée · allure · dénivelé · badge "N glycémies" si checkpoints
  - Icône ArrowRight qui se décale au hover
- **Build TS** : passe. Validé en preview avec fake session injectée : page détail rend correctement avec carte polyline colorée vert→orange→rouge (5 checkpoints simulés 130→115→95→78→88), slider scrub fonctionnel, stats live au point sélectionné ("À 17:00 · 1,65 km · 10:19/km · alt 39m"), section "Séances libres GPS" affichée sur `/running`.
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
