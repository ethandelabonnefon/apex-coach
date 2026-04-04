"use client";

import { Card, PageHeader, Badge, InfoBox, SectionTitle, Button } from "@/components/ui";
import { useStore } from "@/lib/store";
import { DIABETES_CONFIG } from "@/lib/constants";
import Link from "next/link";

interface PatternDetail {
  name: string;
  description: string;
  suggestion: string;
  icon: string;
  color: "green" | "orange" | "red" | "blue" | "purple";
  severity: "info" | "warning" | "danger";
  detailedExplanation: string;
  triggers: string[];
  actions: string[];
  timing: string;
  glucoseImpact: string;
}

const PATTERN_DETAILS: PatternDetail[] = [
  {
    name: "Remontee 16h",
    description: "Glycemie remonte environ 3h30 apres le dejeuner",
    suggestion: "Ajouter +1U au midi ou fractionner le repas",
    icon: "&#8593;",
    color: "orange",
    severity: "warning",
    detailedExplanation:
      "Le ratio midi (1:7) est peut-etre legerement insuffisant pour couvrir les repas riches en glucides complexes. " +
      "Les glucides a index glycemique moyen-bas (pates, riz complet, pain complet) continuent de liberer du glucose " +
      "2 a 4h apres le repas, tandis que l'action de la Novorapid diminue apres 2-3h. " +
      "Ce decalage entre l'absorption des glucides et la duree d'action de l'insuline cree une remontee glycemique tardive.",
    triggers: [
      "Repas riche en glucides complexes (pates, riz, pain complet)",
      "Repas riche en matieres grasses (ralentit l'absorption des glucides)",
      "Repas copieux avec un grand volume de nourriture",
      "Stress ou manque de sommeil (resistance a l'insuline augmentee)",
    ],
    actions: [
      "Augmenter le ratio midi a 1:6 pour les gros repas (>80g glucides)",
      "Fractionner le bolus: 60% avant le repas, 40% 30 min apres",
      "Ajouter +1U de correction preventive pour les repas avec IG bas",
      "Marcher 10-15 min apres le dejeuner pour accelerer l'absorption",
    ],
    timing: "Se manifeste generalement entre 15h30 et 17h00",
    glucoseImpact: "+40 a +80 mg/dL au-dessus de la cible",
  },
  {
    name: "Phenomene de l'aube",
    description: "Resistance hormonale entre 5h et 8h du matin",
    suggestion: "Le ratio matin 1:5 compense bien cette resistance",
    icon: "&#9788;",
    color: "orange",
    severity: "warning",
    detailedExplanation:
      "Le phenomene de l'aube (Dawn Phenomenon) est cause par une liberation de cortisol, d'hormone de croissance " +
      "et d'adrenaline entre 4h et 8h du matin. Ces hormones contra-regulatrices augmentent la resistance a l'insuline " +
      "et stimulent la production hepatique de glucose. C'est un phenomene physiologique normal, mais chez les T1D, " +
      "l'absence de secretion pancreatique compensatoire signifie que la glycemie monte naturellement au reveil. " +
      "Le ratio strict de 1:5 au matin (vs 1:7 ou 1:9 aux autres repas) est specifiquement calibre pour cette fenetre hormonale.",
    triggers: [
      "Liberations hormonales circadiennes (cortisol, GH)",
      "Nuit agitee ou reveil brutal (pic de cortisol amplifie)",
      "Lever tres matinal (<6h) ou tres tardif (>9h)",
      "Stress chronique ou examen a venir",
    ],
    actions: [
      "Maintenir le ratio 1:5 au petit-dejeuner (bien calibre actuellement)",
      "Injecter le bolus 15-20 min avant de manger le matin",
      "Surveiller la glycemie au reveil: si >150, correction rapide avant le repas",
      "Si basale insuffisante la nuit: envisager discussion avec l'endocrinologue",
    ],
    timing: "Se manifeste entre 5h00 et 8h00, pic vers 6h30-7h00",
    glucoseImpact: "+30 a +60 mg/dL par rapport a la glycemie nocturne",
  },
  {
    name: "Post-musculation",
    description: "+45 mg/dL en moyenne 1h apres la seance de musculation",
    suggestion: "Prevoir correction si >180 mg/dL",
    icon: "&#9650;",
    color: "red",
    severity: "danger",
    detailedExplanation:
      "Contrairement au cardio qui fait baisser la glycemie, la musculation intense provoque une hyperglycemie reactive. " +
      "Le mecanisme est double: (1) les hormones de stress (adrenaline, cortisol) liberees pendant l'effort intense " +
      "stimulent la glycogenolyse hepatique (liberation de glucose par le foie), et (2) la resistance a l'insuline " +
      "augmente temporairement pendant et apres l'effort de haute intensite. " +
      "Chez les T1D, cette montee n'est pas compensee par une secretion pancreatique, d'ou une hyperglycemie " +
      "transitoire qui peut persister 1-2h post-seance. Les seances jambes et les exercices composes lourds " +
      "(presse, squats) ont un impact glycemique plus important que les exercices d'isolation.",
    triggers: [
      "Exercices composes lourds (DC, presse, tractions lestees)",
      "Seances jambes (impact glycemique le plus eleve)",
      "Travail en force (6-8 reps, RIR bas)",
      "Seances longues (>60 min) avec intensite soutenue",
    ],
    actions: [
      "Verifier la glycemie avant la seance et 1h apres",
      "Si >180 mg/dL apres la seance: correction de 1-2U selon l'ISF",
      "Ne PAS reduire le bolus du repas pre-muscu (contrairement au cardio)",
      "Prevoir une collation proteinee post-seance (pas trop de glucides)",
      "Les jours Push B (DC barre + dips) et Legs: vigilance accrue",
    ],
    timing: "Debut de la montee pendant la seance, pic 30-60 min apres",
    glucoseImpact: "+30 a +70 mg/dL, moyenne constatee +45 mg/dL",
  },
  {
    name: "Running Z2",
    description: "-60 mg/dL pendant le cardio prolonge en zone 2",
    suggestion: "Reduire le bolus de 30-50% si repas <2h avant",
    icon: "&#9660;",
    color: "blue",
    severity: "danger",
    detailedExplanation:
      "Le running en zone 2 (endurance fondamentale) augmente massivement la sensibilite a l'insuline et la captation " +
      "musculaire du glucose par des transporteurs GLUT-4, independamment de l'insuline. Pendant l'exercice aerobique " +
      "prolonge, les muscles consomment du glucose a un rythme eleve, et l'insuline exogene injectee avant le repas " +
      "continue d'agir, creant un double effet hypoglycemiant. " +
      "Une chute de 60 mg/dL est la moyenne constatee pour tes sorties de 30-50 min en Z2. " +
      "Le risque d'hypoglycemie est maximal si le running a lieu dans les 2h suivant un bolus repas. " +
      "L'effet hypoglycemiant persiste jusqu'a 24h apres l'exercice (sensibilite a l'insuline prolongee).",
    triggers: [
      "Running >20 min en zone 2 (endurance fondamentale)",
      "Bolus repas injecte moins de 2h avant la sortie",
      "Insuline active (IOB) elevee au moment du depart",
      "Sorties longues (>45 min) ou enchainement de jours de running",
    ],
    actions: [
      "Si repas <1h avant: reduire le bolus de 50%",
      "Si repas 1-2h avant: reduire le bolus de 30%",
      "Emporter du sucre rapide (15-20g) pour chaque sortie",
      "Si glycemie <120 avant de partir: prendre 15-20g de glucides sans bolus",
      "Surveiller la glycemie pendant les 6h apres la sortie",
      "Possibilite de reduire la basale le soir si longue sortie (discuter avec l'endocrinologue)",
    ],
    timing: "Impact pendant la course, chute continue 30-60 min apres",
    glucoseImpact: "-40 a -80 mg/dL, moyenne constatee -60 mg/dL",
  },
];

