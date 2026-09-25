"use client";

/**
 * Séance du programme Phase 0 (sept. 2026).
 *
 * Muscu : saisie série par série (charge / reps / RPE / ✓), pré-remplie
 * par la charge suggérée (dernière séance + règle de progression Notion),
 * feu Whoop en bandeau avec le −20 % en SUGGESTION (bouton, jamais
 * appliqué d'office), glycémie avant / après.
 * Le brouillon est enregistré à chaque saisie (statut « en cours ») : fermer
 * l'app en pleine séance ne perd rien.
 *
 * « Terminer » écrit le journal ET un `completedWorkout` daté de l'heure de
 * début réelle — c'est lui qu'utilisent la corrélation sport-glucose et la
 * sensibilité post-exercice du diabète.
 *
 * Run : consignes, lien vers le tracker GPS, et clôture simple (durée, RPE,
 * glycémie). Les sorties GPS restent enregistrées par /running.
 */

import Link from "next/link";
import { use, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, MapPin, RotateCcw, AlertTriangle } from "lucide-react";
import { useStore } from "@/lib/store";
import { useWhoop } from "@/hooks/useWhoop";
import { useGlucose } from "@/hooks/useGlucose";
import { WORKOUT_TEMPLATES, isWorkoutKind, type ExerciseTemplate } from "@/lib/training/phase0";
import {
  emptySets,
  exerciseName,
  getSession,
  parseLocalDate,
  recoveryAdvice,
  roundLoad,
  suggestLoad,
  targetRpe,
  type LoadSuggestion,
  type TrainingExerciseLog,
  type TrainingLog,
  type TrainingSetLog,
} from "@/lib/training/schedule";

