# Couverture des lipides — remplacement du modèle FPU pour la 2ᵉ injection

**Date** : 10 septembre 2026
**Statut** : validé par Ethan, à implémenter

## Le problème

La 2ᵉ injection (« split dose ») est calculée depuis les **FPU** — les calories
des lipides *et* des protéines mises dans le même sac : `(lipides×9 + protéines×4) / 100`.

Deux défauts, tous deux vérifiés sur les données d'Ethan.

**Elle se déclenche sur les protéines, à tort.** Sur son midi de sèche
(60 g glucides, 15 g lipides, **60 g protéines**), l'app réclame 2 U deux heures
plus tard. Les 60 g de protéines pèsent 240 des 375 kcal du calcul : ce sont
elles qui déclenchent tout. Ethan saute systématiquement cette injection, sans
conséquence.

**Le montant est très surestimé.** Sur son dîner du 9 septembre (109 g glucides,
63,7 g lipides, 49,5 g protéines), l'app réclamait **5 U**. Il en a fait 3 et
s'est réveillé à 146 mg/dL pour une cible de 110 — soit 0,36 U de trop peu.
Le besoin réel était donc de ~3,5 U, arrondi à **4 U**.

## Ce que les données établissent

Analyse de 225 repas avec macros renseignées, croisés avec l'archive glycémique
90 jours. Après exclusion des repas dont la fenêtre de 5 h 30 est contaminée par
une autre injection, et de ceux suivis d'une 2ᵉ injection réelle : **47 repas
exploitables, dont 7 au-delà de 30 g de lipides**.

**Les protéines ne montrent aucune relation dose-effet.** À gras faible
(< 25 g de lipides), la montée tardive médiane est de +29 mg/dL entre 0 et 40 g
de protéines, +83 entre 40 et 60, et +30 au-delà de 60. Non monotone : c'est du
bruit, pas un signal. Corrélation protéines ↔ montée : 0,30, comparable à celle
des lipides (0,25), et les deux macronutriments sont eux-mêmes corrélés (0,36) —
l'effet apparent des protéines est celui du gras qui les accompagne.

**Les lipides montrent une relation réelle et tardive.** Mesurée au point T+5 h :
0 mg/dL entre 10 et 20 g, +12 entre 20 et 30, +59 entre 30 et 45, +89 au-delà.
Les trajectoires complètes montrent que le pic arrive souvent à **T+7 h voire
T+9 h**, pas à T+5 h — le gras installe un plateau qui dure.

## Ce que les données ne permettent pas

**Sept repas au-delà de 30 g de lipides, dont deux partant d'une hypoglycémie**
(53 et 71 mg/dL) : leur montée mélange la remontée de l'hypo et l'effet du repas.

Surtout, les mesures ponctuelles (0,5 à 1,5 U de besoin résiduel) **contredisent
la nuit du 9 septembre** (3,5 U nécessaires). L'explication la plus probable est
que mesurer un pic sous-estime un plateau : rester huit heures à 150 mg/dL
représente beaucoup plus de glucose qu'un « +50 » ne le suggère. La métrique
compte la hauteur, pas la durée.

Conséquence assumée : **les paliers intermédiaires sont interpolés**, pas
mesurés. Ethan n'a aucun repas propre entre 45 et 60 g de lipides sur 90 jours.
C'est la raison pour laquelle le pourcentage doit rester réglable.

## Le nouveau modèle

La 2ᵉ injection devient un **pourcentage du bolus glucides, piloté par les seuls
lipides**. Les protéines sortent entièrement du calcul de dose.

| Lipides du repas | % du bolus glucides |
|---|---|
| < 30 g | 0 — aucune 2ᵉ injection |
| 30 – 45 g | 10 % |
| 45 – 60 g | 18 % |
| ≥ 60 g | 25 % |

**Ancrages.** Le palier haut vient de la nuit du 9 septembre : 25 % de 14,2 U
= 3,55 U, arrondi à 4 U — exactement le besoin observé. Le palier bas vient de
l'archive : les repas à 30-40 g de lipides n'y montaient que de 0,4 à 0,8 U.
Les deux paliers du milieu sont interpolés entre ces ancrages.

**Arrondi à l'unité entière la plus proche** (et non au-dessus). Ethan a choisi
les unités entières pour son stylo. `Math.round` et non `Math.ceil` : sur une
pizza à 30 g de lipides, 1,04 U doit donner 1 U, pas 2.

**Sous 0,5 U brut → aucune injection.** Pas de rappel pour une demi-unité.

**Le délai reste inchangé dans son principe** : la courbe du 9 septembre montre
que la montée commence 2 h 30 après le repas, ce qui valide le décalage. Le
délai est désormais piloté par les lipides : 120 min entre 30 et 60 g, 150 min
au-delà.

## Réglable par l'utilisateur

Les quatre pourcentages sont exposés dans `/diabete/parametres`, affichés en
clair, modifiables comme les ratios. C'est la seule façon honnête de laisser
Ethan caler des paliers que ses données ne tranchent pas — et c'est ce que
recommande la littérature, qui donne une fourchette de 24 à 75 % à titrer
individuellement ([Diabetes on the Net](https://diabetesonthenet.com/diabetes-digest/insulin-strategies-for-dietary-fat-and-protein-in-type-1-diabetes/)).

Bornes de saisie : 0 à 40 % par palier. Au-delà de 40 %, on sortirait de ce que
la littérature décrit et on entrerait dans un territoire où une erreur de saisie
produit une hypoglycémie sévère.

## Ce qui ne change pas

- **Le bolus initial.** Glucides + correction + tendance, exactement comme
  aujourd'hui. Ethan dit qu'il fonctionne bien ; on n'y touche pas.
- **Le FPU comme information.** Le badge de complexité digestive (« Modéré »,
  « Complexe ») et l'estimation de durée de digestion restent calculés depuis
  les FPU : ils informent, ils ne dosent pas.
- **Le plafond absolu de 8 U** sur la 2ᵉ injection.
- **Le pipeline de rappel** (notification push, `SplitDoseReminder`, cron
  serveur) : seul le montant change.

## Ce qui disparaît

- `FPU_CARB_EQUIVALENT_FACTOR` comme facteur de **dose** (le FPU reste calculé
  pour l'affichage).
- Les cinq conditions cumulatives de `useSplit` — remplacées par le seul seuil
  de lipides.
- Le cap relatif à 40 % du bolus glucides, devenu sans objet puisque le maximum
  du barème est 25 %.
- La condition `glycemicProfile !== 'fast'` : elle servait à éviter les faux
  positifs sur les glucides rapides, or le seuil de lipides s'en charge
  désormais. Un petit-déjeuner à 30 g de lipides mérite sa couverture.

## Tests

- Midi de sèche (60 g glucides, 15 g lipides, 60 g protéines) → **0 U**, quelle
  que soit la quantité de protéines. C'est le test central : il échouerait avec
  l'ancien modèle.
- Dîner du 9 septembre (109 g, 63,7 g lipides) → **4 U**.
- Pizza (80 g, 30 g lipides) → **1 U** et non 2 : l'arrondi est au plus proche.
- Un repas à 29 g de lipides → aucune 2ᵉ injection ; à 30 g → une injection.
- Les protéines ne changent jamais le montant : à lipides et glucides égaux,
  30 g ou 90 g de protéines donnent la même dose.
- Le plafond de 8 U tient sur un repas extrême.
- Un pourcentage saisi hors bornes est refusé.
