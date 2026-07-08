"use client";

/**
 * /diabete/docteur — "Le Docteur" : médecin personnel du diabète.
 *
 * À l'ouverture : bilan auto de la période récente (moteur weekly-insight
 * réutilisé côté serveur). En dessous : fil de conversation persisté en
 * Vercel KV (le Docteur se souvient, l'historique survit au refresh).
 * Aucun dosage auto-appliqué — mêmes garde-fous T1D que le bilan hebdo.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Card,
  PageHeader,
  Badge,
  InfoBox,
  SectionTitle,
  Button,
} from "@/components/ui";
import { useStore } from "@/lib/store";
import { usePatternDetection } from "@/hooks/usePatternDetection";
import {
  Stethoscope,
  RefreshCw,
  Trash2,
  Send,
  Loader2,
  CheckCircle2,
} from "lucide-react";

// ─── Types miroir du contrat API (lib/doctor) ─────────────────────────

interface DoctorSuggestion {
  area: string;
  suggestion: string;
  rationale: string;
  confidence: "low" | "medium" | "high";
}

interface DoctorReplyMeta {
  summary?: string;
  highlights?: string[];
  suggestions?: DoctorSuggestion[];
  warnings?: string[];
}

interface DoctorMessage {
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  kind?: "analysis" | "chat";
  meta?: DoctorReplyMeta;
}

const DAYS_OPTIONS = [14, 30, 90] as const;

const CONFIDENCE_LABEL: Record<
  DoctorSuggestion["confidence"],
  { label: string; color: "green" | "orange" | "gray" }
> = {
  high: { label: "Confiance forte", color: "green" },
  medium: { label: "Confiance modérée", color: "orange" },
  low: { label: "Confiance faible", color: "gray" },
};

export default function DocteurPage() {
  const insulinLogs = useStore((s) => s.insulinLogs);
  const diabetesConfig = useStore((s) => s.diabetesConfig);
  const completedWorkouts = useStore((s) => s.completedWorkouts);
  const completedRunningSessions = useStore((s) => s.completedRunningSessions);
  const { patterns: detectedPatterns } = usePatternDetection({
    insulinLogs,
    diabetesConfig,
  });

  const [conversation, setConversation] = useState<DoctorMessage[]>([]);
  const [days, setDays] = useState<number>(14);
  const [input, setInput] = useState("");
  const [hydrating, setHydrating] = useState(true);
  const [loading, setLoading] = useState<"analysis" | "chat" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const threadEndRef = useRef<HTMLDivElement>(null);

  const activeProfileName =
    diabetesConfig.profiles?.find(
      (p) => p.id === diabetesConfig.activeProfileId,
    )?.name ?? "Par défaut";

  // ─── Payload contexte (même assemblage que /diabete/historique) ─────
  const buildContextPayload = useCallback(
    (windowDays: number) => {
      const fromMs = Date.now() - windowDays * 24 * 60 * 60 * 1000;

      const workoutSessions = [
        ...completedWorkouts
          .filter((w) => new Date(w.date).getTime() >= fromMs)
          .map((w) => ({
            date: w.date,
            type: "muscu" as const,
            durationMin: Math.round(w.duration ?? 60),
          })),
        ...completedRunningSessions
          .filter((r) => new Date(r.date).getTime() >= fromMs)
          .map((r) => ({
            date: r.date,
            type: "running" as const,
            durationMin: Math.round(r.actualDuration ?? 45),
          })),
      ];

      const mealContext = insulinLogs
        .filter((log) => {
          const t = new Date(log.injectedAt).getTime();
          return t >= fromMs && !log.isSplitDose;
        })
        .map((log) => ({
          mealType: log.mealType,
          mealTag: log.mealTag,
          mealSize: log.mealSize,
          carbsGrams: log.carbsGrams,
          fatGrams: log.fatGrams,
          proteinGrams: log.proteinGrams,
          injectedAt:
            log.injectedAt instanceof Date
              ? log.injectedAt.toISOString()
              : new Date(log.injectedAt).toISOString(),
          glucoseBefore: log.glucoseBefore,
        }));

      return {
        days: windowDays,
        injections: insulinLogs,
        activeProfileName,
        detectedPatterns: detectedPatterns.map((p) => ({
          type: p.type,
          severity: p.severity,
          title: p.title,
          message: p.message,
          occurrences: p.occurrences,
          timeWindow: p.timeWindow,
          suggestion: p.suggestion,
        })),
        workoutSessions,
        mealContext,
      };
    },
    [
      insulinLogs,
      completedWorkouts,
      completedRunningSessions,
      detectedPatterns,
      activeProfileName,
    ],
  );

  const postDoctor = useCallback(
    async (mode: "analysis" | "chat", message?: string) => {
      setLoading(mode);
      setError(null);
      try {
        const res = await fetch("/api/diabete/docteur", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode,
            message,
            ...buildContextPayload(days),
          }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.message ?? `HTTP ${res.status}`);
        }
        const json = await res.json();
        setConversation(json.conversation ?? []);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Erreur inconnue — réessaie dans un instant.",
        );
      } finally {
        setLoading(null);
      }
    },
    [buildContextPayload, days],
  );

  // ─── Hydratation initiale : GET seul — pas de bilan auto (coût API). ──
  // C'est à Ethan de cliquer "Lancer le bilan" quand il veut consommer un
  // appel Claude (tous les 2-3 jours / chaque semaine, pas à chaque ouverture).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/diabete/docteur");
        const json = res.ok ? await res.json() : { conversation: [] };
        if (cancelled) return;
        const conv: DoctorMessage[] = json.conversation ?? [];
        setConversation(conv);
        setHydrating(false);
      } catch {
        if (!cancelled) {
          setHydrating(false);
          setError(
            "Impossible de charger la conversation. Vérifie ta connexion.",
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Scroll en bas du fil à chaque nouveau message
  useEffect(() => {
    if (conversation.length > 0) {
      threadEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [conversation.length]);

  const handleSend = () => {
    const msg = input.trim();
    if (!msg || loading) return;
    setInput("");
    postDoctor("chat", msg);
  };

  const handleClear = async () => {
    if (!confirm("Effacer toute la conversation avec le Docteur ?")) return;
    setError(null);
    try {
      await fetch("/api/diabete/docteur", { method: "DELETE" });
      setConversation([]);
    } catch {
      setError("Impossible d'effacer la conversation.");
    }
  };

  const lastAnalysis = [...conversation]
    .reverse()
    .find((m) => m.kind === "analysis" && m.meta);

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-3xl mx-auto">
      <PageHeader
        title="Le Docteur"
        subtitle="Ton médecin personnel du diabète — il observe, explique et propose. La décision reste la tienne."
        action={
          <Link href="/diabete">
            <Button variant="secondary" size="sm">
              &larr; Retour diabète
            </Button>
          </Link>
        }
      />

      {/* Période + actions */}
      <div className="flex items-center justify-between flex-wrap gap-3 mb-6">
        <div className="flex gap-2">
          {DAYS_OPTIONS.map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              style={{ touchAction: "manipulation" }}
              className={`px-3 py-1.5 text-xs rounded-lg cursor-pointer select-none transition-all ${
                days === d
                  ? "bg-[#5856d6]/15 text-[#5856d6] font-semibold"
                  : "bg-black/[0.05] text-black/50 hover:bg-black/[0.08]"
              }`}
            >
              {d} jours
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <Button
            variant={lastAnalysis ? "secondary" : "primary"}
            size="sm"
            onClick={() => postDoctor("analysis")}
            disabled={loading !== null}
          >
            {loading === "analysis" ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : lastAnalysis ? (
              <RefreshCw className="w-3.5 h-3.5" />
            ) : (
              <Stethoscope className="w-3.5 h-3.5" />
            )}
            {lastAnalysis ? "Relancer une analyse" : "Lancer le bilan"}
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={handleClear}
            disabled={loading !== null || conversation.length === 0}
          >
            <Trash2 className="w-3.5 h-3.5" />
            Effacer
          </Button>
        </div>
      </div>

      {error && (
        <div className="mb-6">
          <InfoBox variant="danger">
            <span className="font-medium">Le Docteur est indisponible :</span>{" "}
            {error}
          </InfoBox>
        </div>
      )}

      {/* ── Bilan (dernière analyse) ── */}
      {loading === "analysis" && (
        <Card className="mb-6">
          <div className="flex items-center gap-3 text-black/50 text-sm">
            <Loader2 className="w-4 h-4 animate-spin text-[#5856d6]" />
            Le Docteur analyse tes {days} derniers jours (glycémie, injections,
            repas, sport)…
          </div>
        </Card>
      )}

      {!lastAnalysis && !hydrating && loading === null && (
        <Card className="mb-8 border border-[#5856d6]/20 text-center">
          <Stethoscope className="w-8 h-8 text-[#5856d6] mx-auto mb-3" />
          <p className="text-sm text-black/60 leading-relaxed max-w-sm mx-auto">
            Aucun bilan pour l&apos;instant. Choisis une période puis lance
            l&apos;analyse — chaque bilan appelle Claude, inutile de le faire
            tous les jours : tous les 2-3 jours ou une fois par semaine
            suffit.
          </p>
          <div className="mt-4">
            <Button onClick={() => postDoctor("analysis")}>
              <Stethoscope className="w-4 h-4" />
              Lancer le bilan
            </Button>
          </div>
        </Card>
      )}

      {lastAnalysis?.meta && loading !== "analysis" && (
        <div className="mb-8">
          <SectionTitle>
            <span className="inline-flex items-center gap-2">
              <Stethoscope className="w-5 h-5 text-[#5856d6]" />
              Bilan du Docteur
            </span>
          </SectionTitle>

          {lastAnalysis.meta.summary && (
            <Card className="mb-4 border border-[#5856d6]/20">
              <p className="text-sm text-black/70 leading-relaxed">
                {lastAnalysis.meta.summary}
              </p>
              <p className="text-[11px] text-black/35 mt-3">
                Généré le{" "}
                {new Date(lastAnalysis.createdAt).toLocaleString("fr-FR")} · à
                valider avec ton suivi médical
              </p>
            </Card>
          )}

          {(lastAnalysis.meta.warnings?.length ?? 0) > 0 && (
            <div className="space-y-2 mb-4">
              {lastAnalysis.meta.warnings!.map((w, i) => (
                <InfoBox key={i} variant="danger">
                  {w}
                </InfoBox>
              ))}
            </div>
          )}

          {(lastAnalysis.meta.highlights?.length ?? 0) > 0 && (
            <Card className="mb-4">
              <p className="text-xs text-black/40 font-medium mb-3 uppercase tracking-wider">
                Points clés
              </p>
              <div className="space-y-2">
                {lastAnalysis.meta.highlights!.map((h, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm">
                    <CheckCircle2 className="w-4 h-4 text-[#34c759] mt-0.5 shrink-0" />
                    <span className="text-black/60">{h}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {(lastAnalysis.meta.suggestions?.length ?? 0) > 0 && (
            <div className="space-y-3">
              {lastAnalysis.meta.suggestions!.map((s, i) => {
                const conf = CONFIDENCE_LABEL[s.confidence] ?? CONFIDENCE_LABEL.low;
                return (
                  <Card key={i}>
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <span className="text-[11px] uppercase tracking-wider text-[#5856d6] font-semibold">
                        {s.area}
                      </span>
                      <Badge color={conf.color}>{conf.label}</Badge>
                    </div>
                    <p className="text-sm font-medium text-black/75">
                      {s.suggestion}
                    </p>
                    <p className="text-xs text-black/45 mt-1.5">{s.rationale}</p>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Fil de conversation ── */}
      <SectionTitle>Pose tes questions</SectionTitle>

      <Card className="!p-0 overflow-hidden">
        <div className="max-h-[50vh] overflow-y-auto p-4 space-y-3">
          {hydrating && (
            <div className="flex items-center gap-2 text-sm text-black/40 py-6 justify-center">
              <Loader2 className="w-4 h-4 animate-spin" />
              Chargement de l&apos;historique…
            </div>
          )}

          {!hydrating && conversation.length === 0 && loading === null && (
            <p className="text-sm text-black/40 text-center py-6">
              Aucune conversation. Lance une analyse ou pose une question pour
              commencer.
            </p>
          )}

          {conversation.map((m, i) =>
            m.role === "user" ? (
              <div key={i} className="flex justify-end">
                <div className="max-w-[85%] rounded-2xl rounded-br-md bg-[#007aff] text-white px-4 py-2.5 text-sm whitespace-pre-wrap">
                  {m.content}
                </div>
              </div>
            ) : (
              <div key={i} className="flex justify-start">
                <div className="max-w-[85%] rounded-2xl rounded-bl-md bg-black/[0.05] px-4 py-2.5">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Stethoscope className="w-3.5 h-3.5 text-[#5856d6]" />
                    <span className="text-[10px] uppercase tracking-wider text-[#5856d6] font-semibold">
                      {m.kind === "analysis" ? "Bilan" : "Le Docteur"}
                    </span>
                  </div>
                  <p className="text-sm text-black/70 whitespace-pre-wrap leading-relaxed">
                    {m.content}
                  </p>
                </div>
              </div>
            ),
          )}

          {loading === "chat" && (
            <div className="flex justify-start">
              <div className="rounded-2xl rounded-bl-md bg-black/[0.05] px-4 py-2.5 flex items-center gap-2 text-sm text-black/40">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-[#5856d6]" />
                Le Docteur réfléchit…
              </div>
            </div>
          )}

          <div ref={threadEndRef} />
        </div>

        {/* Saisie */}
        <div className="border-t border-black/[0.06] p-3 flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSend();
            }}
            placeholder='Ex : "Pourquoi je fais des hypos la nuit ?"'
            disabled={loading !== null}
            className="flex-1 bg-black/[0.04] rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[#5856d6]/30 placeholder:text-black/30 disabled:opacity-50"
          />
          <Button
            onClick={handleSend}
            disabled={loading !== null || !input.trim()}
            size="md"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </Card>

      <div className="mt-6">
        <InfoBox variant="warning">
          <span className="font-medium">Rappel :</span> le Docteur propose des
          hypothèses à partir de tes données — il ne prescrit rien et
          n&apos;applique aucun changement. Toute modification de dose
          (ratios, basale, ISF) se valide avec ton équipe médicale.
        </InfoBox>
      </div>
    </div>
  );
}
