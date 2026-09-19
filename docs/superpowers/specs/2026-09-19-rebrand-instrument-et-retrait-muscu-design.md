# Rebrand « instrument » + retrait du module musculation

Date : 19 septembre 2026. Validé sur les deux prototypes HTML de
`/Users/ethandelabonnefon/Test/` (`apex-hybrid-prototype.html`,
`apex-global-prototype.html`).

## Objectif

1. Retirer le module musculation actuel (programme généré par IA, séances,
   progression, body map, coach de modification de programme). Il sera
   remplacé par le module « calendrier & séances » importé de Notion, qui
   fait l'objet d'une spec séparée.
2. Refondre le rendu visuel de toute l'app dans la direction « tableau de
   bord d'endurance et de santé métabolique » — sans toucher à
   l'architecture, aux contenus, ni à la moindre ligne de calcul.

## Invariants (non négociables)

- **Aucun fichier de `lib/` lié aux calculs, prédictions ou règles n'est
  modifié** : `insulin-calculator`, `glucose-prediction`, `bolus-sport-plan`,
  `pre-sport-briefing`, `dose-capping`, `dose-validation`, `fat-coverage`,
  `night-brain`, `night-calibration`, `carbs-on-board`, `hypo-resucrage`,
  `exercise-insulin-adjustment`, `post-session-insulin`, `sport-glucose-analytics`,
  `whoop-reconcile`, `sports`, `running-science`, `running-tracker`,
  `nutrition-calculator`, `meal-*`, `ratio-sync`, `forgotten-injection`,
  `prediction-inputs`, `glucose-archive/*`, `libre-link/*`, `push/*`,
  `whoop/*`, `reminders/*`, `doctor/*`.
- Les 416 tests de `npm test` passent identiques avant et après.
- Aucune route `app/api/*` liée au diabète, Whoop, glucose, push, split n'est
  modifiée.
- `types/index.ts` et `lib/store.ts` ne changent que par **retrait** de champs
  exclusivement muscu ; aucun champ lu par le diabète n'est retiré.

## Partie 1 — Retrait du module musculation

### Supprimé

| Zone | Fichiers |
|---|---|
| Pages | `app/muscu/**` (page, progression, seance/[id]) |
| API | `app/api/generate-muscu-program`, `app/api/update-programs`, `app/api/coach-chat` |
| Composants | `components/musculation/**`, `components/programs/**`, `components/body-map/**`, `components/coach/**`, `components/diagnostic/MuscuDiagnosticForm.tsx` |
| Lib | `lib/generators/**`, `lib/data/**` (exercices, split templates), `lib/muscu-science.ts`, `lib/program-generation-flow.ts`, `lib/coach-actions.ts`, `lib/diagnostic-comparison.ts`, `lib/body-analysis/**` |
| Store | `muscuProgram`, `activeProgram` + setters, `generatedMuscuProgram`, `muscuDiagnosticCompleted/Data`, `programChanges` + actions |
| Constantes | `MUSCU_PROGRAM` |
| Types | `Exercise`, `WorkoutSession` (si plus aucun consommateur) |

Le coach IA flottant (FAB + panel + `/api/coach-chat`) est retiré : son
prompt système est « assistant de musculation » et ses actions ne
s'appliquent qu'à `activeProgram`. Sans programme muscu, il n'a plus d'objet.

### Conservé

- `completedWorkouts` + `addCompletedWorkout` + `CompletedExercise` /
  `CompletedSet` : lus par `/diabete`, `/diabete/historique`,
  `/diabete/docteur`, `exercise-insulin-adjustment`, `sport-glucose-analytics`.
  Le futur module calendrier y écrira.
- Le diagnostic **morphologie** (`/profil/diagnostic`, mensurations, photos,
  `/api/analyze-photos`) — c'est du profil, pas de la muscu. La page perd
  l'onglet « Musculation », le `ProgramUpdateModal`, le calcul de diff
  (`compareDiagnostics`) et la section body map.
- L'onglet « Running » du diagnostic et tout `app/running/**` (refonte
  ultérieure, dans la spec calendrier).

### Remplacé

- `/muscu` devient une page d'attente sobre : « Module en reconstruction —
  calendrier & séances ». L'entrée de nav reste pour ne pas casser les
  habitudes ni les liens.
