# APEX — Brand Guide

> Document de référence pour toute décision de design, copy ou identité.
> Avant chaque PR qui touche à du visible : checker la "Ship checklist" en fin de doc.

Dernière révision : juillet 2026 — **brand v2 "Apple Health"** (refonte complète light mode, copie conforme du langage visuel de l'app Santé iOS).

---

## 1. Promesse de marque

> **APEX, c'est l'instrument de bord de l'athlète diabétique.**

Pas "coach", pas "tracker", pas "app". **Instrument.** Mot qui porte la précision, la fiabilité, le fait que l'utilisateur n'agit pas sans le consulter.

Public cible : un athlète qui vit avec un T1D (musculation + running + nutrition + glycémie). Veut un outil **médical-grade qui ne ralentit pas la perf**, pas une app gamifiée.

**Direction visuelle v2** : l'app Santé d'Apple. Fond gris groupé, cartes blanches, couleurs système iOS, typographie SF Pro. La hiérarchie vient du blanc sur gris, pas des bordures ni des glows.

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
- **Composant** : `<Logo size={28} withWordmark tagline="Precision Coach" />` (cf. `components/Logo.tsx`)
- **SVG canonique** : `public/favicon.svg` — toutes les déclinaisons PNG sont générées depuis là
- **Couleur stroke** : System Blue `#007AFF` (hérite de `var(--accent)`), jamais autre chose

**Variantes autorisées** :
- LogoMark seul (sans wordmark) : favicon, splash, App Store icon
- Logo + wordmark "APEX" : header partout
- Logo + wordmark + tagline "Precision Coach" : sidebar desktop, splash

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

Palette = **couleurs système iOS**, exclusivement. Aucune couleur hors de cette liste.

### Accent primaire unique

**System Blue `#007AFF`** est la seule couleur d'action. Elle apparaît sur :

- Logo (stroke + dot)
- **Tous les CTA primaires** de toutes les pages (`bg-accent` + `text-white`)
- Liens et boutons texte (comme "Afficher toutes les données" dans Santé)
- Focus rings (`:focus-visible`)
- Selection (`::selection` en bleu 25%)

### Hues catégorielles : strictement données

Les 4 couleurs catégorielles existent (mapping app Santé) :
- `--muscu` orange `#FF9500` — activité / effort (la flamme Santé)
- `--running` rose `#FF2D55` — cardio / fréquence cardiaque
- `--nutrition` vert `#34C759` — alimentation / eau
- `--diabete` indigo `#5856D6` — clinique (comme Sommeil dans Santé)

Elles sont **uniquement des codes de données** :
- Icônes colorées de titre de carte (signature Santé : icône + label colorés, contenu noir)
- Badges discrets, tint backgrounds à 10%
- Lignes / aires de chart
- Onglet actif de la bottom nav (chaque module dans sa hue, comme les icônes Santé)

### ❌ Interdits absolus

- CTA primaire dans une hue catégorielle
- Background de section coloré saturé (les tints 10% max)
- Gradient à plus de 2 stops
- Néons, glows lumineux, ombres colorées (l'époque dark v1 est finie)
- Toute couleur hors palette système iOS

### Semantic states (système iOS)

- `--success` `#34C759` — re-sucrage OK, glycémie en plage
- `--warning` `#FF9500` — over-bolus détecté, IOB important
- `--error` `#FF3B30` — hypo critique, déconnexion CGM
- `--info` `#007AFF` — info neutre, hint

### Glucose scale (médical, ne pas toucher)

- `--glucose-low` `#FF3B30`
- `--glucose-normal` `#34C759`
- `--glucose-high` `#FF9500`
- `--glucose-critical` `#FF2D55`

---

## 5. Surfaces

### Light mode (unique)

Toute l'app est en clair, hiérarchie "blanc sur gris" de l'app Santé :

| Token | Hex | Usage |
|---|---|---|
| `--bg-primary` | `#F2F2F7` | Body, fond global (systemGroupedBackground) |
| `--bg-secondary` | `#FFFFFF` | `surface-1` — cartes principales |
| `--bg-tertiary` | `#F2F2F7` | `surface-2` — insets dans les cartes |
| `--bg-elevated` | `#FFFFFF` | `surface-3` — modal, popover, sheet (+ ombre) |
| `--bg-hover` | `#E5E5EA` | États hover / pressed |

Profondeur via le contraste blanc/gris + ombre quasi imperceptible (`--card-shadow`), **pas via border**. Les bordures sont des séparateurs hairline iOS (`rgba(60,60,67,…)` à 10/18/29%), pas des contenants.

Headers et bottom nav : `.glass` translucide clair (`rgba(242,242,247,0.82)` + blur 20px), comme les barres de navigation iOS.

---

## 6. Typographie

### Familles

- **Texte UI** : SF Pro via `-apple-system` — **exactement la police de l'app Santé**. Aucune webfont chargée (Geist/Inter supprimées de `layout.tsx`), fallback système natif (Segoe UI / Roboto) hors Apple
- **Chiffres / métriques** : SF Pro **bold + tabular-nums** via `.num` / `.num-hero` (comme les gros chiffres de Santé — plus de mono)

### Échelle

| Classe utilitaire | Usage |
|---|---|
| `.num-hero` (sans, 700, tabular) | Métriques hero (glycémie 113, pas du jour) |
| `.num` (sans, 600, tabular) | Toute donnée numérique dans une card |
| `.label` (11px uppercase, 600) | Label de section au-dessus d'une métrique |
| `text-text-primary` `#000000` | Texte de contenu principal |
| `text-text-secondary` `#6D6D72` | Sous-titre, explication |
| `text-text-tertiary` `#8E8E93` | Caption, metadata |

### Règles

- Letter-spacing global : `-0.01em` (déjà sur `body`)
- Pas de italic dans l'UI (sauf citations / quotes)
- Font-weight 400 = body, 600 = données/headings, 700 = hero numérique (style Santé)

---

## 7. Composants

### Boutons

| Variant | Style | Usage |
|---|---|---|
| **Primary** | `bg-accent` (bleu) + `text-white` + pill/`rounded-2xl` | CTA principal d'un écran (1 max) |
| **Secondary** | `bg-bg-hover` ou `bg-black/[0.06]` + `text-text-primary` | Actions secondaires |
| **Ghost** | Texte bleu accent, background transparent | Tertiaires (annuler, liens) |
| **Icon** | `w-9 h-9 rounded-full` + background blanc/gris | Boutons d'icône isolés |

### Cards

- Toujours via `.surface-1` / `.surface-2` / `.surface-3` (ou `.card` legacy = même rendu)
- Radius : `--radius-lg` (16px) par défaut, `rounded-3xl` (24px) pour les hero cards
- Padding standard : `p-5` mobile, `p-6` desktop
- Pattern signature Santé : icône + titre colorés par catégorie, contenu en noir

### Tap feedback

Toujours `.tap-scale` sur les boutons mobiles (transform scale 0.97 sur active).

---

## 8. Iconographie

- **Bibliothèque** : `lucide-react` uniquement
- **Navigation (bottom nav + sidebar)** : icônes **remplies** (`fill="currentColor"`) façon SF Symbols / onglets Santé — Heart (Overview, comme l'onglet Résumé), Flame (Muscu, comme Activité), Footprints (Running, reste en outline), Apple (Nutrition), Droplet (T1D)
- **Taille** : 14, 16, 20, 24 selon contexte (jamais d'arbitraire)
- **Stroke** : 1.5 ou 2 (par défaut 2)
- **Pas d'emoji dans l'UI** (dérogations existantes à éliminer progressivement)

---

## 9. Composants tabou

- ❌ Tout retour au dark mode ou aux néons v1 (lime `#D4FF00`, glows lumineux)
- ❌ Gradient > 2 stops
- ❌ Border > 1px (sauf focus ring 2px bleu)
- ❌ Shadow colorée
- ❌ Logos template Next.js (`next.svg`, `vercel.svg`, `file.svg`, `globe.svg`, `window.svg`)
- ❌ Couleurs hors palette système iOS

---

## 10. Ship checklist (avant chaque deploy prod)

- [ ] Aucune couleur hors palette système iOS (pas de lime, pas de néon)
- [ ] Aucun `text-white` / `bg-white/[…]` hérité du dark mode sur fond clair
- [ ] Aucun emoji nouveau dans l'UI
- [ ] Bouton primaire = bleu `#007AFF`, pas une hue catégorielle
- [ ] Header `<Logo />` rendu sur toutes les pages
- [ ] Indicateur Next.js dev caché en prod
- [ ] `npm run build` clean (zero warning lié à mon code)

---

## 11. Évolutions prévues (roadmap brand)

- **Q3 2026** : dark mode système (palette iOS dark : `#000000` + `#1C1C1E`), suivant `prefers-color-scheme`
- **Q4 2026** : audit accessibilité WCAG 2.1 AA complet
- **2027** : décliner LogoMark animé (le dot pulse) pour splash screen et notifications

---

> **Source canonique** : `BRAND.md` (ce fichier) + `app/globals.css` (tokens) + `components/Logo.tsx`.
> Tout désaccord entre code et brand guide → brand guide gagne, code à corriger.
