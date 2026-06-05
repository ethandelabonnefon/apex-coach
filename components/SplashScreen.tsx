"use client";

import { useEffect, useState } from "react";
import Logo from "@/components/Logo";

export function SplashScreen({ children }: { children: React.ReactNode }) {
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 1200);
    return () => clearTimeout(timer);
  }, []);

  if (isLoading) {
    return (
      <div
        className="fixed inset-0 flex flex-col items-center justify-center z-[100]"
        style={{ background: "var(--bg-primary)" }}
      >
        <Logo size={56} />
        <p
          className="mt-5 text-sm font-semibold tracking-tight"
          style={{ color: "var(--text-primary)" }}
        >
          APEX
        </p>
        <p className="label mt-1">Precision Coach</p>
        <div className="mt-8">
          <div
            className="w-6 h-6 border-2 rounded-full animate-spin"
            style={{
              borderColor: "var(--accent)",
              borderTopColor: "transparent",
            }}
          />
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
