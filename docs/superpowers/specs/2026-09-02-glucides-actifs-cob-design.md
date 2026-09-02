# Glucides actifs (COB) + confirmation de repas — design

**Date** : 2026-09-02
**Statut** : validé par Ethan, prêt pour plan d'implémentation

## Problème

L'écran `/diabete` montre l'insuline active (IOB) mais pas les **glucides actifs** (COB). Ethan
ne voit donc qu'une moitié de l'équation : impossible de savoir d'un coup d'œil si ce qui
reste à digérer est couvert par ce qui reste d'insuline. Conséquences terrain :

- Les glucides saisis dans le calculateur sont une **estimation d'avant repas**. Si Ethan mange
  plus que prévu, rien ne le rattrape : le sous-dosage n'est visible qu'au pic, 2 h plus tard.
- Les hypos post-prandiales sont interprétées sans savoir combien de glucides restaient à absorber.
- Le module « déclare ce que tu digères » (`ManualDigestion` + `mealCoverage` dans
  `night-brain.ts`) répondait à ce besoin par une saisie manuelle. Il a été débranché en juin
  2026 (redondant, friction). Le code est encore présent mais orphelin : `manualDigestion` n'a
  aucun writer ni reader dans l'UI, et `mealCoverage` n'est construit par aucun appelant.

## Objectif

Rendre visible en permanence le couple **glucides actifs ↔ insuline active**, et en dériver un
verdict de couverture actionnable, sans ajouter un cinquième conseiller concurrent à
`CorrectionSuggestion`, `NightBrain`, le briefing pré-sport et Le Docteur.

## Principes

1. **Un seul moteur d'effets.** Le COB réutilise les primitives de `lib/glucose-prediction.ts`
   (`carbRemainingFraction`, facteur FPU 6, `activeIOB`). Aucun nouveau modèle physiologique :
   la tuile et le plan de la nuit ne peuvent pas se contredire par construction.
2. **Jamais d'auto-apply sur une dose.** Toute proposition d'insuline s'affiche avec un bouton
   « Valider » explicite + `confirm()` natif. Règle établie en juillet 2026, appliquée
   partout ailleurs dans l'app.
3. **Incertain ⇒ muet sur la dose, aveugle pour l'apprentissage, jamais silencieux sur l'hypo.**
   Voir la section « Repas à quantité incertaine ».

---

## 1. Calcul — `lib/carbs-on-board.ts` (nouveau)

Module de fonctions pures, sans I/O, testé avec `node:test` comme le reste de `lib/`.

### Entrées

```ts
export interface ActiveCarbSource {
  id: string;
  label?: string;          // mealTag ("pates") ou label de CarbEntry ("Compote")
  carbsGrams: number;      // confirmé ?? estimé
  fatGrams: number;
  proteinGrams: number;
  insulinUnits: number;    // bolus associé — 0 pour un CarbEntry sans insuline
  gramsPerU: number;       // ratio du créneau au moment du repas
  minutesAgo: number;
  uncertain: boolean;      // quantité déclarée incertaine
  confirmed: boolean;      // l'utilisateur a confirmé les grammes réels
}
```

Les sources sont dérivées des `InsulinLog` **et** des `CarbEntry` du store, via un mapper qui
suit exactement le même filtrage temporel que `buildPredictionEvents`
(`EVENT_ACTIVE_WINDOW_MIN` = 360 min).

### Sortie

```ts
export interface CarbsOnBoard {
  carbsRemainingG: number;   // glucides bruts encore à absorber
  fpuRemainingG: number;     // équivalent-glucides FPU encore à absorber
  totalRemainingG: number;
  insulinNeededU: number;    // insuline requise pour ce qui reste
  insulinActiveU: number;    // IOB bi-exponentiel
  balanceU: number;          // insulinActiveU − insulinNeededU (signé)
  status: 'idle' | 'covered' | 'deficit' | 'excess';
  uncertain: boolean;        // au moins une source incertaine
  sources: ActiveCarbSource[];
}
```

### Formules

```
carbsRemainingG = Σ carbs × carbRemainingFraction(minutesAgo)
                  // bi-exponentielle, pic 60 min, durée 195 min

fpuRemainingG   = Σ FPU × FPU_GLUCOSE_FACTOR × fractionRestanteFPU(minutesAgo)
                  // FPU = (fat×9 + prot×4)/100
                  // fractionRestanteFPU = 0 si FPU < 1 (même seuil que
                  //   fpuGlucoseRise, sous lequel l'effet est négligeable),
                  //   sinon max(0, 1 − heuresÉcoulées / FPU_WINDOW_HOURS)
                  // Décroissance linéaire sur 5 h, cohérente avec le débit
                  // horaire constant de fpuGlucoseRise()

insulinNeededU  = Σ (grammes restants de CETTE source) / gramsPerU de CETTE source
                  // le ratio par créneau est conservé source par source :
                  // un repas du matin (1,5 U/10 g) et un du soir (1 U/10 g)
                  // ne se moyennent pas

insulinActiveU  = activeIOB(bolus des 6 dernières heures)
                  // modèle bi-exponentiel (Loop), pic 75 min, DIA 195 min

balanceU        = insulinActiveU − insulinNeededU
```

