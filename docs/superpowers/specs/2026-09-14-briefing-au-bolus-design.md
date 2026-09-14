# Briefing au moment du bolus — un seul flux connecté

**Date** : 14 septembre 2026
**Statut** : validé par Ethan (« ça me va »), à implémenter

## Le problème

Le calculateur de bolus a un toggle « Pré-entraînement » (mai 2026) et la
page a une section « Briefing pré-sport » (septembre 2026). Ce sont **deux
systèmes parallèles** :

| | Toggle du calculateur | Briefing pré-sport |
|---|---|---|
| Sports | Muscu / Running | 12 sports, 3 familles |
| Réduit la dose | oui (−50 % / −30 %) | non |
| Conseille des glucides | oui, sans voir le repas ni la dose réduite | oui, sans voir le repas à venir |
| Déclare une séance | **non** | oui |
| Tague les glucides | **non** | oui |
| Trace | `notes: "pré-running"` — texte libre, lu par personne | `DeclaredSportSession` + `CarbEntry.sportSessionId` |

Tout ce qui a été câblé en septembre (exemption des glucides pendant
l'effort, appoint post-séance, réconciliation Whoop, sensibilité
post-exercice, exclusion de l'apprentissage) part de la séance déclarée.
Le toggle n'en crée pas. Conséquences mesurées sur l'écran du 14 septembre :

- le plafond prédictif affiche « séance non modélisée » ;
- la tuile des glucides actifs voit un repas sous-dosé et annonce « il
  manque X U » à quelqu'un qui part courir ;
- la prédiction de nuit ne saura que la course a eu lieu que si Whoop la
  remonte ;
- l'appoint post-séance ne se déclenche pas ;
- une hypo pendant la course est imputée au bolus du déjeuner → le
  détecteur propose de baisser le ratio du midi à tort.

Et le toggle empile les deux leviers — il réduit de 50 % **et** dit « mange
15 g » — sans jamais confronter l'un à l'autre. C'est un double airbag ;
c'est la mécanique du 210 mg/dL du 10 septembre.

## Le flux voulu (les mots d'Ethan)

« Je mange à 19 h et je vais faire ma séance de running à 19 h 40. Je lance
ça, je dis dans combien de temps je vais faire du sport, environ quarante
minutes, et hop, il me dit de combien baisser, savoir si je dois manger
avant d'aller faire mon sport, et que tout soit connecté. »

## La règle

Consensus Riddell et al. 2017 : quand un bolus repas précède l'effort de
moins de 90 min, **la réduction de dose est le levier principal, les
glucides le levier d'appoint**. Donc, dans cet ordre :

1. **Réduire la dose** selon la famille et le délai (table ci-dessous).
2. **Lire la glycémie prédite au départ** sur la courbe que le plafond
   prédictif calcule déjà — ton repas + la dose réduite + ton insuline
   active. Un seul modèle, celui de `predictGlucoseCurve`.
3. **Glucides** : si la glycémie prédite au départ est au-dessus de la cible
   de départ (150 aérobie / 130 intermittent) → **0 g**. Sinon → l'écart
   ramené en grammes, avec les bornes du briefing actuel (15 g minimum,
   plafond `MAX_PRE_SPORT_CARBS_G`), plus l'apport sur la durée si l'IOB
   après dose le justifie (`exerciseCarbsForDuration`, règle inchangée).

### Table de réduction

| Famille | Effort dans ≤ 60 min | 60–120 min | > 120 min |
|---|---|---|---|
| `running`, `cardio-other` | −50 % | −30 % | 0 |
| `intermittent` | −25 % | −15 % | 0 |
| `muscu` | 0 | 0 | 0 |

Les lignes running et muscu sont celles du code actuel. La ligne
intermittente est nouvelle : Riddell parle de « réduction faible ou nulle »
pour le mixte, la glycémie tient pendant l'effort (adrénaline) et chute
après — c'est l'appoint post-séance qui couvre la chute. La réduction
s'applique au **bolus glucides seul**, comme aujourd'hui (jamais à la
correction ni à la 2ᵉ injection lipides).

## Ce que « Enregistrer l'injection » fait désormais

Quand le briefing est actif au moment du clic, en plus de l'injection :

1. **Déclare la séance** — même objet `DeclaredSportSession` que la section
   briefing (sport, famille, `startAt = now + délai`, durée).
2. **Tague les glucides** conseillés, s'il y en a et si Ethan les a acceptés
   — même `CarbEntry` avec `sportSessionId`.
3. Écrit dans `notes` le libellé `pré-<sport>` (conservé pour le Docteur et
   l'historique), **et** un champ structuré `sportSessionId` sur
   l'`InsulinLog` pour que la dose réduite soit reliée à sa séance.

À partir de là, la chaîne existante fait le reste sans une ligne de plus :
exemption pendant l'effort, appoint 30 min après la fin, Whoop qui corrige
la fin, sensibilité post-exercice sur le bolus suivant, exclusion de
l'apprentissage, prédiction de nuit.

### Déduplication

Si une séance déclarée non annulée existe déjà avec un `startAt` à
± `SAME_SESSION_TOLERANCE_MIN` (45 min) de celle du calculateur, on ne crée
pas de doublon : on **réutilise** son id pour le tag des glucides et de
l'injection. Même tolérance que la réconciliation Whoop.

## Interface

Le toggle « Pré-entraînement » du calculateur ouvre le **même sélecteur**
que la section briefing (12 sports en 3 familles, « dans combien de
temps », durée). Sous le sélecteur, un bloc unique :

> **Course dans 45 min**
> Dose ramenée de 7 à **4 U** (−50 %, course dans moins d'une heure)
> Glycémie prédite au départ : **138** · pendant : ~**105**
> **Prends 10 g de glucides rapides avant de partir** — ou « rien à manger »

Le bouton « Enregistrer l'injection (4 U) » porte, quand des glucides sont
conseillés, une case cochée par défaut « et je prends 10 g ». Décocher
enregistre l'injection et déclare la séance sans taguer de glucides.

La bannière « Dose non vérifiée par la prédiction — séance non modélisée »
disparaît : la séance est désormais dans la simulation. Le plafond
prédictif garde tous ses garde-fous (plancher, grâce, split).

La section **Briefing pré-sport** séparée reste, pour le cas « j'ai déjà
fait ma dose et je décide d'aller courir » (le cas du 10 septembre). Elle
utilise le même composant de sélection et le même moteur de glucides ;
seule différence : pas de dose à réduire, donc pas de ligne « dose ramenée ».

## Architecture

**`lib/bolus-sport-plan.ts`** (nouveau, pur) :

```ts
export function preWorkoutReductionPct(family: ExerciseSource, minutesUntil: number): number;

export interface BolusSportPlan {
  reductionPct: number;              // 0-50
  reducedCarbBolusU: number;         // bolus glucides après réduction
  predictedAtStart: number | null;   // lu sur la courbe, null si glycémie inconnue
  predictedDuring: number | null;    // + impact sport (perso ou académique)
  carbsG: number;                    // 0 = rien à manger
  carbsReason: "none" | "gap" | "duration" | "gap+duration";
}

export function computeBolusSportPlan(input: {
  family: ExerciseSource;
  minutesUntilWorkout: number;
  durationMin: number;
  carbBolusU: number;                // AVANT réduction
  curveWithReducedDose: PredictionPoint[] | null;
  iobAfterDoseU: number;
  personalSportImpact?: number | null;
}): BolusSportPlan;
```

Pas de nouveau modèle d'absorption : `predictedAtStart` est le point de la
courbe le plus proche de `minutesUntilWorkout`. `predictedDuring` réutilise
`academicSportImpact` / l'impact perso, comme le briefing actuel.

**`lib/insulin-calculator.ts`** : `calculateBolus` reçoit `workoutType:
ExerciseSource | null` (au lieu de `'muscu' | 'running' | null`) et délègue
la réduction à `preWorkoutReductionPct`. Le reasoning est conservé.

**`lib/dose-capping.ts`** : `CappedDose` expose `curve` (la trajectoire de
la dose retenue). Elle est déjà calculée ; on ne fait que la rendre
visible. Le contexte reçoit `upcomingWorkout?: { family, minutesUntil,
durationMin }` uniquement pour **ne plus lever** le motif « séance non
modélisée » quand la séance passe par ce flux.

**`types/index.ts`** : `InsulinLog.sportSessionId?: string`.

**`app/diabete/page.tsx`** :
- l'état `workoutType` devient une clé de `SPORTS` (`preWorkoutSportKey`),
  `minutesUntilWorkout` et une durée ;
- le sélecteur de sport est extrait en composant `SportPicker` (utilisé par
  le calculateur et par la section briefing) ;
- `handleLogInjection` déclare la séance (avec déduplication), tague les
  glucides acceptés, relie l'injection ;
- la fonction `createBriefingSession` existante devient
  `declareSportSession(sport, startAt, durationMin, carbsG | null)` partagée
  par les deux entrées.

## Ce qui ne change pas

- Rien n'est injecté, déclaré ni tagué sans le clic « Enregistrer ».
- La réduction post-exercice (sensibilité ↑ d'une séance passée) reste
  distincte et cumulable — elle modélise que l'insuline agit plus fort, pas
  qu'on en met moins pour un effort à venir.
- Le split lipides, le plafond prédictif et ses plancher/grâce, la règle
  −1 U sous 75.

## Tests

- Table de réduction : les 9 cases, plus les bornes 60/120 min.
- `computeBolusSportPlan` : prédite au départ ≥ cible → 0 g ; sous la cible
  → écart/4 arrondi, ≥ 15 g ; plafond respecté ; courbe absente → carbs
  calculés sur la seule règle de durée et `predictedAtStart: null` ;
  aérobie cible 150 / intermittent 130 / muscu jamais de glucides.
- `calculateBolus` : à famille égale, mêmes doses qu'avant pour running et
  muscu (non-régression) ; padel dans 30 min → −25 %.
- Scénario d'Ethan : 70 g à 19 h, course à +40 min, 45 min, glycémie 120,
  IOB 0 → dose 7 → 4 U (ratio dîner 10 g/U), prédite au départ dans
  [130, 150], glucides conseillés ≤ 15 g.
- Déduplication : une séance déclarée 20 min plus tôt au briefing est
  réutilisée, pas doublée.
- `InsulinLog.sportSessionId` posé quand le flux est actif, absent sinon.
