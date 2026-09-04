# Backtest du modèle de prédiction sur 90 jours — design

**Date** : 4 septembre 2026
**Statut** : validé par Ethan (design), à implémenter

## Le problème

`predictGlucoseCurve` (`lib/glucose-prediction.ts`) produit une courbe de glycémie
sur 8 heures. Depuis le 4 septembre 2026, cette courbe **décide de la dose
d'insuline** : `capDoseByPrediction` rabote la dose proposée tant que la
trajectoire simulée descend sous 80 mg/dL.

Personne n'a jamais mesuré l'erreur de ce moteur. Il est calibré sur de la
littérature et des retours terrain ponctuels, pas sur les données d'Ethan.

Deux façons de se tromper, aux conséquences opposées :

- **Trop pessimiste** — il annonce des chutes qui n'arrivent pas, le plafond
  retire des unités pour rien, Ethan monte en hyperglycémie sans comprendre.
- **Trop optimiste** — il ne voit pas venir les vraies hypoglycémies, le plafond
  ne protège de rien et donne une fausse assurance.

On ne sait pas dans quel sens, ni de combien.

## Ce que le backtest mesure

Trois questions, une seule machinerie de rejeu.

### 1. L'erreur de la courbe

Erreur absolue moyenne et médiane par horizon (30, 60, 120, 240 min), découpée
par contexte : post-repas (moins de 5 h après une injection avec glucides), à
jeun (plus de 5 h), nuit (00h–06h). Le découpage est le seul moyen de savoir si
un mauvais chiffre global vient de l'absorption ou d'autre chose.