### Seuils de statut

| Statut | Condition |
|---|---|
| `idle` | `totalRemainingG < 5` et `insulinActiveU < 0.5` |
| `deficit` | `balanceU ≤ −1.0` |
| `excess` | `balanceU ≥ +1.0` et `totalRemainingG < 15` |
| `covered` | tout le reste |

Le seuil de 1 U n'est pas cosmétique : le stylo d'Ethan ne fait pas de demi-unités (même
contrainte que `later = ceil(fpuBolus)` pour le split). En dessous, aucune action n'est
possible — donc aucun message.

---

## 2. Unification du modèle d'IOB

La tuile « Insuline active » utilise aujourd'hui `getInsulinOnBoard()`
(`lib/insulin-calculator.ts:853`), un modèle **linéaire**. Toute la couche prédiction (nuit,
COB) utilise le modèle **bi-exponentiel** `activeIOB` / `iobRemainingFraction`.

Laisser les deux afficherait deux chiffres différents côte à côte sur le même écran.

**Décision** : la tuile bascule sur le modèle bi-exponentiel. Plus juste physiologiquement,
et cohérent avec le reste de l'écran. Effet visible : l'IOB affiché monte légèrement avant
~90 min et baisse plus vite après ~2 h.

`getInsulinOnBoard()` reste exporté mais l'affichage du header n'en dépend plus.

> **Rectification (revue finale de branche, septembre 2026).** La phrase d'origine — « aucune
> modification des doses calculées : ce changement est purement un changement d'affichage » —
> **était fausse**. Le scalaire affiché par la tuile est le même que celui passé à
> `calculateBolus`, où il est soustrait de la **part correction** (jamais du bolus repas). Le
> bi-exponentiel décroît plus vite après ~2 h, donc il masque **moins** de correction, donc la
> dose proposée **augmente**.
>
> Effet mesuré, bolus de 6 U vieux de 2 h 30 : IOB linéaire 1,4 U vs bi-exponentiel 0,56 U →
> pour une glycémie à 250 (cible 110, ISF 100), la correction proposée passe de 0 U à 0,8 U,
> soit ~80 mg/dL d'effet supplémentaire.
>
> Le même scalaire alimente `computePreSportBriefing`, `computeBedtimeAdvice`,
> `classifyHypoContext` et le refus anti-stacking de `CorrectionSuggestion`, dont les seuils
> (0,5 / 0,8 / 1,5 U) ont été calibrés sur le modèle linéaire : ils se déclenchent désormais
> un peu plus tôt dans la vie d'un bolus.
>
> **Le modèle n'est pas remis en cause** — le bi-exponentiel est physiologiquement plus juste
> et reste le bon choix. Le changement devait simplement être documenté comme un changement
> de dose, pas d'affichage. Un test de non-régression fige le comportement actuel
> (`lib/insulin-calculator.test.ts`, section « IOB résiduel et part correction »).

---

## 3. Confirmation des glucides à T+20 min

### Modèle de données

Champs ajoutés à `InsulinLog` (tous optionnels, rétrocompatibles avec les injections déjà
persistées) :

```ts
carbsConfirmedGrams?: number;
fatConfirmedGrams?: number;
proteinConfirmedGrams?: number;
carbsConfirmedAt?: string;    // ISO
carbsUncertain?: boolean;     // quantité déclarée non fiable
```

L'estimation d'origine (`carbsGrams`) n'est **jamais écrasée**. Tous les consommateurs lisent
`carbsConfirmedGrams ?? carbsGrams` via un helper unique `resolveCarbs(log)` exporté par
`lib/carbs-on-board.ts`, pour éviter que chaque appelant réimplémente le fallback.

Conserver les deux valeurs garde l'écart estimation↔réel dans les données. C'est la matière
première d'un futur « tu sous-estimes tes portions de pâtes d'environ 30 % » — **hors scope
de cette itération**, mentionné ici uniquement pour justifier de ne pas écraser le champ.

### Déclenchement

À l'enregistrement d'une injection avec `carbsGrams > 0` et sans `carbsUncertain`, un rappel
est programmé à **T+20 min**.

