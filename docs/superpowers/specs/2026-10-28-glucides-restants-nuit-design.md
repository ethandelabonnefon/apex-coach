# Glucides restants lus sur la courbe + dose du coucher « pic ≤ 130 »

Date : 28/10/2026 · Statut : design validé par Ethan, à planifier

## Problème

Dîner du 27/10 : 140 g de glucides (riz), 9 U à 20h54, glycémie 71. Courbe parfaite
pendant 2h30 (133 → 95), le plan de nuit dit « tu peux te coucher » à 23h30, puis
montée de 94 à 248 (pic 4h49) et réveil vers 240.

Cause : `CARB_DURATION_MIN = 195` (`lib/glucose-prediction.ts`) — tout repas est
considéré digéré en 3h15, quelle que soit sa taille. À 23h30 le modèle croyait 95 %
du repas absorbé. La glycémie disait le contraire : 9 U pour 140 g (ratio 10 → 14 U)
et une glycémie restée à 95 impliquent qu'une grosse part du riz n'était pas passée.

Rejeu sur les 25 dîners ≥ 80 g des 90 derniers jours (archive KV + sauvegarde store) :
- la glycémie a monté la nuit **23 fois sur 25** ; le modèle actuel prédisait une
  légère baisse et sous-estime la montée de **132 mg/dL en moyenne** (sur 5h après
  le coucher, avant dérive/biais) ;
- les glucides restants déduits de la courbe prédisent la montée réelle
  (r = 0,87 à 2h, 0,76 à 2h30, 0,41 à 3h — nuits sans injection ultérieure, n = 7 à 10) ;
- mais l'effet réel est **~1,5 à 2 mg/dL par gramme restant**, pas les 10 du
  calcul brut ISF/ratio (100/10). Brut, le 27/10 aurait donné +486 → ~5 U au
  coucher à 94 = hypo sévère. Calibré : ~+100 à +115 pour +154 réels.

Deuxième défaut trouvé : la prédiction de nuit (`nightPredictionLogs`) est écrite dès
20h, souvent avant le dîner (le 27/10 : 127 prédit à 20h53, 246 au réveil). Sur 14
nuits les erreurs vont de −229 à +155 : `estimateWakeupBias` apprend sur du bruit.

## Décisions d'Ethan

1. Approche « lire la courbe » (type Loop) plutôt qu'une durée de digestion par repas.
2. Le plan de nuit **propose une dose** quand il reste des glucides.
3. Quantité incertaine : la dose est **quand même proposée**, calculée sur la
   quantité saisie, avec un **gros avertissement**. Change la règle « incertain =
   muet sur la dose » **pour le plan de nuit uniquement**.
4. Doses en **unités entières** (stylo au pas de 1 U).
5. **Pas de plafond** de dose arbitraire : la dose est celle qui garde le **pic de
   la nuit ≤ 130 mg/dL**.
6. **Plancher 80 mg/dL** : aucune dose proposée ne doit faire passer la courbe
   prédite sous 80.
7. Chaque matin : « Compter cette nuit dans les algorithmes ? Oui / Non ».

## Design

### 1. Glucides restants observés — `lib/observed-carbs.ts` (nouveau, pur)

`observedCarbsRemaining(input) → { remainingG, absorbedG, reason } | null`

- Bilan de masse : `absorbéObs = (BG_now − BG_repas + insulineUtilisée × ISF) / CSF`,
  `CSF = ISF / ratio du repas`, insuline utilisée via `iobRemainingFraction`
  (toutes les injections de [repas − 4h, maintenant]).
- `remainingG = clamp(glucidesSaisis − absorbéObs, 0, glucidesSaisis)` ;
  glucides saisis = `resolveCarbs` (confirmé ?? estimé).
- Renvoie `null` (→ modèle actuel inchangé) si :
  - repas hors fenêtre [150, 240] min (début à T+150 : le facteur est ajusté sur la montée nette lue à T+150 ; plus tôt, l'insuline encore active du repas serait ignorée) ;
  - pas de point capteur à ±20 min du repas, ou dernière lecture > 15 min ;
  - plus d'un repas ≥ 20 g dans la fenêtre ;
  - un resucrage (`isRescue`) dans la fenêtre.

### 2. Facteur appris — `estimateLateCarbFactor` (dans `lib/night-calibration.ts`)

- mg/dL réels par gramme restant, ajusté sur l'archive + injections : dîners ≥ 60 g,
  lecture à T+2h30, montée max sur les 5h suivantes, **nuits sans injection après
  la lecture**, nuits exclues retirées (§5).
- Pente par moindres carrés avec ordonnée à l'origine (l'ordonnée absorbe la dérive,
  déjà modélisée ailleurs — seule la pente est utilisée).
