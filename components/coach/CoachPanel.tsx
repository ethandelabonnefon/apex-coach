"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useStore, type ActiveProgram } from "@/lib/store";
import { applyCoachModification } from "@/lib/coach-actions";

// ─── Types ────────────────────────────────────────────────
interface CoachAction {
  label: string;
  type: "apply" | "modify" | "explain" | "reject";
  payload?: Record<string, unknown>;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  actions?: CoachAction[];
}

interface CoachPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

// ─── Quick suggestions ───────────────────────────────────
const QUICK_SUGGESTIONS = [
  "Ajouter une séance",
  "Changer un exercice",
  "Pourquoi ce programme ?",
  "Ajuster le volume",
  "Séance bonus optionnelle",
];

// ─── Component ────────────────────────────────────────────
export default function CoachPanel({ isOpen, onClose }: CoachPanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const profile = useStore((s) => s.profile);
  const activeProgram = useStore((s) => s.activeProgram);
  const setActiveProgram = useStore((s) => s.setActiveProgram);
  const diagnosticHistory = useStore((s) => s.diagnosticHistory);
  const muscuDiagnosticData = useStore((s) => s.muscuDiagnosticData);
  const nutritionTargets = useStore((s) => s.nutritionTargets);

  // Welcome message
  useEffect(() => {
    if (isOpen && messages.length === 0) {
      setMessages([
        {
          id: "welcome",
          role: "assistant",
          content: `Salut ${profile.name} !\n\nJe suis ton coach IA APEX. Tu peux me poser des questions sur ton programme ou me demander de le modifier.\n\nPar exemple :\n• "Je veux ajouter une séance optionnelle"\n• "Pourquoi tu m'as mis du développé haltères ?"\n• "Je préfère faire du squat plutôt que leg press"`,
          timestamp: new Date().toISOString(),
        },
      ]);
    }
  }, [isOpen, messages.length, profile.name]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  // Focus input when panel opens
  useEffect(() => {
    if (isOpen) setTimeout(() => inputRef.current?.focus(), 350);
  }, [isOpen]);

  // Build user context for the API
  const buildUserContext = useCallback(() => {
    const latestDiag = diagnosticHistory[0];
    return {
      name: profile.name,
      age: profile.age,
      height: profile.height,
      weight: profile.weight,
      goals: profile.goals,
      diabetesType: profile.diabetesType,
      weakPoints: latestDiag?.weakPoints || [],
      muscuDiagnostic: muscuDiagnosticData,
      nutritionTargets: nutritionTargets,
    };
  }, [profile, diagnosticHistory, muscuDiagnosticData, nutritionTargets]);

  // Send a message
  const sendMessage = useCallback(
    async (text?: string) => {
      const messageText = text || input.trim();
      if (!messageText) return;

      const userMessage: Message = {
        id: Date.now().toString(),
        role: "user",
        content: messageText,
        timestamp: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, userMessage]);
      setInput("");
      setIsLoading(true);

      try {
        const response = await fetch("/api/coach-chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: messageText,
            conversationHistory: messages.filter((m) => m.id !== "welcome"),
            currentProgram: activeProgram,
            userDiagnostic: buildUserContext(),
          }),
        });

        if (!response.ok) throw new Error("API error");

        const data = await response.json();

        const assistantMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: data.message || "Je n'ai pas pu répondre. Réessaie !",
          timestamp: new Date().toISOString(),
          actions: data.actions,
        };

        setMessages((prev) => [...prev, assistantMessage]);
      } catch (error) {
        console.error("Coach chat error:", error);
        setMessages((prev) => [
          ...prev,
          {
            id: (Date.now() + 1).toString(),
            role: "assistant",
            content: "Oups, une erreur s'est produite. Réessaie dans un instant.",
            timestamp: new Date().toISOString(),
          },
        ]);
      } finally {
        setIsLoading(false);
      }
    },
    [input, messages, activeProgram, buildUserContext]
  );

  // Handle action buttons
  const handleAction = useCallback(
    async (action: CoachAction) => {
      if (action.type === "apply" && action.payload && activeProgram) {
        try {
          const updatedProgram = applyCoachModification(activeProgram, action.payload);
          setActiveProgram(updatedProgram);
          setMessages((prev) => [
            ...prev,
            {
              id: Date.now().toString(),
              role: "assistant",
              content: "Modification appliquée ! Ton programme a été mis à jour.",
              timestamp: new Date().toISOString(),
            },
          ]);
        } catch (err) {
          console.error("Apply error:", err);
          setMessages((prev) => [
            ...prev,
            {
              id: Date.now().toString(),
              role: "assistant",
              content: "Erreur lors de l'application. Tu peux reformuler ta demande.",
              timestamp: new Date().toISOString(),
            },
          ]);
        }
      } else if (action.type === "modify") {
        setInput(`Je voudrais modifier : ${action.label}`);
        inputRef.current?.focus();
      } else if (action.type === "explain") {
        sendMessage(`Explique-moi plus en détail : ${action.label}`);
      } else if (action.type === "reject") {
        setMessages((prev) => [
          ...prev,
          {
            id: Date.now().toString(),
            role: "assistant",
            content: "OK, on garde le programme actuel. N'hésite pas si tu as d'autres questions !",
            timestamp: new Date().toISOString(),
          },
        ]);
      }
    },
    [activeProgram, setActiveProgram, sendMessage]
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <>
      {/* Overlay */}
      {isOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40" onClick={onClose} />
      )}

      {/* Panel */}
      <div
        className={`fixed inset-y-0 right-0 w-full sm:w-[400px] bg-[#0f0f18] border-l border-white/[0.06] shadow-2xl flex flex-col z-50 transition-transform duration-300 ease-out ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-gradient-to-r from-[#a855f7] to-[#ec4899] flex items-center justify-center">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">APEX Coach</h2>
              <p className="text-[10px] text-white/35">Ton assistant personnel</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/[0.06] text-white/30 hover:text-white transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                  message.role === "user"
                    ? "bg-[#00ff94] text-black"
                    : "bg-white/[0.06]"
                }`}
              >
                <p className="whitespace-pre-wrap text-sm leading-relaxed">
                  {message.content}
                </p>

                {/* Action buttons */}
                {message.actions && message.actions.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-white/10">
                    {message.actions.map((action, i) => (
                      <button
                        key={i}
                        onClick={() => handleAction(action)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                          action.type === "apply"
                            ? "bg-[#00ff94] text-black hover:bg-[#00ff94]/80"
                            : action.type === "reject"
                            ? "bg-white/[0.06] text-white/50 hover:bg-white/[0.1]"
                            : "bg-[#a855f7]/20 text-[#a855f7] hover:bg-[#a855f7]/30"
                        }`}
                      >
                        {action.type === "apply" && "✓ "}
                        {action.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}

          {/* Loading indicator */}
          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-white/[0.06] rounded-2xl px-4 py-3">
                <div className="flex gap-1.5">
                  <span className="w-2 h-2 bg-white/30 rounded-full animate-bounce" />
                  <span
                    className="w-2 h-2 bg-white/30 rounded-full animate-bounce"
                    style={{ animationDelay: "0.15s" }}
                  />
                  <span
                    className="w-2 h-2 bg-white/30 rounded-full animate-bounce"
                    style={{ animationDelay: "0.3s" }}
                  />
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input area */}
        <div className="px-4 py-4 border-t border-white/[0.06]">
          {/* Quick suggestions */}
          <div className="flex flex-wrap gap-1.5 mb-3">
            {QUICK_SUGGESTIONS.map((suggestion) => (
              <button
                key={suggestion}
                onClick={() => {
                  setInput(suggestion);
                  inputRef.current?.focus();
                }}
                className="px-2.5 py-1 bg-white/[0.04] hover:bg-white/[0.08] rounded-full text-[11px] text-white/50 hover:text-white/70 transition-colors"
              >
                {suggestion}
              </button>
            ))}
          </div>

          {/* Input */}
          <div className="flex gap-2">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Pose ta question ou demande une modif..."
              className="flex-1 bg-white/[0.06] border border-white/[0.06] rounded-xl px-4 py-3 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-[#a855f7]/50 transition-colors"
            />
            <button
              onClick={() => sendMessage()}
              disabled={isLoading || !input.trim()}
              className="px-4 py-3 bg-gradient-to-r from-[#a855f7] to-[#ec4899] text-white rounded-xl font-medium text-sm disabled:opacity-30 transition-opacity hover:opacity-90"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 2L11 13" />
                <path d="M22 2L15 22L11 13L2 9L22 2Z" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
