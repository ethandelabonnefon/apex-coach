"use client";

/**
 * Muscu — calendrier et séances du programme Phase 0 (import Notion, sept. 2026).
 *
 * Structure (même langage que les prototypes v5) :
 *   1. En-tête : phase, semaine en cours
 *   2. Aujourd'hui : séances du jour dans l'ordre (muscu puis cardio), ou la
 *      prochaine séance / le compte à rebours avant le 12 oct
 *   3. Semaine : bandeau 7 jours + liste cochable
 *   4. Calendrier du mois (oct / nov)
 *   5. Les 4 séances types et les 5 règles d'or
 *
 * Cocher une séance depuis la liste la marque faite SANS alimenter le
 * moteur diabète : on ne connaît pas l'heure réelle. Seul « Terminer » dans
 * la page séance (heure de début connue) crée un `completedWorkout`.
 */

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Check } from "lucide-react";
import { useStore } from "@/lib/store";
import { GOLDEN_RULES, PHASE0, PLANNED_SESSIONS, WORKOUT_TEMPLATES, isWorkoutKind, type PlannedSession } from "@/lib/training/phase0";
import {
  addDays,
  daysUntilStart,
  doneSessionIds,
  exerciseName,
  localISODate,
  nextSession,
  parseLocalDate,
  programWeekOf,
  sessionsOfWeek,
  sessionsOn,
  weekDates,
} from "@/lib/training/schedule";

const WEEKDAY_SHORT = ["LUN", "MAR", "MER", "JEU", "VEN", "SAM", "DIM"];

function fmtDay(iso: string, opts: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short" }) {
  return parseLocalDate(iso).toLocaleDateString("fr-FR", opts);
}

function sessionSub(s: PlannedSession): string {
  if (isWorkoutKind(s.kind)) {
    const t = WORKOUT_TEMPLATES[s.kind];
    return `${t.exercises.length} exos · ${t.focus}${s.deload ? " · deload −30 %" : ""}`;
  }
  return `${s.durationMin ?? "—"} min${s.optional ? " · optionnel" : ""}`;
}

function KindSquare({ s }: { s: PlannedSession }) {
  return <span className={`sq ${isWorkoutKind(s.kind) ? "ink" : "cobalt"}`} />;
}

