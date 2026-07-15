"use client";

/**
 * RecoveryFigureCanvas — figure 3D dont la couleur du corps reflète le
 * Recovery Whoop du jour (bandes officielles : ≥67 vert / 34-66 jaune /
 * <34 rouge / no-data gris neutre), + 2 couches de données :
 *   - Respiration : léger cycle de scale piloté par Recovery + HRV
 *     (récup haute / HRV haute → souffle plus lent et posé).
 *   - Glow sommeil : intensité emissive + rim-light arrière pilotées par
 *     la Sleep performance (bien dormi → la figure "rayonne" davantage).
 *
 * Chargé UNIQUEMENT côté client via next/dynamic (ssr:false) dans
 * RecoveryFigure.tsx — Three.js a besoin du DOM et ne doit pas bloquer le
 * rendu du reste du dashboard ni le chemin critique PWA.
 *
 * Modèle : public/models/human_body.glb (mesh Object_0 / material Material.001,
 * PBR flat sans texture → color pilotable directement). Rendu debout (Y-up)
 * par les matrices Sketchfab. Cadrage auto via <Bounds>+<Center>.
 * Attribution CC-BY-4.0 (vistaalienprime) → /credits + caption.
 */

import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { useGLTF, Bounds, Center } from "@react-three/drei";
import * as THREE from "three";

const MODEL_URL = "/models/human_body.glb";
useGLTF.preload(MODEL_URL);

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** Résout la couleur (hex) depuis les tokens thème selon la bande Whoop. */
function resolveRecoveryHex(score: number | null): string {
  const cs = getComputedStyle(document.documentElement);
  const pick = (v: string, fallback: string) =>
    cs.getPropertyValue(v).trim() || fallback;
  if (score === null || Number.isNaN(score)) return pick("--text-tertiary", "#8a8a8f");
  if (score >= 67) return pick("--success", "#34c759");
  if (score >= 34) return pick("--warning", "#ff9500");
  return pick("--error", "#ff3b30");
}

function Model({
  score,
  themeKey,
  sleep01,
}: {
  score: number | null;
  themeKey: string;
  sleep01: number;
}) {
  const { scene } = useGLTF(MODEL_URL);
  const cloned = useMemo(() => scene.clone(true), [scene]);
  const matRef = useRef<THREE.MeshStandardMaterial | null>(null);

  // themeKey est une dépendance volontaire : au toggle de thème, les tokens
  // CSS (--success/--warning/--error) changent → il faut re-résoudre le hex.
  const targetColor = useMemo(
    () => new THREE.Color(resolveRecoveryHex(score)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [score, themeKey],
  );

  // Emissive intensity pilotée par le sommeil : 0.14 (peu/pas dormi) → 0.40 (top).
  const targetEmissive = 0.14 + sleep01 * 0.26;

  useEffect(() => {
    cloned.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh && mesh.material) {
        const src = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
        const m = (src as THREE.MeshStandardMaterial).clone();
        m.color.copy(targetColor);
        m.emissive = targetColor.clone();
        m.emissiveIntensity = targetEmissive;
        mesh.material = m;
        matRef.current = m;
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cloned]);

  useFrame((_, delta) => {
    const m = matRef.current;
    if (!m) return;
    const t = Math.min(1, delta * 3);
    m.color.lerp(targetColor, t);
    m.emissive.lerp(targetColor, t);
    m.emissiveIntensity += (targetEmissive - m.emissiveIntensity) * t;
  });

  return <primitive object={cloned} />;
}

/** Cycle de respiration : léger scale sinusoïdal autour du centre. */
function Breathing({
  score,
  hrvMs,
  children,
}: {
  score: number | null;
  hrvMs: number | null;
  children: React.ReactNode;
}) {
  const ref = useRef<THREE.Group>(null);
  const params = useMemo(() => {
    const rec01 = score === null ? 0.5 : clamp01(score / 100);
    const hrv01 = hrvMs === null ? 0.5 : clamp01((hrvMs - 20) / 80); // ~20..100ms
    const calm = rec01 * 0.6 + hrv01 * 0.4; // 0 (tendu) → 1 (posé)
    return {
      period: 3.2 + calm * 2.6, // 3.2s (rapide) → 5.8s (lent, posé)
      amp: 0.016 - calm * 0.005, // souffle un peu plus ample si fatigué
    };
  }, [score, hrvMs]);

  useFrame((state) => {
    const g = ref.current;
    if (!g) return;
    const phase = (state.clock.elapsedTime / params.period) * Math.PI * 2;
    const s = 1 + params.amp * (Math.sin(phase) * 0.5 + 0.5); // 1 → 1+amp
    g.scale.setScalar(s);
  });

  return <group ref={ref}>{children}</group>;
}

function ReadySignal({ onReady }: { onReady: () => void }) {
  useEffect(() => {
    onReady();
  }, [onReady]);
  return null;
}

export default function RecoveryFigureCanvas({
  score,
  hrvMs,
  sleepPerformance,
  themeKey,
  onReady,
}: {
  score: number | null;
  hrvMs: number | null;
  sleepPerformance: number | null;
  themeKey: string;
  onReady: () => void;
}) {
  const sleep01 = sleepPerformance === null ? 0.4 : clamp01(sleepPerformance / 100);

  return (
    <Canvas
      camera={{ position: [0, 0, 6], fov: 35 }}
      dpr={[1, 2]}
      gl={{ antialias: true, alpha: true }}
      style={{ width: "100%", height: "100%" }}
    >
      {/* Éclairage self-contained : aucun HDR externe (offline / PWA-safe). */}
      <hemisphereLight args={[0xffffff, 0x404048, 1.0]} />
      <directionalLight position={[3, 5, 4]} intensity={1.4} />
      <directionalLight position={[-4, 2, -3]} intensity={0.5} />
      {/* Rim-light arrière : halo "sommeil" (bien dormi → figure plus rayonnante) */}
      <directionalLight position={[0, 3, -6]} intensity={0.4 + sleep01 * 1.1} />

      <Bounds fit clip observe margin={1.1}>
        <Center>
          <Breathing score={score} hrvMs={hrvMs}>
            <Model score={score} themeKey={themeKey} sleep01={sleep01} />
          </Breathing>
        </Center>
      </Bounds>
      <ReadySignal onReady={onReady} />
    </Canvas>
  );
}
