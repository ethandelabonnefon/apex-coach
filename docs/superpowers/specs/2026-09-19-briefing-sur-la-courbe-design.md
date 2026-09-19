# Briefing pré-sport sur la courbe prédite

**Date** : 19 septembre 2026
**Statut** : validé par Ethan (« oui lance »), à implémenter

## Le problème, chiffré

La section « Briefing pré-sport » (celle qu'Ethan ouvre ~30 min avant de
partir, sans dose en attente) conseille trop de glucides, et le délai n'y
change presque rien. Mesuré sur le moteur actuel (`computePreSportBriefing`),
130 mg/dL stable :

| Cas | Départ | Pendant | Conseil |
|---|---|---|---|
| 30 min de course dans 30 min, 1 U active | 115 | 55 | 33 g |
| Idem, zéro insuline | 130 | 70 | 23 g |
| Idem à 180 mg/dL | 165 | 105 | 33 g |
| 30 min de course dans **90** min, 1 U | 84 | 24 | **50 g** |
| 2 h de course dans 30 min | 115 | 55 | 80 g |

Trois défauts :

1. **45 g/h même sans insuline active.** Le consensus Riddell 2017 dit :
   départ entre 126 et 180 → pars, vois à 30 min. Les 30–60 g/h visent un
   effort long, ou de l'insuline à bord qu'on ne peut pas réduire.
2. **Un « −60 mg/dL » forfaitaire** pour toute course, qui fait passer
   « pendant » sous 80 presque à chaque fois → « Mange ».
3. **Le débit horaire est calé sur l'insuline de maintenant**, pas sur
   celle qui restera au départ — d'où 50 g à « dans 90 min » contre 33 g à
   « dans 30 min ». C'est la sensation d'Ethan : le délai ne compte pas.

Quatrième point, trouvé en lisant le câblage : la section prend
`liveGlucose?.value ?? currentGlucose` — le champ du calculateur, initialisé
à **120**. Capteur en panne → briefing calculé sur une glycémie inventée.
Même classe de bug que celle déjà corrigée sur la tuile COB et le plafond.

## La règle

Même moteur que le calculateur depuis mardi : **une courbe, deux
lectures.**

1. `buildPredictionEvents` (injections + glucides du store) →
   `predictGlucoseCurve` avec `upcomingExercise`. Plus de forfait.
2. `computeBolusSportPlan` lit la courbe : glucides seulement si elle passe
   sous la cible de départ ou sous 80 pendant l'effort ; règle de durée du
   consensus uniquement si la courbe touche son plancher.

### Ce qui change dans le modèle d'effort

Le prélèvement de glucose par le muscle (40 g/h aérobie, 20 g/h
intermittent) est désormais **modulé par l'insuline active au départ** :

```
impact = − prélèvement(g/h) × durée(h) × CSF × k(IOB au départ)
k = clamp(IOB / 1,5 U, 0,3 … 1)
```

Physiologie : quand l'insuline est basse, le foie compense le prélèvement
musculaire (production hépatique ↑) et la glycémie tient — c'est pour ça
qu'un run à jeun sans insuline ne finit pas à 40. Quand l'insuline est
haute, cette production est bloquée et la glycémie chute. C'est
exactement la logique de la table Riddell (glucides selon l'insuline à
bord), portée dans le modèle au lieu de la table.

Vérification sur les cas d'Ethan (130 stable, course de 30 min dans
30 min) :

- zéro insuline → k = 0,3 → −60 sur la demi-heure → ~70–90 pendant, pas de
  « Mange » systématique ; départ 130 ≥ 126 → rien avant ;
- 1 U active → k = 0,67 → chute franche → creux sous 80 → glucides ;
- « dans 90 min » avec 1 U : l'IOB au départ vaut ~0,45 U → k = 0,3 →
  **moins** de glucides qu'à « dans 30 min », pas plus.

Le calculateur (flux au bolus) profite de la même modulation : avec 4 U
fraîchement injectées, k = 1, résultat inchangé.

### Cible de départ