export default function MuscuPage() {
  const trainingLogs = useStore((st) => st.trainingLogs);
  const upsertTrainingLog = useStore((st) => st.upsertTrainingLog);
  const removeTrainingLog = useStore((st) => st.removeTrainingLog);
  const removeCompletedWorkout = useStore((st) => st.removeCompletedWorkout);

  // La date du jour n'est connue qu'au montage (pages pré-rendues au build).
  const [today, setToday] = useState<string | null>(null);
  const [week, setWeek] = useState(1);
  const [month, setMonth] = useState<"2026-10" | "2026-11">("2026-10");
  const [openTemplate, setOpenTemplate] = useState<string | null>(null);

  useEffect(() => {
    const t = localISODate(new Date());
    const w = programWeekOf(t) ?? (t > PHASE0.endDate ? PHASE0.weeks : 1);
    const id = setTimeout(() => {
      setToday(t);
      setWeek(w);
      setMonth(weekDates(w)[0].slice(0, 7) === "2026-11" ? "2026-11" : "2026-10");
    }, 0);
    return () => clearTimeout(id);
  }, []);

  const done = useMemo(() => doneSessionIds(trainingLogs), [trainingLogs]);
  const logById = useMemo(() => new Map(trainingLogs.map((l) => [l.sessionId, l])), [trainingLogs]);

  if (!today) {
    return <div className="max-w-[720px] mx-auto px-4 sm:px-6 py-5 lg:py-8" />;
  }

  const currentWeek = programWeekOf(today);
  const todaySessions = sessionsOn(today);
  const upcoming = nextSession(today, done);
  const countdown = daysUntilStart(today);
  const weekSessions = sessionsOfWeek(week);
  const weekDone = weekSessions.filter((s) => done.has(s.id)).length;
  const workoutsDone = PLANNED_SESSIONS.filter((s) => isWorkoutKind(s.kind) && done.has(s.id)).length;
  const workoutsTotal = PLANNED_SESSIONS.filter((s) => isWorkoutKind(s.kind)).length;

  const toggleDone = (s: PlannedSession) => {
    const log = logById.get(s.id);
    if (log?.status === "done") {
      if (log.exercises?.length) {
        // Des séries ont été saisies : on les garde, la séance redevient « en cours ».
        upsertTrainingLog({ ...log, status: "in-progress", doneAt: undefined });
      } else {
        removeTrainingLog(s.id);
      }
      removeCompletedWorkout(`tw-${s.id}`);
      return;
    }
    upsertTrainingLog({ ...(log ?? { sessionId: s.id }), status: "done", doneAt: new Date().toISOString() });
  };

  // ─── Calendrier du mois ───────────────────────────────
  const monthStart = `${month}-01`;
  const firstWeekday = (parseLocalDate(monthStart).getDay() + 6) % 7; // lundi = 0
  const daysInMonth = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate();
  const calCells: (string | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => addDays(monthStart, i)),
  ];

  return (
    <div className="max-w-[720px] mx-auto px-4 sm:px-6 py-5 lg:py-8 space-y-3">
      {/* ── En-tête ── */}
      <header className="mb-1">
        <p className="eyebrow">
          {PHASE0.name} · {currentWeek ? `S${currentWeek} / ${PHASE0.weeks}` : countdown > 0 ? `J−${countdown}` : "terminée"}
        </p>
        <h1 className="h-title">Muscu</h1>
      </header>

      {/* ── Aujourd'hui ── */}
      <section className="panel">
        <div className="panel-hd">
          <b>{todaySessions.length ? "Aujourd'hui" : countdown > 0 ? "Départ du programme" : "Prochaine séance"}</b>
          <span className="pill">{fmtDay(today)}</span>
        </div>
        {todaySessions.length > 0 ? (
          todaySessions.map((s, i) => (
            <SessionRow key={s.id} s={s} done={done.has(s.id)} inProgress={logById.get(s.id)?.status === "in-progress"} onToggle={() => toggleDone(s)} order={todaySessions.length > 1 ? `${i + 1}/${todaySessions.length}` : undefined} />
          ))
        ) : upcoming ? (
          <>
            {countdown > 0 && (
              <div className="mgrid flat mb-3">
                <div className="cell">
                  <div className="v">
                    {countdown}
                    <small>jours</small>
                  </div>
                  <div className="l">avant le lun. 12 oct · Brisbane</div>
                </div>
                <div className="cell">
                  <div className="v">
                    {workoutsTotal}
                    <small>séances muscu</small>
                  </div>
                  <div className="l">4 / sem · S7 deload</div>
                </div>
              </div>
            )}
            <SessionRow s={upcoming} done={false} inProgress={logById.get(upcoming.id)?.status === "in-progress"} onToggle={() => toggleDone(upcoming)} dateLabel={fmtDay(upcoming.date)} />
          </>
        ) : (
          <p className="text-sm text-text-secondary">Phase 0 terminée — {workoutsDone} / {workoutsTotal} séances muscu faites.</p>
        )}
        {todaySessions.length > 1 && (
          <p className="text-[11px] text-text-tertiary mt-2">Règle n°5 — muscu d&apos;abord, cardio ensuite.</p>
        )}
      </section>

      {/* ── Semaine ── */}
      <section className="panel">
        <div className="panel-hd">
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setWeek((w) => Math.max(1, w - 1))} disabled={week <= 1} className="text-text-tertiary disabled:opacity-30" aria-label="Semaine précédente">
              <ChevronLeft size={18} />
            </button>
            <b className="whitespace-nowrap">Semaine {week}</b>
            <button type="button" onClick={() => setWeek((w) => Math.min(PHASE0.weeks, w + 1))} disabled={week >= PHASE0.weeks} className="text-text-tertiary disabled:opacity-30" aria-label="Semaine suivante">
              <ChevronRight size={18} />
            </button>
          </div>
          <span className="num text-xs text-text-tertiary">
            {parseLocalDate(weekDates(week)[0]).getDate()} → {fmtDay(weekDates(week)[6], { day: "numeric", month: "short" }).replace(".", "")} · {weekDone}/{weekSessions.length}
          </span>
        </div>

        <div className="grid grid-cols-7 gap-1.5 mb-3">
          {weekDates(week).map((d, i) => {
            const ss = sessionsOn(d);
            const allDone = ss.length > 0 && ss.every((s) => done.has(s.id));
            const isToday = d === today;
            return (
              <div
                key={d}
                className={`flex flex-col items-center gap-1.5 py-2 rounded-lg border ${
                  allDone ? "bg-text-primary border-text-primary" : ss.length === 0 ? "border-dashed border-border-default" : "border-border-default bg-bg-secondary"
                } ${isToday ? "ring-1 ring-text-primary" : ""}`}
              >
                <span className={`font-mono text-[10px] tracking-wider ${allDone ? "text-bg-secondary" : "text-text-tertiary"}`}>{WEEKDAY_SHORT[i]}</span>
                <span className={`font-mono text-sm ${allDone ? "text-bg-secondary" : "text-text-primary"}`}>
                  {allDone ? <Check size={14} strokeWidth={2.5} /> : parseLocalDate(d).getDate()}
                </span>
                <span className="flex gap-0.5 h-2">
                  {ss.length === 0 ? <i className="sq steel" /> : ss.map((s) => <i key={s.id} className={`sq ${allDone ? "" : isWorkoutKind(s.kind) ? "ink" : "cobalt"}`} style={allDone ? { background: "var(--bg-secondary)" } : undefined} />)}
                </span>
              </div>
            );
          })}
        </div>

        {weekSessions.map((s) => (
          <SessionRow key={s.id} s={s} done={done.has(s.id)} inProgress={logById.get(s.id)?.status === "in-progress"} onToggle={() => toggleDone(s)} dateLabel={fmtDay(s.date, { weekday: "short", day: "numeric" })} />
        ))}
      </section>

      {/* ── Calendrier ── */}
      <section className="panel">
        <div className="panel-hd">
          <b>{month === "2026-10" ? "Octobre 2026" : "Novembre 2026"}</b>
          <div className="seg" style={{ padding: 2 }}>
            <button type="button" className={month === "2026-10" ? "on" : ""} style={{ padding: "4px 10px" }} onClick={() => setMonth("2026-10")}>Oct</button>
            <button type="button" className={month === "2026-11" ? "on" : ""} style={{ padding: "4px 10px" }} onClick={() => setMonth("2026-11")}>Nov</button>
          </div>
        </div>
        <div className="grid grid-cols-7 text-center gap-y-1">
          {["L", "M", "M", "J", "V", "S", "D"].map((l, i) => (
            <span key={i} className="font-mono text-[10px] text-text-tertiary pb-1.5 border-b border-border-subtle mb-1">{l}</span>
          ))}
          {calCells.map((d, i) => {
            if (!d) return <span key={`e${i}`} />;
            const ss = sessionsOn(d);
            const w = programWeekOf(d);
            const allDone = ss.length > 0 && ss.every((s) => done.has(s.id));
            return (
              <button
                key={d}
                type="button"
                onClick={() => w && setWeek(w)}
                disabled={!w}
                className="flex flex-col items-center gap-0.5 h-11 disabled:cursor-default"
              >
                <span
                  className={`w-7 h-7 flex items-center justify-center rounded-md font-mono text-[13px] ${
                    allDone ? "bg-text-primary text-bg-secondary" : d === today ? "ring-1 ring-text-primary text-text-primary" : w ? "text-text-primary" : "text-text-disabled"
                  } ${w === week && !allDone ? "bg-bg-hover" : ""}`}
                >
                  {parseLocalDate(d).getDate()}
                </span>
                <span className="flex gap-0.5 h-1.5">
                  {ss.map((s) => (
                    <i key={s.id} className="block w-1.5 h-1.5 rounded-[1px]" style={{ background: isWorkoutKind(s.kind) ? "var(--text-primary)" : "var(--accent)" }} />
                  ))}
                </span>
              </button>
            );
          })}
        </div>
        <div className="flex justify-center gap-4 mt-2 pt-2 border-t border-border-subtle text-xs text-text-tertiary">
          <span className="flex items-center gap-1.5"><i className="sq ink" /> Muscu</span>
          <span className="flex items-center gap-1.5"><i className="sq cobalt" /> Run</span>
          <span className="flex items-center gap-1.5"><i className="sq steel" /> Repos</span>
        </div>
      </section>

      {/* ── Séances types ── */}
      <section className="panel">
        <div className="panel-hd">
          <b>Séances types</b>
          <span className="num text-xs text-text-tertiary">{workoutsDone} / {workoutsTotal} faites</span>
        </div>
        {Object.values(WORKOUT_TEMPLATES).map((t) => (
          <div key={t.kind} className="row-item flex-col items-stretch">
            <button type="button" onClick={() => setOpenTemplate((o) => (o === t.kind ? null : t.kind))} className="flex items-center gap-3 text-left w-full">
              <span className="sq ink" />
              <div className="min-w-0 flex-1">
                <div className="t">{t.title} — {t.focus}</div>
                <div className="s truncate">{t.exercises.map((e) => e.name.split(" (")[0]).join(" · ")}</div>
              </div>
              <span className="d">{t.exercises.length} exos</span>
            </button>
            {openTemplate === t.kind && (
              <div className="mt-2 ml-5 space-y-1.5">
                {t.exercises.map((e) => (
                  <div key={e.id} className="flex items-baseline justify-between gap-3 text-[12.5px]">
                    <div className="min-w-0">
                      <span className="text-text-primary font-medium">{exerciseName(e, currentWeek ?? 1)}</span>
                      <span className="text-text-tertiary"> — {e.cue}</span>
                    </div>
                    <span className="num text-text-secondary flex-none">{e.sets} × {e.reps}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </section>

      {/* ── Règles d'or ── */}
      <section className="panel">
        <div className="panel-hd">
          <b>5 règles d&apos;or</b>
          <span className="num text-xs text-text-tertiary">Notion · HYBRID</span>
        </div>
        <ol className="space-y-1.5 text-[13px] leading-snug">
          {GOLDEN_RULES.map((r, i) => (
            <li key={i} className="flex gap-2.5">
              <span className="num text-text-tertiary">{String(i + 1).padStart(2, "0")}</span>
              <span className="text-text-primary">{r}</span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

function SessionRow({
  s,
  done,
  inProgress,
  onToggle,
  dateLabel,
  order,
}: {
  s: PlannedSession;
  done: boolean;
  inProgress: boolean;
  onToggle: () => void;
  dateLabel?: string;
  order?: string;
}) {
  return (
    <div className="row-item">
      <button
        type="button"
        onClick={onToggle}
        aria-label={done ? "Marquer non faite" : "Marquer faite"}
        className={`w-[22px] h-[22px] rounded-[5px] border-[1.5px] flex items-center justify-center flex-none transition-colors ${
          done ? "bg-text-primary border-text-primary" : "border-border-strong bg-bg-secondary"
        }`}
      >
        {done && <Check size={13} strokeWidth={3} className="text-bg-secondary" />}
      </button>
      <Link href={`/muscu/seance/${s.id}`} className="flex items-center gap-3 min-w-0 flex-1">
        <KindSquare s={s} />
        <div className="min-w-0 flex-1">
          <div className={`t ${done ? "line-through text-text-tertiary" : ""}`}>{s.title}</div>
          <div className="s truncate">
            {dateLabel ? `${dateLabel} · ` : ""}
            {sessionSub(s)}
            {inProgress && !done ? " · en cours" : ""}
          </div>
        </div>
        {order && <span className="pill">{order}</span>}
        <ChevronRight size={16} className="text-text-tertiary flex-none" />
      </Link>
    </div>
  );
}
