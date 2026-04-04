"use client";

interface CoachButtonProps {
  onClick: () => void;
  hasUnread?: boolean;
}

export default function CoachButton({ onClick, hasUnread }: CoachButtonProps) {
  return (
    <button
      onClick={onClick}
      className="fixed bottom-24 right-6 w-14 h-14 bg-gradient-to-r from-[#a855f7] to-[#ec4899] rounded-full shadow-lg shadow-purple-500/25 flex items-center justify-center hover:scale-110 transition-transform z-40"
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
