"use client";

/**
 * RunningMap — carte Leaflet + OpenStreetMap (Phase B, mai 2026).
 *
 * Trace les points GPS sur une carte interactive :
 *  - Mode "live" : polyline qui se met à jour à chaque nouveau point,
 *    marker pulsant sur la position courante, auto-pan + zoom adapté
 *  - Mode "replay" : trace complète figée, markers début/fin, fit-bounds
 *    sur la bounding box de la séance
 *
 * ⚠️ Leaflet a besoin du DOM. Ce composant est `"use client"` strict ;
 * la page parent doit l'importer via `next/dynamic` avec `ssr: false`
 * pour éviter les erreurs de pré-rendu serveur.
 *
 * Tile provider : OpenStreetMap standard (gratuit, sans clé API).
 * Pour un design plus iOS-natif on pourra basculer vers MapKit JS plus
 * tard sans changer l'API du composant.
 */

import { useEffect, useMemo, useRef } from "react";
import { MapContainer, TileLayer, Polyline, CircleMarker, useMap } from "react-leaflet";
import type { LatLngExpression, LatLngBoundsExpression } from "leaflet";
import type { GpsPoint } from "@/lib/running-tracker";
import type { SessionGlucoseCheckpoint } from "@/types";
import "leaflet/dist/leaflet.css";

interface RunningMapProps {
  points: GpsPoint[];
  /** "live" : auto-pan + marker pulsant. "replay" : fit-bounds, markers début/fin. */
  mode: "live" | "replay";
  /** Hauteur CSS de la carte (default "100%"). */
  height?: string;
  /** Couleur de la trace (default sky #7FC7FF = running color). */
  strokeColor?: string;
  /** Phase C — si fourni + assez de checkpoints, segmente la polyline en
   *  couleurs selon la glycémie (vert / orange / rouge). */
  glucoseCheckpoints?: SessionGlucoseCheckpoint[];
}

/** Tone glycémie → couleur de trace. */
function glucoseToColor(value: number | null): string {
  if (value === null) return "#7FC7FF"; // sky default
  if (value < 70 || value > 250) return "#FF6B6B"; // hypo / hyper → rouge
  if (value < 80 || value > 180) return "#FFAE5C"; // low / high → orange
  return "#7AE582"; // target → vert
}

