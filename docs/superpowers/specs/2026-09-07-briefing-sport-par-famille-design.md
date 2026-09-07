# Briefing pré-sport par famille d'effort — design

**Date** : 7 septembre 2026
**Statut** : validé par Ethan, à implémenter

## Le problème

Cas concret rapporté par Ethan : il fait son bolus repas, puis décide d'aller
courir. Trois défaillances s'enchaînent.

1. **Le briefing ne connaît que deux sports** (`muscu` / `running`,
   `app/diabete/page.tsx:245`). Un foot ou un padel n'y entre pas, alors que
   leur effet glycémique est différent des deux.
2. **Les glucides pris pour le sport sont indiscernables d'un repas.** Ils
   entrent dans la couverture insuline, et nourrissent l'apprentissage des
   doses par créneau — un padel du samedi peut faire passer le goûter pour un
   sur-dosage.
3. **Rien n'enregistre une séance décidée sur le moment.** Seuls les modules
   muscu et running alimentent `completedWorkouts` /
   `completedRunningSessions`. L'ajustement de sensibilité post-exercice
   (`lib/exercise-insulin-adjustment.ts`) ne se déclenche donc pas, et le
   repas suivant est dosé comme s'il n'y avait pas eu d'effort.

Ethan : « il va me conseiller de prendre des glucides, sauf que l'algorithme
ne va pas comprendre pourquoi j'ai pris des glucides. »

## Fondement scientifique