- Dashboard : la carte « Action du jour » (séance muscu du jour) et les
  raccourcis vers `/muscu/seance/*` sont retirés ; le compteur « séances
  cette semaine » lit `completedWorkouts` et reste.

## Partie 2 — Rebrand « instrument »

### Direction

Tableau de bord d'endurance et de santé métabolique : précis, rassurant,
personnel. Chaque couleur et chaque forme signale une information. Ton de
coach expert et calme.

### Typographie

| Rôle | Police | Chargement |
|---|---|---|
| Titres (`h1`, `h2`, `.t-*`, `.disp`) | Bricolage Grotesque 500-700 | `next/font/google`, variable `--font-display` |
| Texte | Instrument Sans 400-700 | `next/font/google`, variable `--font-sans` |
| Données (`.num`, `.num-hero`, `.mono`, `.label`, inputs numériques) | IBM Plex Mono 400-600 | `next/font/google`, variable `--font-mono` |

Les classes `.num` / `.num-hero` / `.label` existantes basculent en mono
(aucun changement dans les pages : elles portent déjà ces classes).

### Palette (light)

| Token | Valeur | Rôle |
|---|---|---|
| `--bg-primary` | `#EEF1F4` | fond gris bleuté |
| `--bg-secondary` | `#FBFCFD` | cartes blanc cassé |
| `--bg-tertiary` | `#E4E9EE` | insets |
| `--text-primary` | `#1E252D` | anthracite |
| `--text-secondary` | `#4F5D6B` | |
| `--text-tertiary` | `#8593A1` | |
| `--border-subtle` / `--border-default` | `#EAEEF2` / `#D9E0E7` | séparateurs fins |
| `--accent` | `#1F4FD8` cobalt | interactif : liens, focus, onglet actif, cardio |
| `--running` | `#1F4FD8` cobalt | cardio |
| `--diabete`, `--glucose-normal`, `--success` | `#178C5E` vert | glycémie, validé |
| `--warning`, `--glucose-high`, `--glucose-low` | `#C97B12` ambre | alerte, à surveiller |
| `--error`, `--glucose-critical` | `#B23A3A` | critique |
| `--muscu` | `#1E252D` anthracite | force |
| `--nutrition` | `#5B6B7A` gris acier | nutrition |
| `--accent-2` | `#5B6B7A` | ex-indigo IA/diabète → neutre acier |

Dark : mêmes rôles, valeurs éclaircies (`--bg-primary #14191F`, cartes
`#1C232B`, cobalt `#6D8DF0`, vert `#3FB489`, ambre `#E39A34`).

### Formes

- `--radius-sm 6`, `--radius-md 8`, `--radius-lg 12`, `--radius-xl 12`,
  `--radius-2xl 16`, `--radius-pill 8`. Plus de capsules.
- Cartes : fond `--bg-secondary`, bordure 1 px `--border-default`, ombre
  minimale. `.surface-1/2/3` suivent.
- Boutons primaires : anthracite. Bouton d'enregistrement d'injection :
  vert. Boutons cardio : cobalt.
- Glass, glow, hover-lift, dot-pulse : neutralisés (conservés comme classes
  no-op pour ne rien casser).
- Navigation : barre plate, bordure haute, onglet actif en cobalt, icônes
  au trait (pas de fill).

### Périmètre de code

- `app/globals.css` (tokens, `@theme`, utilitaires), `app/layout.tsx`
  (fonts, `theme-color`), `components/ui/*`, `components/ui.tsx`,
  `components/layout/*`, `components/navigation.tsx`, `BRAND.md`.
- Pages et composants métier : uniquement les classes Tailwind et hex
  résiduels (`rounded-full` → `rounded-lg`, `rounded-2xl/3xl` → `rounded-xl`,
  emojis d'UI → icônes lucide ou texte, hex iOS codés en dur → tokens).
  Aucune modification de props, de handlers, de hooks, de calculs.

### Vérification

1. `npm test` : 416 / 416.
2. `npm run build` : sans erreur TypeScript.
3. `git diff --stat -- lib/` : ne contient que les suppressions de la
   Partie 1 (aucun fichier de calcul).
4. Preview navigateur : `/`, `/diabete`, `/diabete/historique`,
   `/diabete/docteur`, `/diabete/parametres`, `/nutrition`, `/running`,
   `/profil`, `/muscu` (page d'attente) — light et dark.