Riddell : 90–124 au départ → 10–20 g avant ; 126–180 → partir. La cible de
départ pour l'écart AVANT passe de 150 à **126** (aérobie) et reste 130
(intermittent). Le creux PENDANT, lu sur la courbe, garde le plancher 80.

### Insuline de référence

L'IOB **au départ** (`activeIOB` à `+minutesUntilWorkout`), jamais l'IOB de
maintenant — c'est le défaut n° 3.

### Glycémie de référence

Uniquement la lecture capteur (`liveGlucose.value`). Sans lecture, ou
lecture de plus de `TOPUP_MAX_GLUCOSE_AGE_MIN` (15 min) : pas de chiffre,
un message « pas de mesure fraîche — rafraîchis avant de partir ». Jamais
le champ du calculateur.

## Ce qui est conservé tel quel

Les recommandations qui ne sont pas des grammages :
- split qui tombe pendant l'effort → réduire / décaler (inchangé) ;
- > 250 mg/dL → cétones (aérobie) / attendre (muscu) ;
- famille intermittente → « re-vérifie à la fin, la chute vient après » ;
- fenêtre > 120 min → « reviens à 30–60 min du départ », aucun grammage.

Le stepper de quantité livré ce matin, la déclaration de séance, le tag
des glucides, la déduplication.

## Architecture

**`lib/pre-sport-briefing.ts`** (nouveau, pur) — `computePreSportBriefingOnCurve(input)` :

```ts
input: {
  currentGlucose: number | null; glucoseAgeMin: number | null;
  trendArrow?: number;
  insulinLogs: InsulinLog[]; carbEntries: CarbEntry[];
  isf: number; ratios: MealRatios; dia: number;
  family: ExerciseSource; minutesUntilWorkout: number; durationMin: number;
  pendingSplit?: { units: number; minutesUntil: number };
  sport?: RecentExercise;       // séance PASSÉE (sensibilité ↑)
  nowMs: number;
}
output: {
  status: "ok" | "no-glucose" | "stale-glucose" | "window-too-long";
  predictedAtStart: number | null; predictedDuringMin: number | null; predictedAtEnd: number | null;
  iobAtStartU: number; exerciseImpactMgDl: number; iobFactor: number;
  plan: BolusSportPlan | null;
  risk: "safe" | "caution" | "risk";
  recommendations: PreSportRecommendation[];   // même type qu'aujourd'hui
}
```

**`lib/glucose-prediction.ts`** : `upcomingExerciseImpactMgDl` gagne un
4ᵉ paramètre `iobAtStartU` et applique `k`. Constantes exportées
`EXERCISE_IOB_FACTOR_MIN = 0.3`, `HIGH_IOB_THRESHOLD_U` réutilisé.

**`lib/bolus-sport-plan.ts`** : `START_TARGET_AEROBIC` passe à 126. Le
test « 140 < 150 réclame des glucides » devient « 140 ≥ 126 n'en réclame
pas ».

**`app/diabete/page.tsx`** : le memo `preSportBriefing` appelle le nouveau
moteur avec `liveGlucose` seul ; la ligne « Décomposition » affiche
`départ · min pendant · fin · IOB au départ · effet de l'effort` ; le
calculateur passe `iob.totalIOB + cappedDose.units` comme IOB au départ.
`computePreSportBriefing` (ancien) est retiré avec ses tests, remplacés.

## Tests

- Les cinq cas du tableau, rejoués sur le nouveau moteur : 30 min / 0 IOB /
  130 → 0 g ; 30 min / 1 U → > 0 g ; « dans 90 min » ≤ « dans 30 min » ;
  180 mg/dL / 30 min → 0 g ; 2 h → apport, plafonné.
- `k` : 0 U → 0,3 ; 0,75 U → 0,5 ; ≥ 1,5 U → 1.
- Glycémie absente ou périmée → `status` correspondant, aucun grammage.
- > 120 min → `window-too-long`, aucun grammage.
- Le calculateur, scénario d'Ethan (70 g, course à +40, 4 U) → inchangé.
- Non-régression des recommandations conservées (split, cétones,
  intermittent).