Le consensus de référence ne classe pas par sport mais par **type d'effort**
([Riddell et al., Lancet Diabetes & Endocrinology 2017](https://www.thelancet.com/journals/landia/article/PIIS2213-8587(17)30014-1/abstract)) :
l'aérobie fait baisser la glycémie, l'anaérobie la fait monter, le mixte la
laisse stable.

Trois faits qui déterminent le design :

- **Aérobie continu** : baisse franche et prévisible. Apport recommandé de
  **30 à 60 g de glucides par heure** quand l'insuline circulante est faible,
  et **jusqu'à 75 g par heure** quand elle est élevée — le cas d'Ethan, qui
  fait du sport après son bolus repas.
- **Intermittent** : la glycémie reste stable *pendant*, puis chute *après*.
  Catécholamines et hormone de croissance soutiennent le taux durant l'effort,
  mais [les hypoglycémies sont plus fréquentes après les séances à intervalles
  les plus intenses](https://www.nature.com/articles/s41598-018-34342-6).
  Conseiller comme du running sur-sucrerait ; conseiller comme de la muscu
  laisserait tomber après.
- **Résistance** : sensibilité insuline inchangée à 12 h et 36 h
  (Yardley et al., Diabetes Care 2013 — déjà implémenté via `getSportFactor`).

## Les trois familles

`ExerciseSource` (`lib/exercise-insulin-adjustment.ts`) devient la famille.
Elle vaut aujourd'hui `"running" | "muscu" | "cardio-other"` ; on ajoute
`"intermittent"`. `running` et `cardio-other` sont déjà la famille aérobie,
`muscu` la famille résistance — aucun renommage, donc aucun risque de casser
les consommateurs existants.

| Famille | Sports proposés | Effet |
|---|---|---|
| Aérobie continu (`running` / `cardio-other`) | Course à pied, Vélo, Natation, Rameur, Randonnée | baisse pendant l'effort |
| Intermittent (`intermittent`) | Football, Padel, Tennis, Basket, CrossFit | stable pendant, chute après |
| Résistance (`muscu`) | Musculation, Sprint | neutre ou en hausse |

**Un changement de comportement à assumer** : `classifySport` range aujourd'hui
CrossFit et Hyrox dans `muscu`. Ce sont des efforts intermittents, et les
reclasser modifie l'ajustement post-exercice appliqué aux séances CrossFit
remontées par Whoop — dans le sens anti-hypo (facteur plus élevé, donc
réduction d'insuline plus forte après). C'est un changement voulu, pas un
effet de bord : il doit être explicite dans le code et signalé au review.

Un nouveau `SPORTS` (`lib/sports.ts`) porte, pour chaque sport : sa clé, son
libellé français, sa famille, et sa **durée par défaut** (Football 90,
Padel 90, Tennis 90, Basket 90, CrossFit 60, Course 45, Vélo 60, Natation 45,
Rameur 30, Randonnée 120, Musculation 60, Sprint 30).

## Le geste

Dans le briefing pré-sport, trois champs, tous approximatifs :

1. **Le sport** — grille de chips, la famille affichée en sous-titre.
2. **Dans combien de temps** — le curseur existant (5 → 180 min), inchangé.
3. **Combien de temps ça dure** — pré-rempli par la durée par défaut du sport,
   modifiable d'un geste. Ethan peut partir sans y toucher.

## Le calcul des glucides

Deux composantes distinctes, qui ne doivent pas être confondues :

**A. Combler l'écart avant l'effort** — mécanisme existant de
`computePreSportBriefing` : glycémie estimée au départ (IOB, tendance, split
en attente) comparée à la cible de départ. Inchangé.

**B. Couvrir la baisse pendant l'effort** — nouveau, dépend de la famille et
de la durée annoncée :

| Famille | g/h, insuline basse | g/h, insuline élevée |
|---|---|---|
| Aérobie | `AEROBIC_CARBS_PER_HOUR_LOW_IOB = 45` | `AEROBIC_CARBS_PER_HOUR_HIGH_IOB = 75` |
| Intermittent | `INTERMITTENT_CARBS_PER_HOUR_LOW_IOB = 20` | `INTERMITTENT_CARBS_PER_HOUR_HIGH_IOB = 40` |
| Résistance | 0 | 0 |

« Insuline élevée » = `IOB > HIGH_IOB_THRESHOLD_U` (1,5 U), interpolation
linéaire entre les deux bornes en dessous. Les 75 g/h viennent du consensus ;
les valeurs intermittentes sont posées à environ la moitié de l'aérobie,
cohérentes avec la stabilité glycémique observée pendant l'effort — elles sont
**des points de départ à recalibrer sur les données d'Ethan**, pas des
constantes établies.

**Plafonds obligatoires**, dans la lignée du calibrage de mai 2026 qui avait
corrigé un « mange 191 g » absurde :

- Total (A + B) plafonné à `MAX_PRE_SPORT_CARBS_G = 80`.
- Au-delà de `RECHECK_WINDOW_MIN = 120` minutes avant le départ, on ne chiffre
  pas : on affiche « re-vérifie ta glycémie 30 min avant » — règle déjà en
  place, à conserver.
- Composante B calculée sur la durée annoncée, elle-même plafonnée à
  `MAX_PLANNED_DURATION_MIN = 180`.

**Message spécifique à l'intermittent** : en plus des grammes, une phrase
explicite sur le risque décalé — la glycémie tient pendant le match et chute
après, resurveiller à la fin.

## Les glucides tagués sport

`CarbEntry` gagne `sportSessionId?: string`, exactement sur le modèle de
`hypoEventId` (glucides de resucrage, septembre 2026).

Conséquences, identiques au traitement du resucrage déjà validé :

- **Comptés** dans les glucides actifs (COB) : ils font réellement monter la
  glycémie, la prédiction doit les voir.
- **Exclus de la couverture insuline** (`insulinNeededU` dans
  `lib/carbs-on-board.ts`) : ils compensent une baisse due à l'effort, ce
  n'est pas un repas à couvrir. Sans ça, la tuile réclamerait un bolus pour
  des glucides pris justement pour éviter une hypo.
- **Exclus de l'apprentissage** des doses par créneau
  (`lib/dose-validation.ts`) et du GRG perso.

## La séance et sa réconciliation Whoop

Nouveau type `DeclaredSportSession` (nom distinct du `SportSession` existant
de `lib/sport-glucose-analytics.ts`, pour éviter toute confusion), persisté
dans le store :

```ts
interface DeclaredSportSession {
  id: string;
  sportKey: string;              // clé de SPORTS
  family: ExerciseSource;
  /** ISO du début prévu (maintenant + délai annoncé). */
  startAt: string;
  plannedDurationMin: number;
  /** Renseignés par la réconciliation Whoop. */
  actualDurationMin?: number;
  endedAt?: string;
  whoopWorkoutId?: string;
  /** Annulation explicite par l'utilisateur. */
  cancelledAt?: string;
  createdAt: string;
}
```

**Création** : accepter la recommandation de glucides crée la séance. C'est
l'idée d'Ethan — l'acceptation du conseil *est* la déclaration d'intention,
aucun bouton supplémentaire n'est nécessaire. Pour les sports sans glucides
(résistance), un bouton « Je pars » explicite joue le même rôle.

**Effet immédiat** : `findMostRecentExercise` accepte les
`DeclaredSportSession` en plus des deux sources actuelles. L'ajustement de
sensibilité post-exercice s'applique donc dès le repas suivant. La règle
existante « une séance non terminée est ignorée » (`endedAtMs > nowMs`) est
conservée : l'effet de sensibilité commence après l'effort, pas avant.

**Réconciliation Whoop** : quand le snapshot Whoop remonte une séance dont la
fenêtre recouvre celle déclarée, on renseigne `actualDurationMin`, `endedAt`,
`whoopWorkoutId`, et le strain réel prend le pas sur l'estimation — le code
préfère déjà le strain Whoop quand il existe.

**Deux garde-fous** :

- **Annulation en un geste.** Si Ethan renonce, une séance fantôme réduirait
  son prochain bolus sans raison. La carte de séance en cours porte un bouton
  d'annulation.
- **Séance non confirmée.** Si Whoop est connecté et ne remonte aucune séance
  recouvrant la fenêtre déclarée, l'app le **signale** plutôt que de garder
  silencieusement une séance fantôme. Elle ne la supprime pas d'office :
  Ethan peut avoir fait du sport sans son bracelet.

## Ce que ça débloque

`lib/sport-glucose-analytics.ts` mesure déjà les deltas glycémiques réels par
type de séance, mais ne distingue que muscu et running. Avec les familles et
la clé de sport, il pourra dire : « au padel, ta glycémie chute de 50 mg/dL
une heure après » — la donnée d'Ethan, pas une moyenne d'étude. Les tables
g/h ci-dessus sont explicitement des amorces destinées à être remplacées par
cette mesure.

## Hors périmètre

- **Aucun conseil pendant l'effort**, aucune notification en cours de séance :
  l'app n'a pas de donnée fiable pendant qu'Ethan bouge, et il ne le souhaite
  pas.
- **Aucun ajustement automatique de dose.** Le conseil s'affiche, Ethan
  décide — contrainte permanente du projet.
- **Aucune recalibration automatique** des tables g/h depuis les données
  mesurées. Ce sera un projet distinct, une fois qu'il y aura assez de
  séances par famille.
- **Pas de suivi GPS** pour les nouveaux sports : le tracker running existant
  n'est pas étendu.

## Tests

- Chaque sport de `SPORTS` appartient à une famille connue et porte une durée
  par défaut strictement positive.
- Famille résistance → zéro gramme recommandé, quelles que soient la durée et
  l'IOB.
- Famille intermittente → strictement moins de grammes qu'aérobie à durée,
  glycémie et IOB identiques, et le message de risque décalé est présent.
- IOB élevé → plus de grammes qu'IOB faible, même sport, même durée.
- Le total ne dépasse jamais `MAX_PRE_SPORT_CARBS_G`, y compris sur une durée
  de 180 min avec IOB élevé et glycémie basse.
- Une fenêtre de départ au-delà de 120 min ne renvoie aucun chiffre mais le
  message « re-vérifie ».
- Un `CarbEntry` portant `sportSessionId` n'entre pas dans `insulinNeededU` ni
  dans les repas analysés par `lib/dose-validation.ts`, mais compte bien dans
  les grammes de COB.
- Une séance annulée n'est pas retenue par `findMostRecentExercise`.
- Une séance dont la fin est dans le futur n'est pas retenue non plus.
