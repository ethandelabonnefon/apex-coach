"use client";

import { useEffect, useState } from "react";

export function SplashScreen({ children }: { children: React.ReactNode }) {
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 1200);
    return () => clearTimeout(timer);
  }, []);

  if (isLoading) {
    return (
      <div className="fixed inset-0 bg-[#0a0a0f] flex flex-col items-center justify-center z-[100]">
        <h1 className="text-4xl font-bold">
          <span className="neon-green">APEX</span>{" "}
          <span className="text-white/60">Coach</span>
        </h1>
        <p className="text-white/35 mt-2 text-sm">Fitness · Nutrition · T1D</p>
        <div className="mt-8">
          <div className="w-8 h-8 border-3 border-[#00ff94] border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