Plutôt que de dupliquer le pipeline, **`lib/split-reminders/` est généralisé** : ajout d'un
champ discriminant `kind: 'split' | 'meal-confirm'` sur le type de rappel stocké en KV. Même
store, même cron piggybacké sur `glucose-check`, même service worker. Un seul mécanisme de
rappel serveur au lieu de deux.

Conséquences :
- Le module et les routes sont renommés pour refléter leur portée élargie (`lib/reminders/`,
  `/api/reminders/schedule`, `/api/reminders/cancel`).
- **Les anciennes routes `/api/split/schedule` et `/api/split/cancel` sont conservées comme
  alias** qui délèguent aux nouveaux handlers. Raison : l'app est une PWA avec service worker,
  donc un client au JS encore en cache peut appeler les anciens chemins après le déploiement.
  Le client échoue silencieusement (`catch` vide, volontaire pour ne pas bloquer l'UX) — un
  404 se traduirait donc par un rappel de split dose perdu, c'est-à-dire une hyperglycémie
  tardive non couverte. Les alias sont supprimables une fois le cache SW retourné.
- `checkSplitsAndAlert()` devient `checkRemindersAndAlert()` et dispatche sur `kind` pour
  choisir le titre, le corps et le tag de la notification.
- Les rappels split déjà en KV au moment du déploiement n'ont pas de `kind` : ils sont
  traités comme `'split'` par défaut (lecture tolérante).

### La carte de confirmation

Visible en haut de `/diabete`, de **T+15 min à T+3 h** après l'injection, tant que le repas
n'est ni confirmé ni marqué incertain. Une seule carte à la fois (la plus récente).

L'écart entre la carte (T+15) et la notification (T+20) est volontaire : si Ethan ouvre l'app
de lui-même juste après le repas, il trouve la carte déjà là et peut confirmer avant que la
notification ne parte. Le rappel est annulé dès la confirmation.

Contenu :
- Rappel du contexte : « Injection de 8 U à 12h45 pour ~100 g estimés »
- **Bouton principal** : « C'était bien 100 g » — un tap pour le cas nominal
- Champ numérique pour corriger les glucides, pré-rempli avec l'estimation
- Macros (lipides / protéines) repliables, pré-remplies, comme dans le calculateur
- **Troisième option** : « Je ne sais pas » → marque le repas incertain (voir section 5)

Après validation, si un déficit ≥ 1 U est détecté, la carte se transforme pour afficher
l'appoint proposé (section 4) plutôt que de disparaître.

---

## 4. Proposition d'appoint d'insuline

Le cas d'usage : bolus pour 100 g, Ethan confirme 140 g → il manque ~4 U. Ce n'est pas du
stacking, c'est le **complément du bolus repas** — pratique MDI standard.

### Garde-fous (déterministes, aucun LLM impliqué)

- Proposé uniquement si `balanceU ≤ −1.0`
- Dose = `floor(|balanceU|)`, **plafonnée à 4 U** par appoint
- **Bloqué** si glycémie < 90 mg/dL ou trend ↓↓ (`trendArrow === 1`)
- **Bloqué** si une source incertaine contribue au déficit (section 5)
- **Jamais auto-appliqué** : affichage « il manque ~4 U » + bouton « Valider » + `confirm()`
- L'appoint validé crée un `InsulinLog` avec `parentInjectionId` pointant sur l'injection
  d'origine, et `isSplitDose: false` — ce n'est pas une couverture FPU différée, donc la liste
  des injections ne doit pas afficher le badge « split ». Un badge « appoint » distinct est
  ajouté, conditionné sur `parentInjectionId && !isSplitDose`

### Veille continue

Après la confirmation, le statut de couverture reste calculé en continu et affiché dans la
tuile. Une **nouvelle** proposition d'appoint n'apparaît que si l'état change de façon
matérielle : nouveaux glucides saisis, ou FPU devenus non couverts (typiquement des pâtes à
T+3 h sans split). Concrètement : on mémorise le `balanceU` au moment de la dernière
proposition et on ne re-propose que si le déficit s'est creusé d'au moins 1 U de plus.

Cas `excess` (insuline en excès, glucides presque épuisés) : **aucune dose proposée**, message
orienté glucides. Cette alerte est du côté sécurité — elle reste active même sur un repas
incertain.

---

## 5. Repas à quantité incertaine

Besoin : certains plats (resto, cuisine de quelqu'un d'autre) ont une quantité de glucides
non estimable. Ethan veut pouvoir dire « ne compte pas ce repas » pour ne pas recevoir de
proposition de dose fondée sur du vent, et pour ne pas polluer l'apprentissage.

### La règle

> Un repas incertain rend l'app **muette sur la dose** et **aveugle pour l'apprentissage**,
> mais ne la rend **jamais silencieuse sur un risque d'hypo**.

Mettre les glucides à zéro serait la mauvaise implémentation : le calcul verrait de
l'insuline active sans glucides en face et conclurait « trop d'insuline, mange des glucides ».
Un repas incertain déclencherait une fausse alerte hypo. L'insuline injectée est réelle et ne
sort jamais du calcul.

### Comportement par surface

| Surface | Repas incertain |
|---|---|
| Tuile glucides actifs | affichée, marquée `≈` |
| Proposition d'appoint | **bloquée** |
| Alerte excès d'insuline / risque hypo | **maintenue** |
| Plan de la nuit | repas gardé dans la trajectoire, aucune correction à la hausse proposée |
| Calibration nuit (`nightPredictionLogs`, `estimateWakeupBias`) | nuit **exclue** du backtest |
| Historique par type de repas (`getMealTypeHistory`) | injection **exclue** |
| Contexte du Docteur / bilan hebdo | injection **exclue** |

L'exclusion de l'apprentissage passe par un prédicat unique
`isLearnable(log): boolean` exporté par `lib/carbs-on-board.ts`, appliqué par chaque
consommateur. Un seul endroit à modifier si la règle évolue.

### Points d'entrée

1. **Dans le calculateur**, avant d'injecter : toggle « quantité incertaine ». S'il est actif,
   aucun rappel de confirmation n'est programmé (inutile de demander de confirmer une
   quantité inconnue).