Métriques : erreur signée moyenne (le **biais** — se trompe-t-il dans un sens
systématique ?), erreur absolue moyenne, médiane, et 90e centile (les pires cas,
qui comptent plus que la moyenne quand on parle d'hypoglycémie).

### 2. Le réglage de l'absorption

Sur les seules fenêtres post-repas où l'on dispose de la quantité de glucides :

- **Amplitude** : montée réelle observée (pic − valeur au moment de l'injection)
  contre montée prédite, rapportée aux grammes. Diagnostique
  `MG_PER_GRAM_CARB` (3,5).
- **Timing** : minute du pic réel contre minute du pic prédit. Diagnostique
  `CARB_PEAK_MIN` (60).
- **Queue** : erreur résiduelle à T+3h et T+4h. Diagnostique
  `CARB_DURATION_MIN` (195) et, sur les repas gras/protéinés,
  `FPU_GLUCOSE_FACTOR` (6).

Sortie : pour chaque constante, le sens et l'ampleur de l'écart, avec la taille
d'échantillon. **Aucune correction n'est appliquée** — voir « Hors périmètre ».

### 3. L'audit du plafond

Pour chaque injection loggée, on rejoue la décision de plafonnement telle
qu'elle aurait été prise à cet instant (`capDoseByPrediction` avec l'état
reconstruit), puis on confronte à la glycémie réellement enregistrée dans les
5 heures qui ont suivi.

Quatre cas :

| | Hypo réelle (<70 observé) | Pas d'hypo |
|---|---|---|
| **Le plafond aurait raboté** | protection justifiée | **fausse alerte** — dose volée |
| **Le plafond n'aurait rien fait** | **hypo manquée** | comportement normal |

Les deux cases en gras sont le résultat qui compte. Une hypo manquée est plus
grave qu'une fausse alerte, mais une fausse alerte fréquente rend le plafond
nuisible : elle sous-dose un vrai repas.

Nuance méthodologique à énoncer dans le rapport : la dose réellement injectée
ce jour-là était la dose **non plafonnée** (le plafond n'existait pas). Le
contrefactuel « qu'aurait donné la dose rabotée » n'est donc pas observable. On
mesure la qualité de l'**alerte**, pas celle de la dose corrigée. Le rapport
doit le dire explicitement plutôt que laisser croire à une simulation complète.

## Architecture

### Modules purs — `lib/backtest/`

**`replay.ts`** — le cœur.

```ts
export interface ReplayMoment {
  t0: number;                    // instant rejoué (ms)
  context: "post-meal" | "fasting" | "night";
  predicted: { minute: number; value: number }[];
  actual: { minute: number; value: number }[];  // apparié par horodatage
}

export function replayHistory(input: {
  points: ArchivedPoint[];
  insulinLogs: InsulinLog[];
  carbEntries: CarbEntry[];
  isf: number;
  ratios: MealRatios;
  basalChangeMs: number | null;
  stepMinutes?: number;          // défaut 15
  horizonMinutes?: number;       // défaut 240
}): ReplayMoment[];
```

Pour chaque instant `t0` de la grille :

1. Glycémie et tendance à `t0` — point d'archive le plus proche, toléré à
   ±8 min ; au-delà, l'instant est écarté (pas d'interpolation).
2. Événements actifs — **`buildPredictionEvents` réutilisé tel quel**
   (`lib/prediction-inputs.ts`), avec `nowMs: t0`. C'est la source unique de
   vérité production ; la réécrire ferait mesurer autre chose que le vrai
   modèle.
3. Calibration — voir ci-dessous.
4. `predictGlucoseCurve` appelé sans modification.
5. Appariement : chaque point prédit cherche le point d'archive le plus proche
   de son horodatage, toléré à ±8 min. Non apparié → écarté.

**`metrics.ts`** — agrégation pure des `ReplayMoment[]` vers les métriques des
sections 1 et 2. Aucun accès réseau, aucun accès disque.

**`cap-audit.ts`** — section 3. Rejoue `capDoseByPrediction` par injection et
classe les quatre cas.

### Calibration au fil de l'eau

Ethan a explicitement choisi d'interdire au modèle de connaître l'avenir.

`estimateNightDrift`, `estimateDawnCurve` et `estimateWakeupBias` sont
recalculées **une fois par jour rejoué**, avec les seuls points et injections
**antérieurs à minuit ce jour-là**, et postérieurs à `basalDoseChangedAt`.

Une fois par jour et non à chaque instant : la calibration ne bouge pas d'un
quart d'heure à l'autre, et l'approximation divise le coût par ~50 sans effet
mesurable. Ce choix doit être écrit dans le rapport.

Conséquence assumée : les premières semaines auront peu de nuits antérieures et
donc une calibration faible. Ce n'est pas un défaut du backtest, c'est ce que
l'app vivait réellement. Le rapport affiche l'erreur par semaine pour rendre
cette montée en compétence visible.

### Changement de basale

`userProfile.basalDoseChangedAt` marque le passage 28 → 24 U de Lantus. La
production remet la calibration à zéro à cette date. Le backtest fait de même :
aucune donnée antérieure ne nourrit une calibration postérieure. Sans ça, on
moyennerait deux traitements différents.

### Export des données — seul ajout à l'app

Un bouton « Exporter mes données » dans `/diabete/parametres`. Sérialise
l'intégralité du store persisté (`apex-coach-storage`, sans `partialize`) en
JSON téléchargeable, nom de fichier horodaté.

Deux usages : alimenter le backtest, et donner à Ethan la sauvegarde qu'il n'a
pas — trois mois d'injections vivent aujourd'hui dans un unique `localStorage`,
qu'un nettoyage Safari ou un changement de téléphone effacerait.

Le fichier reste sur son appareil. Aucune transmission.

### Exécution — script local, hors production

`scripts/backtest.ts`, lancé avec `tsx`. Lit le fichier exporté, récupère
l'archive via `GET /api/glucose/archive?days=90`, appelle les modules purs,
écrit un rapport.

Hors production délibérément : c'est un outil de mesure ponctuel, pas une
fonctionnalité. Une page de backtest serait du poids de production permanent
pour quelque chose de consulté trois fois.

## Mode dégradé — sans injections

L'export dépend d'une action d'Ethan. Le script doit fonctionner sans, et le
dire :

- **Avec archive seule** : section 1 restreinte aux contextes nuit et jeûne,
  dérive basale, courbe d'aube. Sections 2 et 3 impossibles, annoncées comme
  telles.
- **Avec archive + export** : les trois sections.

Le rapport indique toujours en tête ce sur quoi il a pu être calculé.

## Garde-fous d'honnêteté

Un backtest devient dangereux quand il produit un chiffre précis à partir de
rien. Règles dures :

- Toute tranche sous **20 instants rejoués** (ou **8 repas** pour la section 2,
  **10 injections** pour la section 3) affiche l'effectif et la mention « non
  concluant » **au lieu** de la valeur.
- Aucune valeur de capteur n'est interpolée ni extrapolée.
- Un instant dont l'état ne peut être reconstruit est écarté et compté ; le
  nombre d'instants écartés et leurs motifs figurent au rapport.
- Le biais (erreur signée) est toujours affiché à côté de l'erreur absolue :
  une erreur absolue de 30 mg/dL sans biais et une avec +28 de biais appellent
  des corrections opposées.

## Livrable

Un rapport visuel publié : synthèse en tête, les trois sections, courbes
prédit-contre-réel sur les cas les plus représentatifs et les pires, effectifs
partout. Lisible sur téléphone, montrable à un diabétologue.

## Hors périmètre

- **Aucune correction du moteur.** Si le rapport conclut que le pic d'absorption
  est à 90 min et non 60, changer la constante est un projet distinct avec sa
  propre validation : ce chiffre déplace toutes les doses.
- **Aucun ajustement automatique de constante.** Contrainte permanente d'Ethan :
  rien qui touche une dose ou un ratio ne s'applique sans validation explicite.
- **Aucune page de production.**
- **Aucun changement de `lib/glucose-prediction.ts`, `lib/prediction-inputs.ts`,
  `lib/dose-capping.ts`, `lib/night-calibration.ts`.** Le backtest les observe ;
  les modifier invaliderait la mesure.

## Tests

Modules purs, donc testables au `node:test` existant :

- Appariement : un point d'archive à 9 min de l'horodatage cible est écarté, à
  7 min il est retenu.
- Étanchéité temporelle : un instant rejoué au 10 juillet ne doit voir aucune
  donnée postérieure. Test construit avec une archive dont les valeurs d'août
  sont aberrantes — si elles fuitent, le résultat change.
- Barrière du changement de basale : aucune nuit antérieure ne nourrit la
  calibration postérieure.
- Seuils d'honnêteté : une tranche à 19 instants renvoie « non concluant », à
  20 elle renvoie une valeur.
- Classement de l'audit du plafond : les quatre cas du tableau.
