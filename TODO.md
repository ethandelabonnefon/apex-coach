# TODO — chantiers connus

> Bugs et améliorations identifiés mais non-fixés (par choix de priorisation).
> Quand on revient dessus, ce fichier doit avoir tout le contexte pour
> qu'on n'ait pas à re-investiguer.

---

## 🚨 [P0 — SANTÉ] Split dose notifs : pipeline serveur

**Constaté** : juin 2026, Ethan rate régulièrement les notifs split dose quand l'app est fermée. Critique car ces doses couvrent les FPU (lipides/protéines) et leur oubli = hyperglycémie post-prandiale tardive systématique.

### Root cause

Le code actuel (`app/diabete/page.tsx` ligne ~509) déclenche la notif via un `useEffect` qui ne tourne **que si la page /diabete est montée**. Comportement observé :

| Situation | Notif reçue |
|---|---|
| App ouverte sur /diabete pendant 2h | ✅ |
| App fermée / sur autre page / device en veille | ❌ |

Les splits sont stockés uniquement dans Zustand persist (localStorage). Aucun stockage serveur, aucun cron pour déclencher.

Bug secondaire : path icon dans la notif = `/icons/icon-192.png` (n'existe pas, c'est `icon-192x192.png` depuis le rebrand).

### Plan de fix (~30 min)

À implémenter comme pipeline parallèle au système glucose (`/api/cron/glucose-check`) qui marche déjà.

1. **`lib/split-reminders/store.ts`** — KV helpers :
   - `saveSplitReminder(reminder)` → `kv.set("split:reminders", [...list, reminder])`
   - `getDueSplitReminders(now)` → filter ceux dont triggerAt ≤ now et status === pending
   - `markFired(id)`, `removeReminder(id)`
2. **`lib/split-reminders/check.ts`** — fonction `checkSplitsAndAlert()` :
   - Charge les reminders dus
   - Pour chaque : `sendGlucosePush({ type: "split", title: "Rappel split dose", body: "Il est temps de faire Xu pour couvrir les graisses/protéines", url: "/diabete" })` (renommer `sendGlucosePush` en `sendPush` ou créer un helper générique)
   - Marque fired pour ne pas re-déclencher
3. **API routes** :
   - `POST /api/split/schedule` : body `{ id, units, triggerAt, parentInjectionId }` → `saveSplitReminder()`
   - `DELETE /api/split/cancel?id=...` → `removeReminder(id)`
4. **`app/api/cron/split-check/route.ts`** : copie le pattern `glucose-check`, appelle `checkSplitsAndAlert()`
5. **`vercel.json`** : ajouter cron entry :
   ```json
   {
     "crons": [
       { "path": "/api/cron/split-check", "schedule": "* * * * *" }
     ]
   }
   ```
   (1 min = précis. Si Vercel hobby tier limite à 5 min, accepter 5 min.)
6. **Côté client (`app/diabete/page.tsx`)** :
   - À la création d'un split (ligne ~449 `addSplitDoseReminder`), POST aussi vers `/api/split/schedule` en fire-and-forget (catch silencieux pour ne pas bloquer l'UX)
   - À la confirmation (`handleConfirmSplitDose`) ou dismiss : DELETE `/api/split/cancel`
   - Le useEffect côté client reste, mais en backup (cas où le user a l'app ouverte → notif locale + serveur, deduplication via tag)
7. **Fix path icon** : `/icons/icon-192.png` → `/icons/icon-192x192.png`
8. **Migration douce** : au mount de la page /diabete, push vers le serveur tous les splits en local qui n'ont pas encore été schedulés (flag `syncedToServer: boolean` dans le type)

### Tests à valider après fix

- [ ] Créer un split (test rapide : triggerAt dans 90s) → fermer l'app → recevoir la notif sur iPhone
- [ ] Créer un split → confirmer la dose dans l'app → cron suivant ne ré-envoie pas
- [ ] Créer un split sans réseau → réseau revient → sync ok au prochain mount
- [ ] Path icon correct dans la notif iOS

### Workarounds en attendant le fix

Pour Ethan, en attendant que ce TODO soit traité :

1. **Garder l'app PWA ouverte sur /diabete** entre l'injection initiale et le timing du split (2-3h). Le useEffect tournera et déclenchera la notif locale.
2. **Mettre une alarme iPhone manuelle** au moment de l'injection initiale, calée sur le triggerAt du split (ex: "Split dose 2U" à 14h00). Solution low-tech mais 100% fiable.
3. **Setter un timer Apple Watch** depuis l'app native si elle est sur le poignet.
4. **Vérifier l'app à 13h45 et 14h15** pour les repas du midi (la page /diabete affiche la liste des splits pending même si la notif est ratée).

---

## 🟡 [P2 — Brand] Bottom nav : couleur d'onglet actif

L'onglet actif de la bottom nav garde la hue catégorielle de la page (T1D = lavender, Running = sky, etc.). Le brand guide dit "toujours lime quel que soit l'onglet". À migrer dans un futur pass.

Fichier : `components/navigation.tsx`

---

## 🟡 [P2 — Brand] HypoFeedback : remplacer emojis par icônes lucide

Dérogation tolérée à la règle "no emojis in UI". Les ✅/⚠️/🔻 dans `components/diabete/HypoFeedback.tsx` doivent passer en `<CheckCircle />`, `<AlertTriangle />`, `<TrendingDown />`.

---

## 🟡 [P2 — Brand] Audit /muscu et /nutrition

Ces 2 pages n'ont pas été passées au crible post-rebrand. Vérifier qu'aucun gradient hors palette, aucun token legacy n'y traîne.