2. **Dans la carte de confirmation** à T+20 : option « Je ne sais pas ».

**Réversible dans les deux sens** : le repas apparaît dans la liste des injections avec un
badge « incertain » et un tap permet de lever le drapeau et de saisir la quantité si Ethan
finit par la connaître.

---

## 6. UI

### Layout du header

Aujourd'hui : grille 2 colonnes (Glycémie | Insuline active).

Nouveau : **glycémie sur toute la largeur**, puis **Insuline active et Glucides actifs côte à
côte** en format compact en dessous. Trois tuiles empilées sur mobile repousseraient le
calculateur de bolus trop loin sous la ligne de flottaison.

### Tuile « Glucides actifs »

- Icône lucide cohérente avec `MEAL_TAG_ICONS` (`Wheat`)
- Chiffre hero : grammes restants (`62`), suffixe `g`
- Sous-ligne 1 : composition — « dont 18 g de lipides/protéines »
- Sous-ligne 2 : verdict — « couvert » / « il manque ~2 U » / « ≈ estimation incertaine »
- Couleur : token `--nutrition` si couvert, `--warning` si déficit, `--info` si excès,
  `--text-tertiary` si idle

Le verdict de la tuile ne porte **jamais** de bouton d'action — les actions vivent dans la
carte de confirmation ou la carte d'appoint, pour garder un seul endroit où une dose se valide.

---

## 7. Suppressions

- Type `ManualDigestion` (`types/index.ts`) + `manualDigestion` / `setManualDigestion`
  (`lib/store.ts`) — code mort depuis juin 2026, sans writer ni reader.
- `mealCoverage` dans `lib/night-brain.ts` : l'input orphelin est remplacé par le vrai COB.
  L'étape `coverage` du plan de la nuit est conservée mais alimentée par
  `computeCarbsOnBoard()`, donc réellement active pour la première fois.

---

## 8. Tests

`lib/carbs-on-board.test.ts`, runner `node:test` existant (`npm test`) :

- Repas bien dosé, T+30 min → `balanceU` ≈ 0, statut `covered`
- Bolus pour 100 g, 140 g confirmés → déficit ≈ 4 U, statut `deficit`
- Décroissance temporelle : à T+4 h, `totalRemainingG` ≈ 0 et statut `idle`
- Ratios distincts : un repas matin (1,5 U/10 g) et un repas soir (1 U/10 g) simultanément
  actifs ne se moyennent pas
- FPU non couverts à T+3 h sans split → déficit détecté
- Repas incertain → `uncertain: true`, aucun appoint proposé
- Repas incertain avec insuline en excès → alerte hypo **toujours** émise
- Garde-fous : glycémie 85 → appoint bloqué ; déficit 9 U → appoint plafonné à 4 U
- `isLearnable()` : faux pour un repas incertain, vrai pour un repas confirmé
- `resolveCarbs()` : confirmé prioritaire, fallback sur l'estimation

## 9. Hors scope

- Apprentissage du biais d'estimation (« tu sous-estimes tes pâtes de 30 % ») — nécessite
  d'accumuler des paires estimé/confirmé d'abord.
- Confirmation pour les `CarbEntry` : ils sont saisis après coup, il n'y a pas d'estimation
  antérieure à corriger.
- Toute modification des doses calculées par le calculateur de bolus.