function parseNum(v: string): number | null {
  const n = parseFloat(v.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function fmtKg(n: number): string {
  return String(n).replace(".", ",");
}

export default function SeancePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const session = getSession(id);

  const trainingLogs = useStore((s) => s.trainingLogs);
  const upsertTrainingLog = useStore((s) => s.upsertTrainingLog);
  const removeTrainingLog = useStore((s) => s.removeTrainingLog);
  const addCompletedWorkout = useStore((s) => s.addCompletedWorkout);
  const removeCompletedWorkout = useStore((s) => s.removeCompletedWorkout);

  const whoop = useWhoop();
  const { current: liveGlucose } = useGlucose({ mode: "current" });

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 0);
    return () => clearTimeout(t);
  }, []);

  const log: TrainingLog | undefined = trainingLogs.find((l) => l.sessionId === id);
  const template = session && isWorkoutKind(session.kind) ? WORKOUT_TEMPLATES[session.kind] : null;

  const suggestions = useMemo(() => {
    const map = new Map<string, LoadSuggestion>();
    const s = getSession(id);
    if (!s || !isWorkoutKind(s.kind)) return map;
    for (const ex of WORKOUT_TEMPLATES[s.kind].exercises) map.set(ex.id, suggestLoad(ex, s, trainingLogs));
    return map;
  }, [id, trainingLogs]);

  const [rpe, setRpe] = useState<number | null>(null);
  const [glucoseAfter, setGlucoseAfter] = useState("");
  const [durationRun, setDurationRun] = useState("");

  if (!session) {
    return (
      <div className="max-w-[720px] mx-auto px-4 sm:px-6 py-5 lg:py-8">
        <p className="eyebrow">Muscu</p>
        <h1 className="h-title">Séance introuvable</h1>
        <Link href="/muscu" className="mt-4 inline-flex text-sm text-accent">← Retour au calendrier</Link>
      </div>
    );
  }
  if (!mounted) return <div className="max-w-[720px] mx-auto px-4 sm:px-6 py-5 lg:py-8" />;

  const isDone = log?.status === "done";
  const recovery = whoop.connected ? whoop.snapshot?.recoveryScore ?? null : null;
  const advice = recoveryAdvice(recovery);
  const rpeTarget = targetRpe(session);

  // ─── Écriture du brouillon ───────────────────────────
  const baseLog = (): TrainingLog => log ?? { sessionId: id, status: "in-progress" };
  const save = (patch: Partial<TrainingLog>) => {
    const b = baseLog();
    upsertTrainingLog({
      ...b,
      ...patch,
      startedAt: b.startedAt ?? patch.startedAt ?? new Date().toISOString(),
      status: patch.status ?? (b.status === "done" ? "done" : "in-progress"),
    });
  };

  const exerciseLog = (ex: ExerciseTemplate): TrainingExerciseLog =>
    log?.exercises?.find((e) => e.exerciseId === ex.id) ?? { exerciseId: ex.id, sets: emptySets(ex) };

  const updateSet = (ex: ExerciseTemplate, index: number, patch: Partial<TrainingSetLog>) => {
    const current = exerciseLog(ex);
    const sets = current.sets.map((s, i) => (i === index ? { ...s, ...patch } : s));
    const others = (log?.exercises ?? []).filter((e) => e.exerciseId !== ex.id);
    save({ exercises: [...others, { exerciseId: ex.id, sets }] });
  };

  /** Coche une série : les champs vides prennent la valeur suggérée / visée. */
  const toggleSet = (ex: ExerciseTemplate, index: number, factor: number) => {
    const sets = exerciseLog(ex).sets;
    const s = sets[index];
    if (s.done) return updateSet(ex, index, { done: false });
    const sug = suggestions.get(ex.id)?.weight ?? null;
    const reps = parseInt(ex.reps, 10);
    // Série précédente déjà renseignée → même charge (on ne retape pas 4 fois 60).
    const prevWeight = [...sets.slice(0, index)].reverse().find((p) => p.weight !== null)?.weight ?? null;
    updateSet(ex, index, {
      done: true,
      weight: s.weight ?? prevWeight ?? (sug !== null && ex.unit === "kg" ? roundLoad(sug * factor) : null),
      reps: s.reps ?? (Number.isFinite(reps) ? reps : null),
    });
  };

  const loadFactor = log?.loadFactor ?? 1;
  const setLoadFactor = (f: number) => save({ loadFactor: f });

  const glucoseBefore = log?.glucoseBefore;
  const doneSetCount = (log?.exercises ?? []).reduce((n, e) => n + e.sets.filter((s) => s.done).length, 0);
  const totalSets = template ? template.exercises.reduce((n, e) => n + e.sets, 0) : 0;

  const finish = () => {
    const now = new Date();
    const startedAt = log?.startedAt ?? now.toISOString();
    const measured = Math.round((now.getTime() - new Date(startedAt).getTime()) / 60000);
    const durationMin = template
      ? measured >= 10 && measured <= 240 ? measured : 60
      : parseNum(durationRun) ?? session.durationMin ?? 30;
    const after = parseNum(glucoseAfter);
    const finalLog: TrainingLog = {
      ...baseLog(),
      startedAt,
      status: "done",
      doneAt: now.toISOString(),
      durationMin,
      rpe: rpe ?? undefined,
      glucoseAfter: after ?? undefined,
    };
    upsertTrainingLog(finalLog);

    if (template) {
      addCompletedWorkout({
        id: `tw-${id}`,
        sessionId: id,
        date: startedAt,
        exercises: template.exercises
          .map((ex) => ({ ex, l: finalLog.exercises?.find((e) => e.exerciseId === ex.id) }))
          .filter((x) => x.l && x.l.sets.some((s) => s.done))
          .map(({ ex, l }) => ({
            name: exerciseName(ex, session.week),
            sets: l!.sets.filter((s) => s.done).map((s) => ({
              reps: s.reps ?? 0,
              weight: s.weight ?? 0,
              rir: s.rpe !== null ? Math.max(0, 10 - s.rpe) : 3,
            })),
            difficulty: rpe ?? 7,
            pumpRating: 0,
          })),
        duration: durationMin,
        glucoseBefore: finalLog.glucoseBefore ?? null,
        glucoseAfter: after,
        recoveryScore: recovery,
        difficulty: rpe ?? 7,
        notes: finalLog.notes ?? "",
      });
    }
    router.push("/muscu");
  };

  const reset = () => {
    if (!window.confirm("Effacer toutes les séries saisies pour cette séance ?")) return;
    removeTrainingLog(id);
    removeCompletedWorkout(`tw-${id}`);
  };

  const dateLabel = parseLocalDate(session.date).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });

  return (
    <div className="max-w-[720px] mx-auto px-4 sm:px-6 py-5 lg:py-8 space-y-3 pb-32">
      <Link href="/muscu" className="inline-flex items-center gap-1 text-xs text-text-tertiary hover:text-text-secondary">
        <ArrowLeft size={14} /> Calendrier
      </Link>

      <header className="flex items-end justify-between gap-3">
        <div>
          <p className="eyebrow">S{session.week} · {dateLabel}{template ? ` · ${template.focus}` : ""}</p>
          <h1 className="h-title">{session.title}</h1>
        </div>
        {template && (
          <div className="text-right flex-none">
            <p className="num text-xl">{doneSetCount}/{totalSets}</p>
            <p className="text-[11px] text-text-tertiary">séries</p>
          </div>
        )}
      </header>

      {isDone && (
        <div className="note">
          <Check />
          <div>
            <b>Séance terminée</b>
            <p>
              {log?.durationMin ? `${log.durationMin} min` : ""}
              {log?.rpe ? ` · RPE ${log.rpe}` : ""}
              {log?.glucoseBefore ? ` · ${log.glucoseBefore}` : ""}
              {log?.glucoseAfter ? ` → ${log.glucoseAfter} mg/dL` : ""}
            </p>
          </div>
        </div>
      )}

      {session.notes && (
        <div className="info">
          <div>
            <b>Consigne Notion</b>
            <p>{session.notes}</p>
          </div>
        </div>
      )}

      {/* ── Récup + glycémie avant ── */}
      <div className="mgrid">
        <div className="cell">
          <div className="flex items-center gap-2">
            <span className={`led ${advice.light === "green" ? "green" : advice.light === "yellow" ? "amber" : advice.light === "red" ? "red" : "steel"}`} />
            <span className="eyebrow">Récup Whoop</span>
          </div>
          <div className="v mt-2">{recovery ?? "—"}<small>%</small></div>
          <div className="l">{advice.label}</div>
        </div>
        <div className="cell">
          <div className="flex items-center gap-2">
            <span className={`led ${glucoseBefore ? "green" : "steel"}`} />
            <span className="eyebrow">Glycémie avant</span>
          </div>
          <input
            inputMode="numeric"
            placeholder={liveGlucose ? String(liveGlucose.value) : "—"}
            value={glucoseBefore ?? ""}
            onChange={(e) => save({ glucoseBefore: parseNum(e.target.value) ?? undefined })}
            className="v mt-2 w-full bg-transparent outline-none placeholder:text-text-disabled"
            style={{ color: glucoseBefore ? "var(--success)" : undefined }}
          />
          <div className="l">
            {liveGlucose && !glucoseBefore ? (
              <button type="button" className="text-accent" onClick={() => save({ glucoseBefore: liveGlucose.value })}>
                Utiliser le live {liveGlucose.value} {liveGlucose.arrow}
              </button>
            ) : (
              "mg/dL"
            )}
          </div>
        </div>
      </div>

      {advice.light === "yellow" && template && !session.deload && (
        <div className="alert">
          <AlertTriangle />
          <div className="flex-1">
            <b>{advice.label} — {advice.detail}</b>
            <button type="button" onClick={() => setLoadFactor(loadFactor === 0.8 ? 1 : 0.8)} className="pill amber mt-2">
              {loadFactor === 0.8 ? "−20 % appliqué · annuler" : "Appliquer −20 % aux charges suggérées"}
            </button>
          </div>
        </div>
      )}
      {advice.light === "red" && (
        <div className="alert">
          <AlertTriangle />
          <div>
            <b>{advice.label}</b>
            <p>{advice.detail}</p>
          </div>
        </div>
      )}

      {/* ── Exercices ── */}
      {template ? (
        <section className="panel">
          <div className="panel-hd">
            <b>Exercices</b>
            <span className="num text-xs text-text-tertiary">RPE cible {rpeTarget}{session.deload ? " · deload −30 %" : ""}</span>
          </div>
          {template.exercises.map((ex, exIndex) => {
            const el = exerciseLog(ex);
            const sug = suggestions.get(ex.id);
            const sugWeight = sug?.weight != null ? roundLoad(sug.weight * loadFactor) : null;
            const unitLabel = ex.unit === "sec" ? "sec" : ex.unit === "bw" ? "lest" : "kg";
            return (
              <div key={ex.id} className={`py-3 ${exIndex > 0 ? "border-t border-border-subtle" : ""}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-text-primary">{exerciseName(ex, session.week)}</p>
                    <p className="text-xs text-text-secondary mt-0.5 leading-snug">{ex.cue}</p>
                  </div>
                  <span className="pill flex-none">{ex.sets} × {ex.reps}</span>
                </div>
                {sug && sug.reason !== "none" && sugWeight !== null && (
                  <p className="text-[11px] mt-1.5 font-mono" style={{ color: sug.reason === "progress" ? "var(--success)" : "var(--text-tertiary)" }}>
                    {sug.reason === "progress" ? "↑ +2,5 kg mérité" : sug.reason === "deload" ? "deload −30 %" : "même charge"} · suggéré {fmtKg(sugWeight)} kg
                    {loadFactor === 0.8 ? " (−20 %)" : ""}
                  </p>
                )}
                <div className="grid grid-cols-[18px_1fr_1fr_1fr_26px] gap-1.5 mt-2 items-center">
                  <span className="font-mono text-[9.5px] text-text-tertiary uppercase tracking-wider">#</span>
                  <span className="font-mono text-[9.5px] text-text-tertiary uppercase tracking-wider">{unitLabel}</span>
                  <span className="font-mono text-[9.5px] text-text-tertiary uppercase tracking-wider">{ex.unit === "sec" ? "sec" : "reps"}</span>
                  <span className="font-mono text-[9.5px] text-text-tertiary uppercase tracking-wider">rpe</span>
                  <span />
                  {el.sets.map((s, i) => (
                    <SetRow
                      key={i}
                      index={i}
                      set={s}
                      unit={ex.unit}
                      weightPlaceholder={sugWeight !== null ? fmtKg(sugWeight) : ex.unit === "bw" ? "0" : "—"}
                      repsPlaceholder={String(parseInt(ex.reps, 10) || "")}
                      onChange={(patch) => updateSet(ex, i, patch)}
                      onToggle={() => toggleSet(ex, i, loadFactor)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </section>
      ) : (
        <section className="panel">
          <div className="panel-hd">
            <b>{session.kind === "Test 5 km" ? "Test 5 km" : "Footing"}</b>
            <span className="pill cobalt">{session.durationMin ?? "—"} min · Z2</span>
          </div>
          <p className="text-sm text-text-secondary leading-relaxed">
            Lance la sortie avec le tracker GPS d&apos;Apex (glycémie taguée sur le tracé) ou avec la Watch — Whoop remontera la durée réelle.
          </p>
          <Link href="/running" className="mt-3 flex h-11 items-center justify-center gap-2 rounded-lg bg-accent text-accent-ink text-sm font-semibold">
            <MapPin size={16} /> Ouvrir le tracker GPS
          </Link>
          <label className="block mt-3">
            <span className="text-[11px] text-text-tertiary">Durée réelle (min)</span>
            <input
              inputMode="numeric"
              value={durationRun}
              onChange={(e) => setDurationRun(e.target.value)}
              placeholder={String(session.durationMin ?? 30)}
              className="field-in w-full mt-1"
            />
          </label>
        </section>
      )}

      {/* ── Clôture ── */}
      {!isDone && (
        <section className="panel">
          <div className="panel-hd">
            <b>Terminer</b>
            <span className="num text-xs text-text-tertiary">RPE 1-10</span>
          </div>
          <div className="flex gap-1">
            {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setRpe(n)}
                className={`flex-1 h-9 rounded-md border font-mono text-xs ${rpe === n ? "bg-text-primary border-text-primary text-bg-secondary" : "border-border-default bg-bg-secondary text-text-secondary"}`}
              >
                {n}
              </button>
            ))}
          </div>
          <label className="block mt-3">
            <span className="text-[11px] text-text-tertiary">Glycémie après (mg/dL)</span>
            <input
              inputMode="numeric"
              value={glucoseAfter}
              onChange={(e) => setGlucoseAfter(e.target.value)}
              placeholder={liveGlucose ? String(liveGlucose.value) : "—"}
              className="field-in w-full mt-1"
            />
          </label>
          <button
            type="button"
            onClick={finish}
            className={`mt-3 w-full h-12 rounded-lg text-sm font-semibold ${template ? "bg-text-primary text-bg-secondary" : "bg-accent text-accent-ink"}`}
          >
            Terminer la séance
          </button>
        </section>
      )}

      {log && (
        <button type="button" onClick={reset} className="flex items-center gap-1.5 text-xs text-text-tertiary hover:text-error mx-auto">
          <RotateCcw size={13} /> Réinitialiser la séance
        </button>
      )}
    </div>
  );
}

function SetRow({
  index,
  set,
  unit,
  weightPlaceholder,
  repsPlaceholder,
  onChange,
  onToggle,
}: {
  index: number;
  set: TrainingSetLog;
  unit: ExerciseTemplate["unit"];
  weightPlaceholder: string;
  repsPlaceholder: string;
  onChange: (patch: Partial<TrainingSetLog>) => void;
  onToggle: () => void;
}) {
  const cls = "h-9 w-full rounded-md border border-border-default bg-bg-secondary text-center font-mono text-[13px] text-text-primary placeholder:text-text-disabled outline-none focus:border-accent";
  return (
    <>
      <span className="font-mono text-xs text-text-tertiary">{index + 1}</span>
      {unit === "sec" ? (
        <span className="h-9 flex items-center justify-center text-text-disabled font-mono text-xs">—</span>
      ) : (
        <input
          inputMode="decimal"
          className={cls}
          placeholder={weightPlaceholder}
          value={set.weight ?? ""}
          onChange={(e) => onChange({ weight: parseNum(e.target.value) })}
        />
      )}
      <input
        inputMode="numeric"
        className={cls}
        placeholder={repsPlaceholder}
        value={set.reps ?? ""}
        onChange={(e) => onChange({ reps: parseNum(e.target.value) })}
      />
      <input
        inputMode="numeric"
        className={cls}
        placeholder="—"
        value={set.rpe ?? ""}
        onChange={(e) => onChange({ rpe: parseNum(e.target.value) })}
      />
      <button
        type="button"
        onClick={onToggle}
        aria-label={set.done ? "Série non faite" : "Série faite"}
        className={`w-[26px] h-[26px] rounded-[6px] border-[1.5px] flex items-center justify-center ${set.done ? "bg-success border-success" : "border-border-strong bg-bg-secondary"}`}
      >
        {set.done && <Check size={13} strokeWidth={3} className="text-white" />}
      </button>
    </>
  );
}
