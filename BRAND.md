# APEX — Brand Guide

> Document de référence pour toute décision de design, copy ou identité.
> Avant chaque PR qui touche à du visible : checker la "Ship checklist" en fin de doc.

Dernière révision : juin 2026 (post audit branding).

---

## 1. Promesse de marque

> **APEX, c'est l'instrument de bord de l'athlète diabétique.**

Pas "coach", pas "tracker", pas "app". **Instrument.** Mot qui porte la précision, la fiabilité, le fait que l'utilisateur n'agit pas sans le consulter.

Public cible : un athlète qui vit avec un T1D (musculation + running + nutrition + glycémie). Veut un outil **médical-grade qui ne ralentit pas la perf**, pas une app gamifiée.

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
- **Couleur stroke** : lime `#D4FF00`, jamais autre chose (sauf cas spécifique sur surface claire → indigo `#3D2BFF`)

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

### Accent primaire unique

**Lime `#D4FF00`** est la seule couleur de marque. Elle apparaît sur :

- Logo (stroke + dot)
- **Tous les CTA primaires** de toutes les pages
- Focus rings (`:focus-visible`)
- Selection (`::selection`)
- Glow signature des hero cards (`glow-accent`)
- Onglet actif de la bottom nav

### Hues catégorielles : strictement données

Les 4 couleurs catégorielles existent :
- `--muscu` lime (`#D4FF00`)
- `--running` sky (`#7FC7FF`)
- `--nutrition` amber (`#FFAE5C`)
- `--diabete` lavender (`#B4A7FF`)

Elles sont **uniquement des codes de données** :
- Badges discrets
- Icônes d'item de liste (lucide)
- Lignes / aires de chart
- Bordures latérales fines (`border-l-2`)
- Halos `accent-2-glow` autorisés sur cartes data lavender

### ❌ Interdits absolus

- CTA primaire dans une hue catégorielle
- Halo / glow hero card dans une hue catégorielle
- Background de section coloré
- Onglet actif coloré différemment selon la page
- Gradient à plus de 2 stops
- Gradient hors palette (le FAB chat rose/violet doit être migré vers lime ou bg-tertiary discret)

### Semantic states

- `--success` `#7AE582` — re-sucrage OK, glycémie en plage
- `--warning` `#FFAE5C` — over-bolus détecté, IOB important
- `--error` `#FF6B6B` — hypo critique, déconnexion CGM
- `--info` `#7FC7FF` — info neutre, hint

### Glucose scale (médical, ne pas toucher)

- `--glucose-low` `#FF6B6B`
- `--glucose-normal` `#7AE582`
- `--glucose-high` `#FFAE5C`
- `--glucose-critical` `#FF3B3B`

---

## 5. Surfaces

### Mode primary (par défaut)

Toute l'app est sur fond noir chaud zinc. 3 niveaux de profondeur :

| Token | Hex | Usage |
|---|---|---|
| `--bg-primary` | `#0A0A0B` | Body, fond global |
| `--bg-secondary` | `#111113` | `surface-1` — cards principales |
| `--bg-tertiary` | `#18181B` | `surface-2` — cards imbriquées, badges |
| `--bg-elevated` | `#1F1F23` | `surface-3` — modal, popover, sheet |
| `--bg-hover` | `#26262B` | États hover |

Profondeur via background, **pas via border**. Les bordures sont des séparateurs subtils (`--border-subtle` 6%, `--border-default` 10%, `--border-strong` 16%), pas des contenants.

### Mode "surface claire" (Voie A — usage parcimonieux)

Pour les **contextes de lecture longue** uniquement : rapport hebdo, journal nutritionnel imprimable, historique compact d'une séance.

- Background carte : `#FAFAFA` (off-white)
- Texte primaire : `#0A0A0B`
- Texte secondaire : `#52525B`
- Accent dans ce contexte : **indigo `#3D2BFF`** (le lime ne passe pas sur clair → contraste 1.4:1)
- Bordure : `rgba(0,0,0,0.06)`
- Pas plus d'**une carte claire par écran** (évite la cassure d'identité)

À ce stade, la voie A n'est **pas encore implémentée** : on l'introduira progressivement sur les futurs rapports.

---

## 6. Typographie

### Familles

- **Texte UI** : `Geist Sans` (déjà chargé via `next/font/google`)
- **Chiffres / métriques** : `Geist Mono` avec tabular-nums activé via `.num` / `.num-hero`
- **Pas de JetBrains Mono** (le CSS legacy `--font-mono: "JetBrains Mono"` doit pointer vers Geist Mono)