export default function PatternsPage() {
  const { diabetesConfig } = useStore();

  return (
    <div className="p-6 md:p-8 max-w-5xl mx-auto">
      <PageHeader
        title="Patterns glycemiques"
        subtitle="Analyse detaillee des patterns connus et strategies d'adaptation"
        action={
          <Link href="/diabete">
            <Button variant="secondary" size="sm">
              &larr; Retour diabete
            </Button>
          </Link>
        }
      />

      {/* Summary bar */}
      <Card className="mb-8">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <span className="text-2xl font-bold text-[#00ff94]">{PATTERN_DETAILS.length}</span>
            <span className="text-sm text-white/50">patterns identifies et documentes</span>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Badge color="orange">
              {PATTERN_DETAILS.filter((p) => p.severity === "warning").length} warnings
            </Badge>
            <Badge color="red">
              {PATTERN_DETAILS.filter((p) => p.severity === "danger").length} a risque
            </Badge>
          </div>
        </div>
      </Card>

      <InfoBox variant="info">
        Ces patterns sont bases sur tes donnees personnelles et la configuration de ton profil diabete
        (ratios {diabetesConfig.ratios.morning}/{diabetesConfig.ratios.lunch}/{diabetesConfig.ratios.dinner},
        ISF {diabetesConfig.insulinSensitivityFactor}, cible {diabetesConfig.targetGlucose} mg/dL).
        Discute toujours avec ton endocrinologue avant de modifier tes doses.
      </InfoBox>

      {/* Pattern cards */}
      <div className="space-y-6 mt-8">
        {PATTERN_DETAILS.map((pattern) => {
          const borderColor =
            pattern.severity === "danger"
              ? "border-[#ff4757]/30"
              : pattern.severity === "warning"
                ? "border-[#ff9500]/30"
                : "border-[#00d4ff]/30";
          const glowColor =
            pattern.severity === "danger"
              ? "orange"
              : pattern.severity === "warning"
                ? "orange"
                : "blue";

          return (
            <Card key={pattern.name} glow={glowColor as "green" | "blue" | "purple" | "orange"} className={`border ${borderColor}`}>
              {/* Header */}
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg ${
                      pattern.severity === "danger"
                        ? "bg-[#ff4757]/15 text-[#ff4757]"
                        : pattern.severity === "warning"
                          ? "bg-[#ff9500]/15 text-[#ff9500]"
                          : "bg-[#00d4ff]/15 text-[#00d4ff]"
                    }`}
                    dangerouslySetInnerHTML={{ __html: pattern.icon }}
                  />
                  <div>
                    <h3 className="text-lg font-semibold">{pattern.name}</h3>
                    <p className="text-sm text-white/40">{pattern.description}</p>
                  </div>
                </div>
                <Badge
                  color={pattern.severity === "danger" ? "red" : pattern.severity === "warning" ? "orange" : "blue"}
                >
                  {pattern.severity === "danger" ? "Risque eleve" : pattern.severity === "warning" ? "Attention" : "Info"}
                </Badge>
              </div>

              {/* Impact & timing summary */}
              <div className="grid grid-cols-2 gap-3 mb-5">
                <div className="p-3 rounded-xl bg-white/[0.03]">
                  <p className="text-xs text-white/35 mb-1">Impact glycemique</p>
                  <p
                    className={`text-sm font-semibold ${
                      pattern.glucoseImpact.startsWith("-") ? "text-[#00d4ff]" : "text-[#ff9500]"
                    }`}
                  >
                    {pattern.glucoseImpact}
                  </p>
                </div>
                <div className="p-3 rounded-xl bg-white/[0.03]">
                  <p className="text-xs text-white/35 mb-1">Fenetre temporelle</p>
                  <p className="text-sm font-medium text-white/70">{pattern.timing}</p>
                </div>
              </div>

              {/* Detailed explanation */}
              <div className="mb-5">
                <p className="text-xs text-white/40 font-medium mb-2 uppercase tracking-wider">Explication detaillee</p>
                <p className="text-sm text-white/55 leading-relaxed">{pattern.detailedExplanation}</p>
              </div>

              {/* Triggers */}
              <div className="mb-5">
                <p className="text-xs text-white/40 font-medium mb-2 uppercase tracking-wider">Declencheurs</p>
                <div className="space-y-1.5">
                  {pattern.triggers.map((trigger, i) => (
                    <div key={i} className="flex items-start gap-2 text-sm">
                      <span className="text-[#ff9500] mt-0.5 shrink-0">&#9679;</span>
                      <span className="text-white/50">{trigger}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Actions */}
              <div>
                <p className="text-xs text-white/40 font-medium mb-2 uppercase tracking-wider">Actions recommandees</p>
                <div className="space-y-1.5">
                  {pattern.actions.map((action, i) => (
                    <div key={i} className="flex items-start gap-2 text-sm">
                      <span className="text-[#00ff94] mt-0.5 shrink-0">&#10003;</span>
                      <span className="text-white/60">{action}</span>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Footer info */}
      <div className="mt-8">
        <InfoBox variant="warning">
          <span className="font-medium">Rappel important:</span> Ces recommandations sont basees sur tes patterns personnels
          et les donnees scientifiques generales sur le diabete de type 1 et l&apos;exercice. Elles ne remplacent pas l&apos;avis
          de ton endocrinologue. Toute modification significative des doses d&apos;insuline (ratios, basale, ISF)
          doit etre validee par ton equipe medicale.
        </InfoBox>
      </div>
    </div>
  );
}
