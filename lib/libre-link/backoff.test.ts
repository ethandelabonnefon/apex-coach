/**
 * Tests du backoff escaladant côté LibreLink (incident du 7 oct. 2026).
 *
 * Ce jour-là, Abbott a d'abord bloqué le compte (« AcceptDocument »), puis
 * — une fois le document accepté — a renvoyé un **429**. Le palier unique
 * de 120 s était plus court que le cron glucose-check (5 min) : chaque
 * passage du cron retentait un login, et le rate-limit ne pouvait jamais
 * expirer. Le système entretenait son propre blocage ; Ethan est resté
 * sans glycémie live.
 *
 * Run: npm test
 */

import test from "node:test";
import assert from "node:assert/strict";
import { backoffSecondsFor, LIBRE_LINK_CONFIG } from "./config";

test("LE test de l'incident : le dernier palier dépasse le cron de 5 min", () => {
  // C'est la propriété qui corrige le bug. Tant que le backoff maximal
  // reste sous 300 s, chaque passage du cron relance une tentative et le
  // 429 ne retombe jamais.
  const CRON_INTERVAL_S = 300;
  const max = backoffSecondsFor(99);
  assert.ok(
    max > CRON_INTERVAL_S,
    `le palier maximal (${max}s) doit dépasser l'intervalle du cron (${CRON_INTERVAL_S}s)`,
  );
});

test("l'escalade est monotone et plafonnée", () => {
  const ladder = LIBRE_LINK_CONFIG.errorBackoffLadderSeconds;
  for (let n = 1; n < ladder.length; n++) {
    assert.ok(
      backoffSecondsFor(n + 1) > backoffSecondsFor(n),
      `échec #${n + 1} doit attendre plus longtemps que #${n}`,
    );
  }
  const last = ladder[ladder.length - 1];
  assert.equal(backoffSecondsFor(ladder.length), last);
  assert.equal(backoffSecondsFor(ladder.length + 5), last, "plafonné au dernier palier");
  assert.equal(backoffSecondsFor(1000), last);
});

test("le premier échec garde le délai court — une panne passagère ne pénalise pas", () => {
  assert.equal(backoffSecondsFor(1), LIBRE_LINK_CONFIG.errorBackoffLadderSeconds[0]);
});

test("entrées aberrantes : on retombe sur le palier le plus court, jamais NaN", () => {
  for (const bad of [0, -3, NaN, Infinity]) {
    const v = backoffSecondsFor(bad);
    assert.ok(Number.isFinite(v) && v > 0, `backoffSecondsFor(${bad}) doit rester un délai valide`);
  }
});

test("au bout d'une heure de panne, Abbott n'est sollicité qu'une poignée de fois", () => {
  // Simulation : on enchaîne les échecs en avançant d'autant que le
  // backoff demandé. Avant le correctif (palier fixe 120 s), une heure
  // valait 30 tentatives.
  let elapsed = 0;
  let attempts = 0;
  while (elapsed < 3600) {
    attempts++;
    elapsed += backoffSecondsFor(attempts);
  }
  assert.ok(attempts <= 6, `attendu ≤ 6 tentatives sur une heure, reçu ${attempts}`);
});

// ─── Message actionnable (incident du 7 oct. 2026) ──────────────────────

import { libreLinkActionHint } from "./config";

test("le message d'Abbott devient une consigne que l'écran peut afficher", () => {
  const abbott =
    "Additional action required for your account: AcceptDocument. Please login via app and perform required steps and try again.";
  const hint = libreLinkActionHint(abbott);
  assert.ok(hint, "une consigne doit sortir — c'est tout l'objet du correctif");
  assert.match(hint!, /LibreLink Up/, "elle doit nommer l'app à ouvrir");
  assert.match(hint!, /accepte/i, "et le geste à faire");
});

test("rate-limit et backoff : on dit d'attendre, jamais de rafraîchir", () => {
  const rl = libreLinkActionHint("Cannot read properties of undefined (reading 'token')");
  assert.ok(rl && /réessaiera|réessaye/i.test(rl));
  const bo = libreLinkActionHint("LibreLink backoff actif (77s restants) — dernière erreur : …");
  assert.ok(bo && /inutile de rafraîchir/i.test(bo), "surtout ne pas inviter à retaper");
});

test("erreur inconnue : aucune consigne inventée", () => {
  assert.equal(libreLinkActionHint("ECONNRESET"), null);
  assert.equal(libreLinkActionHint(null), null);
  assert.equal(libreLinkActionHint(""), null);
});