### Échelle

| Classe utilitaire | Usage |
|---|---|
| `.num-hero` (Geist Mono, 500, -0.04em) | Métriques hero (glycémie 113, durée séance) |
| `.num` (Geist Mono, tabular) | Toute donnée numérique dans une card |
| `.label` (10px uppercase tracking 0.08em) | Label cockpit au-dessus d'une métrique |
| `text-text-primary` `#FAFAFA` | Texte de contenu principal |
| `text-text-secondary` `#A1A1AA` | Sous-titre, explication |
| `text-text-tertiary` `#71717A` | Caption, metadata |

### Règles

- Letter-spacing global : `-0.01em` (déjà sur `body`)
- Hero numérique : `letter-spacing: -0.04em` (signature `.num-hero`)
- Labels uppercase : tracking `+0.08em` (signature cockpit)
- Pas de italic dans l'UI (sauf citations / quotes)
- Font-weight 400 = body, 500 = hero/emphasis, 600 = headings, 700+ jamais

---

## 7. Composants

### Boutons

| Variant | Style | Usage |
|---|---|---|
| **Primary** | `bg-accent` + `text-accent-ink` + `rounded-2xl` | CTA principal d'un écran (1 max) |
| **Secondary** | `bg-bg-tertiary` + `border-border-default` + `text-text-primary` | Actions secondaires |
| **Ghost** | Background transparent + hover `bg-bg-tertiary` | Tertiaires (annuler, fermer) |
| **Icon** | `w-9 h-9 rounded-full` + background discret | Boutons d'icône isolés |

### Cards

- Toujours via `.surface-1` / `.surface-2` / `.surface-3`
- Radius : `--radius-lg` (16px) par défaut, `rounded-3xl` (24px) pour les hero cards
- Padding standard : `p-5` mobile, `p-6` desktop

### Tap feedback

Toujours `.tap-scale` sur les boutons mobiles (transform scale 0.97 sur active).

---

## 8. Iconographie

- **Bibliothèque** : `lucide-react` uniquement
- **Taille** : 14, 16, 20, 24 selon contexte (jamais d'arbitraire)
- **Stroke** : 1.5 ou 2 (par défaut 2)
- **Pas d'emoji dans l'UI** (un assessment de hypo peut tolérer ✅⚠️🔻 mais c'est une dérogation à éliminer dans les futures itérations)

---

## 9. Composants tabou

- ❌ FAB rose/violet hors palette (le bouton chat actuel doit passer en lime ou bg-tertiary)
- ❌ Gradient > 2 stops
- ❌ Border > 1px (sauf focus ring 2px lime)
- ❌ Shadow colorée hors `glow-accent` / `glow-accent-2`
- ❌ Logos template Next.js (`next.svg`, `vercel.svg`, `file.svg`, `globe.svg`, `window.svg`)
- ❌ Classes legacy (`.card`, `.neon-*`, `.glow-green/blue/purple/orange`)
- ❌ Tokens legacy (`--accent-green/blue/purple/orange`, `--bg-card`, `--text-muted`)

---

## 10. Ship checklist (avant chaque deploy prod)

- [ ] Aucune classe `.card` / `.neon-*` / `.glow-green|blue|purple|orange` ajoutée
- [ ] Aucun `--accent-green|blue|purple|orange` ni `--bg-card` / `--text-muted` legacy
- [ ] Aucun emoji nouveau dans l'UI
- [ ] Bouton primaire = lime, pas une hue catégorielle
- [ ] Header `<Logo />` rendu sur toutes les pages
- [ ] Indicateur Next.js dev caché en prod
- [ ] Pas de FAB rose/violet, ou explicitement migré vers la palette
- [ ] `npm run build` clean (zero warning lié à mon code)

---

## 11. Évolutions prévues (roadmap brand)

- **Q3 2026** : introduire mode "surface claire" (Voie A) pour le rapport hebdo
- **Q4 2026** : audit accessibilité WCAG 2.1 AA complet
- **2027** : décliner LogoMark animé (le dot pulse) pour splash screen et notifications

---

> **Source canonique** : `BRAND.md` (ce fichier) + `app/globals.css` (tokens) + `components/Logo.tsx`.
> Tout désaccord entre code et brand guide → brand guide gagne, code à corriger.