export default function RunningMap({
  points,
  mode,
  height = "100%",
  strokeColor = "#7FC7FF",
  glucoseCheckpoints,
}: RunningMapProps) {
  // Points filtrés (accuracy <= 30m) — utilisés par la polyline et les markers
  const filteredPoints = useMemo(
    () => points.filter((p) => p.accuracy <= 30),
    [points],
  );
  const positions: LatLngExpression[] = useMemo(
    () => filteredPoints.map((p) => [p.lat, p.lon] as [number, number]),
    [filteredPoints],
  );

  /**
   * Segmente la polyline en sous-polylines colorées selon la glycémie
   * la plus proche au moment du point. Renvoie un array de segments
   * { color, positions[] } à rendre comme N polylines.
   * Si pas assez de checkpoints (< 2) → null (fallback polyline unique).
   */
  const coloredSegments = useMemo(() => {
    if (!glucoseCheckpoints || glucoseCheckpoints.length < 2) return null;
    if (filteredPoints.length < 2) return null;

    // Trie les checkpoints par timestamp
    const sortedCps = [...glucoseCheckpoints].sort((a, b) => a.timestamp - b.timestamp);

    // Fonction qui trouve la glycémie active pour un timestamp donné
    // (dernier checkpoint <= ts ou le 1er si plus rien avant)
    const findGlucoseAt = (ts: number): number | null => {
      let value: number | null = null;
      for (const cp of sortedCps) {
        if (cp.timestamp <= ts) value = cp.value;
        else break;
      }
      // Si pas de checkpoint avant ts, prend le 1er (cas démarrage)
      if (value === null && sortedCps.length > 0) value = sortedCps[0].value;
      return value;
    };

    // Construit les segments en groupant les points par couleur consécutive
    const segments: { color: string; positions: [number, number][] }[] = [];
    let currentColor = "";
    let currentPositions: [number, number][] = [];

    for (const p of filteredPoints) {
      const value = findGlucoseAt(p.t);
      const color = glucoseToColor(value);
      if (color !== currentColor) {
        // Termine le segment précédent (en ajoutant le 1er point du nouveau
        // pour avoir une continuité visuelle)
        if (currentPositions.length > 0) {
          currentPositions.push([p.lat, p.lon]);
          segments.push({ color: currentColor, positions: currentPositions });
        }
        currentColor = color;
        currentPositions = [[p.lat, p.lon]];
      } else {
        currentPositions.push([p.lat, p.lon]);
      }
    }
    // Finalise le dernier segment
    if (currentPositions.length > 0) {
      segments.push({ color: currentColor, positions: currentPositions });
    }
    return segments;
  }, [glucoseCheckpoints, filteredPoints]);

  const lastPoint = positions[positions.length - 1];
  const firstPoint = positions[0];

  // Centre initial : dernier point GPS connu, ou Paris par défaut (fallback)
  const center: LatLngExpression = lastPoint ?? [48.8566, 2.3522];

  // Bounding box pour mode replay
  const bounds: LatLngBoundsExpression | undefined = useMemo(() => {
    if (positions.length < 2) return undefined;
    const lats = positions.map((p) => (p as [number, number])[0]);
    const lons = positions.map((p) => (p as [number, number])[1]);
    return [
      [Math.min(...lats), Math.min(...lons)],
      [Math.max(...lats), Math.max(...lons)],
    ] as [[number, number], [number, number]];
  }, [positions]);

  return (
    <div style={{ height, width: "100%", position: "relative" }}>
      <MapContainer
        center={center}
        zoom={16}
        scrollWheelZoom
        zoomControl={false}
        style={{ height: "100%", width: "100%", background: "#0A0A0B" }}
        attributionControl={false}
      >
        {/* Tile layer — OpenStreetMap dark friendly. Tu peux changer pour
            CartoDB Dark Matter ou Stamen pour un look plus tech si tu veux. */}
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; OSM &copy; CARTO'
          maxZoom={19}
        />

        {/* Trace GPS — segmentée colorée si glucoseCheckpoints fournis */}
        {coloredSegments
          ? coloredSegments.map((seg, i) => (
              <Polyline
                key={i}
                positions={seg.positions}
                pathOptions={{
                  color: seg.color,
                  weight: 4,
                  opacity: 0.9,
                  lineCap: "round",
                  lineJoin: "round",
                }}
              />
            ))
          : positions.length >= 2 && (
              <Polyline
                positions={positions}
                pathOptions={{
                  color: strokeColor,
                  weight: 4,
                  opacity: 0.9,
                  lineCap: "round",
                  lineJoin: "round",
                }}
              />
            )}

        {/* Markers */}
        {mode === "live" && lastPoint && (
          <>
            {/* Halo pulsant autour de la position courante */}
            <CircleMarker
              center={lastPoint}
              radius={16}
              pathOptions={{ color: strokeColor, fillColor: strokeColor, fillOpacity: 0.15, weight: 0 }}
            />
            {/* Dot solide pour la position */}
            <CircleMarker
              center={lastPoint}
              radius={6}
              pathOptions={{ color: "#FFFFFF", fillColor: strokeColor, fillOpacity: 1, weight: 2 }}
            />
          </>
        )}
        {mode === "replay" && firstPoint && (
          <CircleMarker
            center={firstPoint}
            radius={6}
            pathOptions={{ color: "#FFFFFF", fillColor: "#7AE582", fillOpacity: 1, weight: 2 }}
          />
        )}
        {mode === "replay" && lastPoint && positions.length > 1 && (
          <CircleMarker
            center={lastPoint}
            radius={6}
            pathOptions={{ color: "#FFFFFF", fillColor: "#FF6B6B", fillOpacity: 1, weight: 2 }}
          />
        )}

        {/* Comportements dynamiques (pan / fit-bounds) */}
        {mode === "live" ? (
          <LiveAutoPan position={lastPoint} />
        ) : (
          <ReplayFitBounds bounds={bounds} />
        )}
      </MapContainer>
    </div>
  );
}

/**
 * Centre automatiquement la carte sur la position courante (mode live).
 * Smooth pan, pas de zoom forcé pour ne pas désorienter l'utilisateur
 * qui veut zoomer manuellement.
 */
function LiveAutoPan({ position }: { position: LatLngExpression | undefined }) {
  const map = useMap();
  const lastPanRef = useRef<number>(0);
  useEffect(() => {
    if (!position) return;
    // Throttle à 1 pan/seconde max
    const now = Date.now();
    if (now - lastPanRef.current < 1000) return;
    lastPanRef.current = now;
    map.panTo(position, { animate: true, duration: 0.5 });
  }, [position, map]);
  return null;
}

/**
 * Fit-bounds sur la bounding box (mode replay).
 * Padding pour éviter que les markers début/fin touchent les bords.
 */
function ReplayFitBounds({ bounds }: { bounds: LatLngBoundsExpression | undefined }) {
  const map = useMap();
  useEffect(() => {
    if (!bounds) return;
    map.fitBounds(bounds, { padding: [40, 40], animate: true });
  }, [bounds, map]);
  return null;
}
