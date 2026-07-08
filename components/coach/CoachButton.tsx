"use client";

import { useState, useRef, useCallback, useEffect } from "react";

interface CoachButtonProps {
  onClick: () => void;
  hasUnread?: boolean;
}

const STORAGE_KEY = "apex-coach-btn-pos-v2";
const LEGACY_KEY = "apex-coach-btn-pos";
const DEFAULT_POS = { x: -1, y: -1 }; // -1 means "use default"

function loadPosition(): { x: number; y: number } {
  try {
    // Drop any pre-v2 stored position so users on a stale overlap get reset.
    localStorage.removeItem(LEGACY_KEY);
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return DEFAULT_POS;
}

function savePosition(pos: { x: number; y: number }) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pos));
  } catch {}
}

export default function CoachButton({ onClick, hasUnread }: CoachButtonProps) {
  // Always start at DEFAULT_POS so server and client render the same HTML
  // (null); the saved position is applied after mount to avoid hydration
  // mismatches from reading localStorage during the first render.
  const [pos, setPos] = useState(DEFAULT_POS);
  const isDragging = useRef(false);
  const hasMoved = useRef(false);
  const startTouch = useRef({ x: 0, y: 0 });
  const startPos = useRef({ x: 0, y: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);

  // Clamp position to viewport
  const clamp = useCallback((x: number, y: number) => {
    const size = 56;
    const margin = 8;
    const maxX = window.innerWidth - size - margin;
    const maxY = window.innerHeight - size - margin;
    return {
      x: Math.max(margin, Math.min(x, maxX)),
      y: Math.max(margin, Math.min(y, maxY)),
    };
  }, []);

  // Constrain Y to a "safe zone" — only the very top (under header) or the
  // bottom (above mobile nav). This guarantees the button can never sit over
  // central content like the "Générer mon programme" CTA.
  const constrainY = useCallback((y: number) => {
    const size = 56;
    const topZoneMax = 80; // just under app header
    const bottomZoneMin = window.innerHeight - size - 100; // above bottom nav
    if (y <= (topZoneMax + bottomZoneMin) / 2) {
      return Math.min(Math.max(y, 16), topZoneMax);
    }
    return Math.max(Math.min(y, bottomZoneMin), bottomZoneMin - 60);
  }, []);

  // Initialize position on mount: load the saved position (localStorage is
  // client-only, so this can't run during SSR/hydration), default to
  // bottom-right, and force-snap any previously saved position to a safe
  // edge zone.
  useEffect(() => {
    const size = 56;
    const margin = 16;
    const saved = loadPosition();
    if (saved.x === -1 && saved.y === -1) {
      const defaultPos = clamp(window.innerWidth - size - margin, window.innerHeight - size - 100);
      setPos(defaultPos);
      savePosition(defaultPos);
      return;
    }
    const rightEdge = window.innerWidth - size - margin;
    const centerX = saved.x + size / 2;
    const snappedX = centerX < window.innerWidth / 2 ? margin : rightEdge;
    const snappedY = constrainY(saved.y);
    const snapped = clamp(snappedX, snappedY);
    setPos(snapped);
    if (snapped.x !== saved.x || snapped.y !== saved.y) {
      savePosition(snapped);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    isDragging.current = true;
    hasMoved.current = false;
    const touch = e.touches[0];
    startTouch.current = { x: touch.clientX, y: touch.clientY };
    startPos.current = { x: pos.x, y: pos.y };
  }, [pos]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isDragging.current) return;
    const touch = e.touches[0];
    const dx = touch.clientX - startTouch.current.x;
    const dy = touch.clientY - startTouch.current.y;

    if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
      hasMoved.current = true;
    }

    const newPos = clamp(startPos.current.x + dx, startPos.current.y + dy);
    setPos(newPos);
  }, [clamp]);

  // Snap to nearest edge (left/right horizontally, top/bottom safe zone
  // vertically) so the button never blocks center content.
  const snapToEdge = useCallback((p: { x: number; y: number }) => {
    const size = 56;
    const margin = 16;
    const centerX = p.x + size / 2;
    const snappedX =
      centerX < window.innerWidth / 2
        ? margin
        : window.innerWidth - size - margin;
    return clamp(snappedX, constrainY(p.y));
  }, [clamp, constrainY]);

  const handleTouchEnd = useCallback(() => {
    isDragging.current = false;
    if (hasMoved.current) {
      const snapped = snapToEdge(pos);
      setPos(snapped);
      savePosition(snapped);
    }
  }, [pos, snapToEdge]);

  const handleClick = useCallback(() => {
    // If drag just ended with movement, skip this click
    if (hasMoved.current) {
      hasMoved.current = false;
      return;
    }
    onClick();
  }, [onClick]);

  // Don't render until position is initialized
  if (pos.x === -1 && pos.y === -1) return null;

  return (
    <button
      ref={btnRef}
      onClick={handleClick}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      className="fixed w-12 h-12 rounded-full flex items-center justify-center hover:scale-105 active:scale-95 transition-transform z-40 touch-none border"
      style={{
        left: pos.x,
        top: pos.y,
        background: "var(--bg-elevated)",
        borderColor: "var(--border-strong)",
        boxShadow: "0 8px 24px -8px rgba(0,0,0,0.6), 0 0 0 1px rgba(212,255,0,0.10)",
      }}
      aria-label="Coach assistant"
    >
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="var(--accent)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        <path d="M8 10h.01" />
        <path d="M12 10h.01" />
        <path d="M16 10h.01" />
      </svg>

      {/* Unread badge — utilise --error de la palette */}
      {hasUnread && (
        <span
          className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full border-2"
          style={{
            background: "var(--error)",
            borderColor: "var(--bg-primary)",
          }}
        />
      )}
    </button>
  );
}