- Défaut **1,5** tant que < 5 nuits utilisables ; borné [0,5 ; 4].
- Branché dans le memo `nightCalibration` de `app/diabete/page.tsx`, respecte
  `basalDoseChangedAt`, affiché dans la CalibrationLine.

### 3. Prédiction de nuit

Quand §1 renvoie une valeur, l'événement du repas dans `predictGlucoseCurve` voit sa
part glucides **future** remplacée par `remainingG × facteur`, étalée linéairement sur
les 3h suivantes (pas de double comptage avec la courbe 195 min). FPU/lipides et
insuline inchangés.

### 4. Dose du coucher (`lib/night-brain.ts`)

Remplace la correction « viser 120 au réveil, arrondi 0,5 U bas, plafond 2 U » :

- pour `u = 0, 1, 2, …` : recalcul de la courbe prédite avec `u` unités injectées
  maintenant ;
- dose proposée = **plus petit `u` entier** tel que max(courbe) ≤ 130 **et**
  min(courbe) ≥ 80 ;
- si aucun `u` ne satisfait les deux : plus grand `u` avec min ≥ 80, et message
  explicite (« Avec 2 U tu montes à ~160 ; 3 U te ferait descendre à ~65 vers 0h15 ») ;
- le plafond 130 s'applique à la courbe **à partir de T+2h** (une glycémie déjà à
  200 au coucher ne peut pas être sous 130 dans 15 min) ; le plancher 80 s'applique
  à toute la courbe ;
- aucune dose si la glycémie actuelle < 80 (`liveLow`, inchangé), si la flèche est
  ↓↓, si la lecture capteur est absente ou > 15 min ;
- étape « Il reste ~X g de ton repas à digérer, ça va monter jusqu'à ~Y » ;
- quantité incertaine : même calcul, avertissement rouge en tête de l'étape :
  « Quantité incertaine : cette dose part des X g que tu as saisis. Si tu as moins
  mangé, elle peut te faire descendre. » ;
- toujours via le bouton Valider (`log-correction`), jamais d'auto-apply.

Hors plan de nuit, rien ne change : l'appoint T+20 (`suggestTopUp`) garde son
blocage en quantité incertaine et ses garde-fous.

### 5. « Compter cette nuit ? »

- Store : `excludedNights: string[]` (dates `YYYY-MM-DD` du soir de la nuit) +
  `setNightExcluded(date, excluded)` ; ajouté à `BACKED_UP_KEYS`.
- Carte sur `/diabete` de 5h à 12h tant que la nuit précédente n'a pas de réponse :
  Oui (défaut implicite) / Non.
- Une nuit exclue est retirée de : `estimateLateCarbFactor`, `estimateNightDrift`,
  `estimateDawnCurve`, `estimateWakeupBias`.
- CalibrationLine : liste des nuits exclues, réintégrables.

### 6. Prédiction de réveil enregistrée au bon moment

- Le log de nuit est **réécrit** à chaque recalcul du plan jusqu'à 2h (même nuit =
  même entrée) au lieu d'être figé au premier passage après 20h.
- Les logs antérieurs à ce déploiement sont ignorés par `estimateWakeupBias`
  (champ `version`), sinon l'ancien biais s'ajouterait au nouveau calcul.

## Tests

- `observed-carbs.test.ts` : repas absorbé normalement → ~0 g ; cas du 27/10
  (140 g, 9 U, 76 → 90 à T+2h30) → ~57 g ; capteur absent / repas hors fenêtre /
  deux repas → `null` ; bornes 0 et glucides saisis.
- `estimateLateCarbFactor` : < 5 nuits → 1,5 ; bornes ; nuits exclues ignorées.
- Dose du coucher : cas du 27/10 → attendu 1 U (à confirmer par le rejeu, facteur 1,5) ; cas où 130 et 80 sont incompatibles →
  plus grande dose sûre + message ; entiers uniquement ; glycémie < 80 → aucune dose.
- Rejeu des 25 dîners (script, hors CI) : erreur de prédiction réduite, aucune
  dose proposée dont la courbe passe sous 80.

## Hors périmètre

Dose du repas, 2ᵉ injection lipides, tuile Glucides actifs en journée, appoint T+20.
