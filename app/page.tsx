"use client";

import { Card, StatCard, Badge, PageHeader, GlucoseIndicator, ProgressBar, SectionTitle } from "@/components/ui";
import { useStore } from "@/lib/store";
import { calculateVMA, predictRaceTime, formatPace, formatTime } from "@/lib/running-science";
import { getCurrentPhaseInfo } from "@/lib/muscu-science";
import Link from "next/link";

export default function Dashboard() {
  const { profile, diabetesConfig, glucoseReadings, meals, completedWorkouts, currentRunningWeek, muscuProgram } = useStore();

  const vma = calculateVMA(profile.vo2max);
  const semiPrediction = predictRaceTime(profile.vo2max, 21.1);
  const phase = getCurrentPhaseInfo(1);

  const todayMeals = meals.filter((m) => {
    const d = new Date(m.eatenAt);
    const today = new Date();
    return d.toDateString() === today.toDateString();
  });
  const todayCalories = todayMeals.reduce((s, m) => s + m.calories, 0);
  const todayProtein = todayMeals.reduce((s, m) => s + m.protein, 0);
  const todayCarbs = todayMeals.reduce((s, m) => s + m.carbs, 0);
  const todayFat = todayMeals.reduce((s, m) => s + m.fat, 0);

  const lastGlucose = glucoseReadings[0];

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto">
      <PageHeader
        title={`Salut ${profile.name}`}
        subtitle="Voici ton tableau de bord APEX"
      />

      {/* Quick stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard label="Poids" value={profile.weight} unit="kg" icon="⚖️" color="text-white" />
        <StatCard label="VO2max" value={profile.vo2max} unit="ml/kg/min" icon="❤️" color="text-[#00d4ff]" />
        <StatCard label="DC 1RM" value={profile.benchPress1RM} unit="kg" icon="🏋️" color="text-[#a855f7]" />
        <StatCard
          label="Glycémie"
          value={lastGlucose ? lastGlucose.value : "—"}
          unit={lastGlucose ? "mg/dL" : ""}
          icon="💉"
          color={
            lastGlucose
              ? lastGlucose.value < 70
                ? "text-[#ff4757]"
                : lastGlucose.value > 180
                  ? "text-[#ff9500]"
                  : "text-[#00ff94]"
              : "text-white/40"
          }
        />
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Colonne 1: Diabète & Nutrition */}
        <div className="space-y-6">
          <Card glow="green">
            <div className="flex items-center justify-between mb-4">
              <SectionTitle className="mb-0">Diabète T1</SectionTitle>
              <Link href="/diabete" className="text-xs text-[#00ff94] hover:underline">Voir tout →</Link>
            </div>
            {lastGlucose ? (
              <GlucoseIndicator value={lastGlucose.value} />
            ) : (
              <p className="text-white/35 text-sm">Aucune lecture récente</p>
            )}
            <div className="mt-4 space-y-2">
              <p className="text-xs text-white/40">Patterns connus</p>
              {diabetesConfig.knownPatterns.slice(0, 2).map((p) => (
                <div key={p.name} className="flex items-start gap-2 text-xs">
                  <span className="text-[#ff9500]">⚠</span>
                  <div>
                    <span className="text-white/70 font-medium">{p.name}:</span>{" "}
                    <span className="text-white/40">{p.suggestion}</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 grid grid-cols-3 gap-3 text-center">
              <div>
                <p className="text-xs text-white/35">Ratio matin</p>
                <p className="text-sm font-semibold text-[#ff9500]">1:{diabetesConfig.ratios.morning}</p>
              </div>
              <div>
                <p className="text-xs text-white/35">Ratio midi</p>
                <p className="text-sm font-semibold text-[#00d4ff]">1:{diabetesConfig.ratios.lunch}</p>
              </div>
              <div>
                <p className="text-xs text-white/35">Ratio soir</p>
                <p className="text-sm font-semibold text-[#a855f7]">1:{diabetesConfig.ratios.dinner}</p>
              </div>
            </div>
          </Card>

          <Card>
            <div className="flex items-center justify-between mb-4">
              <SectionTitle className="mb-0">Nutrition du jour</SectionTitle>
              <Link href="/nutrition" className="text-xs text-[#00ff94] hover:underline">Logger →</Link>
            </div>
            <div className="space-y-3">
              <ProgressBar value={todayCalories} max={profile.targetCalories} color="#00ff94" label="Calories" />
              <ProgressBar value={Math.round(todayProtein)} max={profile.targetProtein} color="#00d4ff" label="Protéines (g)" />
              <ProgressBar value={Math.round(todayCarbs)} max={profile.targetCarbs} color="#ff9500" label="Glucides (g)" />
              <ProgressBar value={Math.round(todayFat)} max={profile.targetFat} color="#a855f7" label="Lipides (g)" />
            </div>
          </Card>
        </div>

        {/* Colonne 2: Muscu */}
        <div className="space-y-6">
          <Card glow="purple">
            <div className="flex items-center justify-between mb-4">
              <SectionTitle className="mb-0">Musculation</SectionTitle>
              <Link href="/muscu" className="text-xs text-[#a855f7] hover:underline">Programme →</Link>
            </div>
            <div className="flex items-center gap-2 mb-3">
              <Badge color="purple">{muscuProgram.name}</Badge>
              <Badge color="gray">{phase.name}</Badge>
            </div>
            <p className="text-xs text-white/40 mb-4">{phase.focus} · RIR cible: {phase.rirTarget}</p>

            <p className="text-xs text-white/40 mb-2">Prochaines séances</p>
            <div className="space-y-2">
              {muscuProgram.sessions.slice(0, 3).map((s) => (
                <Link key={s.id} href={`/muscu/seance/${s.id}`} className="block">
                  <div className="flex items-center justify-between p-3 rounded-lg bg-white/[0.03] hover:bg-white/[0.06] transition-colors">
                    <div>
                      <p className="text-sm font-medium">{s.name}</p>
                      <p className="text-xs text-white/35">{s.day} · {s.duration}min</p>
                    </div>
                    <span className="text-white/20">→</span>
                  </div>
                </Link>
              ))}
            </div>

            <div className="mt-4 pt-4 border-t border-white/[0.06]">
              <p className="text-xs text-white/40 mb-2">Points faibles ciblés</p>
              <div className="flex gap-2 flex-wrap">
                {profile.weakPoints.map((wp) => (
                  <Badge key={wp} color="orange">{wp}</Badge>
                ))}
              </div>
            </div>
          </Card>

          <Card>
            <p className="text-xs text-white/40 mb-2">Séances complétées</p>
            <p className="text-3xl font-bold">{completedWorkouts.length}</p>
            <p className="text-xs text-white/35 mt-1">
              {completedWorkouts.length > 0
                ? `Dernière: ${new Date(completedWorkouts[0].date).toLocaleDateString("fr-FR")}`
                : "Commence ta première séance !"}
            </p>
          </Card>
        </div>

        {/* Colonne 3: Running */}
        <div className="space-y-6">
          <Card glow="blue">
            <div className="flex items-center justify-between mb-4">
              <SectionTitle className="mb-0">Running</SectionTitle>
              <Link href="/running" className="text-xs text-[#00d4ff] hover:underline">Plan →</Link>
            </div>
            <div className="flex items-center gap-2 mb-3">
              <Badge color="blue">Semi-marathon</Badge>
              <Badge color="gray">Semaine {currentRunningWeek}/14</Badge>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="p-3 rounded-lg bg-white/[0.03]">
                <p className="text-xs text-white/35">VMA</p>
                <p className="text-lg font-bold text-[#00d4ff]">{vma.toFixed(1)} <span className="text-xs font-normal text-white/35">km/h</span></p>
              </div>
              <div className="p-3 rounded-lg bg-white/[0.03]">
                <p className="text-xs text-white/35">Temps prédit semi</p>
                <p className="text-lg font-bold text-[#00d4ff]">{formatTime(semiPrediction.predictedTimeMinutes)}</p>
              </div>
            </div>

            <div className="p-3 rounded-lg bg-white/[0.03] mb-4">
              <p className="text-xs text-white/35">Allure cible semi</p>
              <p className="text-2xl font-bold text-[#00d4ff]">{formatPace(semiPrediction.predictedPace)}<span className="text-sm font-normal text-white/35"> /km</span></p>
              <p className="text-xs text-white/30 mt-1">Confiance: {semiPrediction.confidence}</p>
            </div>

            <ProgressBar value={currentRunningWeek} max={14} color="#00d4ff" label="Progression du plan" />
          </Card>

          <Card>
            <SectionTitle>Objectifs</SectionTitle>
            <div className="space-y-3">
              {profile.goals.map((goal) => (
                <div key={goal} className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-[#00ff94]" />
                  <span className="text-sm text-white/70">{goal}</span>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <SectionTitle>Profil</SectionTitle>
            <div className="grid grid-cols-2 gap-y-2 text-sm">
              <span className="text-white/35">Taille</span><span>{profile.height} cm</span>
              <span className="text-white/35">Morphotype</span><span>{profile.bodyType}</span>
              <span className="text-white/35">Insuline</span><span>{profile.insulinRapid}</span>
              <span className="text-white/35">CGM</span><span>{profile.cgmType}</span>
              <span className="text-white/35">Basale</span><span>{profile.basalDose} U/jour</span>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
