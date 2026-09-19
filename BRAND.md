# APEX — Brand Guide

> Document de référence pour toute décision de design, copy ou identité.
> Avant chaque PR qui touche à du visible : checker la "Ship checklist" en fin de doc.

Dernière révision : septembre 2026 — **brand v5 "Instrument"** (tableau de bord d'endurance et de santé métabolique). Remplace la v2/v4 "Apple Health".

---

## 1. Promesse de marque

> **APEX, c'est l'instrument de bord de l'athlète diabétique.**

Pas "coach", pas "tracker", pas "app", pas "assistant IA". **Instrument.** Mot qui porte la précision, la fiabilité, le fait que l'utilisateur n'agit pas sans le consulter.

Public cible : un athlète qui vit avec un T1D (séances de force + running + nutrition + glycémie). Veut un outil **médical-grade qui ne ralentit pas la perf**, pas une app gamifiée ni un magazine lifestyle.

**Direction visuelle v5** : tableau de bord d'endurance et de santé métabolique — précis, rassurant, personnel. Gris bleuté, anthracite, blanc cassé. Trois couleurs qui signifient chacune une chose (cobalt = cardio, vert = glycémie, ambre = alerte). Chaque couleur et chaque forme signale une information ; rien n'est décoratif. Ton d'un coach expert et calme.

---

## 2. Logoform : Pulse Cockpit

Le logo est un **signal ECG dont le pic anguleux forme un A** via la barre horizontale médiane.

```
         ●
        ╱╲
       ╱  ╲
   ───╱─A──╲───
      ╱    ╲
     ╱      ╲
    ─        ─
```

- **Signature** : raconte la double identité performance (le pic) + instrument médical (le signal) en une seule forme
- **Composant** : `<Logo size={28} withWordmark tagline="Tableau de bord" />` (cf. `components/Logo.tsx`)
- **SVG canonique** : `public/favicon.svg` — toutes les déclinaisons PNG sont générées depuis là
- **Couleur stroke** : cobalt `#1F4FD8` (hérite de `var(--accent)`), jamais autre chose

**Variantes autorisées** :
- LogoMark seul (sans wordmark) : favicon, splash, App Store icon
- Logo + wordmark "APEX" : header partout
- Logo + wordmark + tagline "Tableau de bord" : sidebar desktop, splash

**À ne jamais faire** :
- Changer la couleur du dot au sommet (toujours = couleur stroke)
- Ajouter un fond derrière le logo (sauf icônes packagées 192/512)
- Étirer / déformer / mettre un drop shadow

---

## 3. Voice & tone

| Règle | Détail | ✅ | ❌ |
|---|---|---|---|
| **Tutoiement systématique** | Athlète, pas patient | "Tu as fait une hypo à 65" | "Vous avez fait une hypoglycémie" |
| **Précis, pas froid** | Chiffres + verbe simple + raison courte | "12g recommandés. Ton GRG perso = 4,5 mg/dL/g" | "Veuillez consommer 12g de glucides selon votre profil" |
| **Jargon T1D explicité au premier usage** | "Diabète T1 (T1D)" la 1ʳᵉ fois, "T1D" autorisé après | "Diabète T1" en onboarding | "T1D" sans contexte sur l'écran de découverte |
| **Pas d'emoji dans l'UI** | Icônes lucide-react à la place | `<AlertTriangle />` | 🎉 ⚡ ✨ dans une carte |
| **Salutations contextuelles** | Heure + prénom | "Bonsoir, Ethan." | "Hello !" |
| **Brièveté > exhaustivité** | Le moins de mots qui transmet le sens | "Hypo détectée — 65 mg/dL" | "Une hypoglycémie a été détectée par votre capteur, votre niveau actuel est de 65 milligrammes par décilitre" |
| **Pas de marketing pur** | On informe, on ne vend pas | "Re-sucrage parfait." | "Bravo, tu as géré comme un champion !" |
| **Recommandations à la 2ᵉ personne** | Direct mais respectueux | "Mange 12g." | "Il est recommandé que vous mangiez 12g." |

**Décisions de copy figées** :
- Une hypoglycémie = "une hypo" (raccourci adopté)
- "Glycémie" jamais "taux de sucre" / "glucose sanguin"
- "Bolus" et "IOB" autorisés (vocabulaire T1D natif)
- "Strain", "Recovery" pour Whoop (anglais conservé, c'est le jargon)
- Toujours "Whoop" jamais "WHOOP" malgré la marque officielle

---

## 4. Couleurs — Règle d'or

Palette **v5 "Instrument"** (tokens dans `app/globals.css`). Chaque couleur a un sens unique ; on ne colore jamais pour décorer.

| Rôle | Light | Dark | Tokens |
|---|---|---|---|
| **Cobalt** — cardio, interactif | `#1F4FD8` | `#6D8DF0` | `--accent`, `--running`, `--info`, `--chart-1` |
| **Vert** — glycémie, validé | `#178C5E` | `#3FB489` | `--diabete`, `--success`, `--glucose-normal`, `--chart-4` |
| **Ambre** — alerte, à surveiller | `#C97B12` | `#E39A34` | `--warning`, `--glucose-low`, `--glucose-high`, `--chart-3` |
| **Rouge sourd** — critique | `#B23A3A` | `#D9605A` | `--error`, `--glucose-critical`, `--chart-5` |
| **Anthracite** — force, actions primaires, texte | `#1E252D` | `#EEF1F4` | `--text-primary`, `--muscu` |
| **Acier** — nutrition, neutre secondaire | `#5B6B7A` | `#9AA8B5` | `--nutrition`, `--accent-2`, `--chart-2` |

### Ce que chaque couleur a le droit de dire

- **Cobalt** : liens, focus, onglet actif de la nav, tout ce qui est running / FC / zones, bouton d'action cardio.
- **Vert** : la valeur de glycémie, les courbes de glucose, l'AGP, les coches de série validée, le bouton « Enregistrer l'injection ».
- **Ambre** : feu Whoop jaune, pattern détecté, créneau « à revoir », hypo post-effort, deload, jour du départ. **Uniquement** alerte / à surveiller — jamais un CTA, jamais un titre.
- **Anthracite** : boutons primaires (`Button variant="primary"`), calendrier « fait », muscu / force.
- **Acier** : nutrition, ex-indigo « IA », tout ce qui doit rester neutre.

### ❌ Interdits absolus

- Titre ou mot coloré pour l'effet (un titre est anthracite, point)
- CTA primaire dans une hue catégorielle
- Background de section saturé (les tints 10 % max, toujours avec bordure au 30 %)
- Gradient, halo (`blur-3xl`), glow, ombre colorée, effet verre
- Toute couleur hors de ce tableau — pas de lime, pas de rose, pas d'indigo, pas de bleu iOS

---

## 5. Surfaces

| Token | Light | Dark | Usage |
|---|---|---|---|
| `--bg-primary` | `#EEF1F4` | `#14191F` | Body, fond gris bleuté |
| `--bg-secondary` | `#FBFCFD` | `#1C232B` | `surface-1` — cartes blanc cassé |
| `--bg-tertiary` | `#E9EDF1` | `#252D36` | `surface-2` — insets dans les cartes |
| `--bg-elevated` | `#FFFFFF` | `#252D36` | `surface-3` — modal, sheet |
| `--border-default` | `#D9E0E7` | `#2E3843` | Bordure de carte, séparateurs |
| `--border-subtle` | `#EAEEF2` | `#242C35` | Séparateurs de lignes internes |

La hiérarchie vient **de la bordure fine 1 px**, pas de l'ombre (`--card-shadow` quasi nulle) ni du dégradé. Headers et bottom nav sont **opaques** avec une bordure : l'ancien `.glass` translucide est neutralisé.

Rayons : `--radius-sm 6` (chips, badges) · `--radius-md 8` (boutons, inputs) · `--radius-lg 12` (cartes) · `--radius-2xl 16` (max, sheets). **Plus de capsule** : `rounded-full` est réservé aux points, LED, rings et aux commutateurs.

---

## 6. Typographie

### Familles (chargées par `next/font` dans `app/layout.tsx`)

| Rôle | Police | Variable | Classes |
|---|---|---|---|
| Titres | **Bricolage Grotesque** 500-700 | `--font-display` | `h1`-`h3`, `.disp`, `.t-hero` → `.t-tagline`, `font-display` |
| Texte | **Instrument Sans** 400-700 | `--font-sans` | body, `.t-body`, `.t-caption` |
| Données | **IBM Plex Mono** 400-600 | `--font-mono` | `.num`, `.num-hero`, `.mono`, `.label`, `Badge`, `Input` |

### Règle d'or

**Tout ce qui est mesuré est en mono.** Glycémie, BPM, RPE, charges, durées, dates, pourcentages, unités : `.num` ou `.mono`. C'est la signature visuelle de l'instrument. Le texte explicatif est en Instrument Sans ; les titres en Bricolage, jamais en italique, jamais colorés.

### Échelle

| Classe | Rendu |
|---|---|
| `.num-hero` | mono 500, tracking −0.03em — valeur héros (glycémie, dose) |
| `.num` | mono 500, tabular — toute donnée dans une carte |
| `.label` | mono 10.5px uppercase, tracking 0.08em, gris — en-tête de section |
| `.t-display-md` / `h1` | Bricolage 600, 28px |
| `.t-tagline` / `h2` | Bricolage 600, 18px |
| `.t-body` | Instrument Sans 400, 15px |

---

## 7. Composants

### Boutons (`components/ui/Button.tsx`)

| Variant | Style | Usage |
|---|---|---|
| **primary** | anthracite + texte clair, `rounded-lg` | CTA principal (1 max par écran) |
| **accent** | cobalt | action cardio (démarrer un run, enregistrer une sortie) |
| **success** | vert | enregistrer une injection, valider une dose |
| **secondary** | carte bordée | actions secondaires |
| **ghost** | texte, fond transparent | tertiaire (annuler, liens) |
| **danger** | bordure rouge sourd, fond carte | destructif, toujours avec confirmation |

### Cartes

- `.surface-1` (bordée) par défaut ; `Card variant="bordered"` équivalent
- En-tête de carte : titre Bricolage + séparateur `border-subtle` en dessous, métadonnée mono à droite
- **Grille de métriques** : cellules séparées par des traits (`divide`), valeur mono 24px, libellé 11px gris dessous
- **Indicateur de statut** : LED 10 px (`rounded-full`) devant le libellé — vert / ambre / cobalt / acier — ou carré 8 px dans les calendriers

### Alertes

Encadré bordé + fond 10 % : ambre avec icône triangle (`AlertTriangle`) pour alerte, vert pour validation, cobalt pour information. Jamais de bandeau plein.

### Tap feedback

`.tap-scale` conservé (scale 0.97 sur active). Pas de `hover-lift`, pas d'animation décorative.

---

## 8. Iconographie

- **Bibliothèque** : `lucide-react` uniquement, **au trait** (jamais `fill`)
- **Navigation** : `LayoutDashboard` (Overview), `CalendarDays` (Séances), `Footprints` (Running), `Apple` (Nutrition), `Droplet` (T1D), `UserRound` (Profil). Onglet actif = cobalt + barre 2 px en haut.
- **Taille** : 14, 16, 18, 22 selon contexte · stroke 1.7 (inactif) / 2 (actif)
- **Pas d'emoji dans l'UI** — les ressentis de run utilisent des glyphes mono (`++ + = − −−`)

---

## 9. Composants tabou

- ❌ Fond crème / papier, serif, titres italiques ou colorés
- ❌ Capsules (`rounded-full` sur un bouton, un chip, une tab bar)
- ❌ Halos (`blur-3xl`), glows, ombres colorées, effet verre, gradients
- ❌ Bleu iOS `#007AFF`, indigo, rose, lime — toute couleur hors §4
- ❌ Ton « assistant IA » dans la copy (« Je suis là pour t'aider ! ») — on est un instrument, pas un chatbot
- ❌ Logos template Next.js

---

## 10. Ship checklist (avant chaque deploy prod)

- [ ] Aucune couleur hors du tableau §4 (grep hex dans `app/` et `components/`)
- [ ] Toute donnée numérique porte `.num` / `.mono`
- [ ] Aucun `rounded-full` hors points / LED / rings / switch
- [ ] Aucun `blur-3xl`, `glow-*`, gradient
- [ ] Aucun emoji nouveau dans l'UI
- [ ] Ambre = alerte uniquement ; aucun titre coloré
- [ ] `npm test` 416+ verts, `npm run build` clean
- [ ] Light **et** dark vérifiés dans le preview

---

## 11. Évolutions prévues (roadmap brand)

- **Q4 2026** : module calendrier & séances dans ce langage (grille semaine, coches, feu Whoop)
- **Q4 2026** : audit accessibilité WCAG 2.1 AA complet (contrastes ambre sur fond 10 %)
- **2027** : LogoMark animé (le dot pulse) pour splash screen et notifications

---

> **Source canonique** : `BRAND.md` (ce fichier) + `app/globals.css` (tokens) + `components/Logo.tsx`.
> Prototypes de référence : `/Users/ethandelabonnefon/Test/apex-hybrid-prototype.html` et `apex-global-prototype.html`.
> Tout désaccord entre code et brand guide → brand guide gagne, code à corriger.
