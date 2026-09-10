# Appoint post-séance — couvrir les glucides du sport une fois l'effort fini

**Date** : 10 septembre 2026
**Statut** : validé par Ethan, à implémenter

## Le problème, vécu le 10 septembre

Le briefing pré-sport a conseillé 66 g de glucides avant une course. Ethan les a
pris. À la 30ᵉ minute il était à 69 mg/dL et a mangé 10 g de plus. La course
s'est bien passée. **Trente minutes après la fin, sa glycémie est montée de 68 à
210 mg/dL.** Il a fait 3 U, insuffisantes.

Son diagnostic, exact : « à un moment j'avais plus d'insuline et j'avais quand
même une bonne soixantaine de glucides encore en cours d'assimilation. »

Pendant l'effort, le muscle capte le glucose **sans insuline** (translocation de
GLUT4 par la contraction). Cette captation s'effondre à l'arrêt. Les glucides
encore en digestion arrivent alors sans rien en face. Une étude montre que
[75 % des patients partent en hyperglycémie quand la dose est réduite après
l'effort](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC4032262/), précisément
parce que les glucides de la récupération ne sont plus couverts.

**Ce que l'app a fait de travers.** Les glucides pré-sport sont marqués
`sportSessionId` et volontairement **exclus** du calcul de couverture — sinon la
tuile réclamerait de l'insuline pour des glucides pris pour éviter une hypo.
Mais cette exemption ne s'arrête jamais. Après la course, les 43 g encore en
absorption étaient invisibles.

D'où une correction sous-dosée : à 210 mg/dL, la suggestion existante calcule
`(210 − 110) / 100` et propose **1 U**. Elle corrige la glycémie du moment et
ignore les dizaines de grammes en route derrière.

## La règle

À la fin de la séance, l'app calcule un **appoint** à partir de trois entrées —
celles qu'Ethan a lui-même identifiées :

```
appoint = (glucides encore en absorption / ratio du créneau − insuline active)
          × (1 − réduction post-effort)
```

La réduction post-effort est celle que `computeExerciseAdjustment` produit déjà
depuis le strain : une grosse séance augmente davantage la sensibilité, donc
appelle moins d'insuline. C'est le troisième terme demandé.

**Validation sur le cas réel du 10 septembre :**

| | |
|---|---|
| 66 g pris 75 min avant la fin | 34 g encore en absorption |
| 10 g pris 20 min avant la fin | 9 g encore en absorption |
| Total | **43 g** → 5,2 U (ratio goûter 1 U / 8,3 g) |
| Insuline active | 0 U |
| Running 39 min, strain Whoop 11,6 | sensibilité ↑ de 25 % |
| **Appoint** | 5,2 − 25 % = 3,9 → **4 U** |

Ethan, indépendamment : « là tu me fais un quatre unités et on est parfait. »
Un seul cas ne valide pas une formule, mais l'ancrage est net.

## Le décalage dans le temps — le point de sécurité

À la fin de sa course, Ethan était à **68 mg/dL**. Proposer 4 U à cet instant
serait dangereux : c'est l'heure où le risque d'hypoglycémie tardive est le plus
élevé, la captation GLUT4 restant élevée plusieurs heures après l'effort.

L'appoint n'est donc **jamais proposé pour tout de suite**. Il est **programmé
30 minutes après la fin de la séance**, via le mécanisme de rappel qui existe
déjà (`SplitDoseReminder`, avec sa notification push serveur qui fonctionne
app fermée).

Sur son cas, le rappel serait tombé vers 16 h 30 — quand sa courbe passait
103 mg/dL en pleine montée. Le bon moment.

**Au déclenchement du rappel, la glycémie est relue.** Sous
`POST_SESSION_MIN_GLUCOSE` (90 mg/dL), la carte n'offre pas le bouton
d'enregistrement : elle affiche la glycémie et invite à attendre. Le risque
symétrique — injecter sur quelqu'un qui redescend — prime sur la correction
d'une hyperglycémie.

## Fin de l'exemption

En parallèle, l'exemption des glucides « sport » devient **temporaire** : elle
vaut pendant la séance, elle s'arrête à sa fin. Après, le reste non absorbé
compte normalement dans `insulinNeededU`, donc la tuile des glucides actifs dit
enfin la vérité — « 43 g en cours, 0 U active » — au lieu de ne rien montrer.

C'est la même correction que celle déjà appliquée aux séances annulées
(`cancelledSessionIds` dans `lib/carbs-on-board.ts`), étendue au cas normal.

## Architecture

**`lib/post-session-insulin.ts`** — fonction pure, testable sans React :

```ts
export interface PostSessionAppoint {
  /** Unités proposées. 0 = rien à proposer. */
  units: number;
  /** Grammes encore en absorption au moment du calcul. */
  remainingCarbsG: number;
  /** Unités avant réduction post-effort — transparence UI. */
  rawUnits: number;
  /** Réduction appliquée (0-50). */
  reductionPct: number;
  /** Instant du rappel (ms). */
  dueAtMs: number;
  /** Motif quand units === 0, pour l'affichage. */
  skipReason?: "no-carbs" | "covered-by-iob" | "below-minimum";
}

export function computePostSessionAppoint(input: {
  session: DeclaredSportSession;
  carbEntries: CarbEntry[];
  iobUnits: number;
  ratioGramsPerU: number;
  reductionPct: number;
  nowMs: number;
}): PostSessionAppoint;
```

Seuls les `CarbEntry` portant le `sportSessionId` de CETTE séance sont comptés :
un repas ordinaire pris avant le sport a son propre bolus et n'a rien à faire
ici.

Le reste absorbé se calcule avec `carbRemainingFraction`
(`lib/glucose-prediction.ts`), la même courbe que partout ailleurs — pas une
deuxième modélisation de l'absorption.

**Constantes** : `POST_SESSION_DELAY_MIN = 30` · `POST_SESSION_MIN_UNITS = 1`
(sous une unité, pas de rappel) · `POST_SESSION_MAX_UNITS = 6` (garde-fou contre
une saisie de glucides erronée, pas une limite clinique) ·
`POST_SESSION_MIN_GLUCOSE = 90`.

**Déclenchement** : dans `app/diabete/page.tsx`, quand une séance déclarée passe
de « en cours » à « terminée » — heure de fin réelle si Whoop l'a confirmée,
sinon fin déclarée. Une seule fois par séance : la séance porte un marqueur
`appointScheduledAt` pour que le `useEffect` ne reprogramme pas à chaque tick.

**Rappel** : réutilise `SplitDoseReminder` avec un libellé distinct
(« appoint post-séance »). Aucun nouveau pipeline : la planification serveur, la
notification push et le cron existent déjà et fonctionnent app fermée.

## Ce qui ne change pas

- Le briefing pré-sport et son conseil de glucides.
- Le bolus initial des repas.
- La couverture des lipides livrée ce matin.
- Rien n'est jamais injecté sans clic explicite et confirmation.

## Tests

- Le cas du 10 septembre : 66 g à −75 min, 10 g à −20 min, IOB 0, ratio 8,33,
  réduction 25 % → **4 U**, rappel à fin + 30 min.
- Sans glucides « sport », aucun appoint (`skipReason: "no-carbs"`).
- Insuline active suffisante pour couvrir le restant → aucun appoint
  (`covered-by-iob`).
- Sous une unité après réduction → aucun rappel (`below-minimum`).
- Le plafond de 6 U tient sur une saisie aberrante (300 g de glucides).
- Seuls les glucides de CETTE séance comptent : un `CarbEntry` portant un autre
  `sportSessionId`, ou aucun, est ignoré.
- Une réduction post-effort plus forte donne strictement moins d'unités —
  le terme « strain » agit réellement.
- Après la fin de séance, un `CarbEntry` « sport » entre dans `insulinNeededU` ;
  avant la fin, il en est exclu.
