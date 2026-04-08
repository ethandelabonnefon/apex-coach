"use client";

import { useState, useRef, useCallback, useEffect } from "react";

interface CoachButtonProps {
  onClick: () => void;
  hasUnread?: boolean;
}

const STORAGE_KEY = "apex-coach-btn-pos";
const DEFAULT_POS = { x: -1, y: -1 }; // -1 means "use default"

function loadPosition(): { x: number; y: number } {
  if (typeof window === "undefined") return DEFAULT_POS;
  try {
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
  const [pos, setPos] = useState(loadPosition);
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

  // Initialize position on mount: default to bottom-right, and force-snap any
  // previously saved position to an edge so it can never block center content.
  useEffect(() => {
    if (pos.x === -1 && pos.y === -1) {
      const defaultPos = clamp(window.innerWidth - 56 - 16, window.innerHeight - 56 - 100);
      setPos(defaultPos);
      savePosition(defaultPos);
      return;
    }
    const size = 56;
    const margin = 16;
    const rightEdge = window.innerWidth - size - margin;
    if (pos.x !== margin && pos.x !== rightEdge) {
      const centerX = pos.x + size / 2;
      const snappedX = centerX < window.innerWidth / 2 ? margin : rightEdge;
      const snapped = clamp(snappedX, pos.y);
      setPos(snapped);
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

  // Snap to nearest horizontal edge (left or right) so the button never
  // blocks center content like the "Générer mon programme" button.
  const snapToEdge = useCallback((p: { x: number; y: number }) => {
    const size = 56;
    const margin = 16;
    const centerX = p.x + size / 2;
    const snappedX =
      centerX < window.innerWidth / 2
        ? margin
        : window.innerWidth - size - margin;
    return clamp(snappedX, p.y);
  }, [clamp]);

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
      className="fixed w-14 h-14 bg-gradient-to-r from-[#a855f7] to-[#ec4899] rounded-full shadow-lg shadow-purple-500/25 flex items-center justify-center hover:scale-110 active:scale-95 transition-transform z-40 touch-none"
      style={{ left: pos.x, top: pos.y }}
    >
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        <path d="M8 10h.01" />
        <path d="M12 10h.01" />
        <path d="M16 10h.01" />
      </svg>

      {/* Pulse animation */}
      <span className="absolute inset-0 rounded-full bg-[#a855f7] animate-ping opacity-20 pointer-events-none" />

      {/* Unread badge */}
      {hasUnread && (
        <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full border-2 border-[#0a0a0f]" />
      )}
    </button>
  );
}
