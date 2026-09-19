"use client";

import { useState } from "react";
import CoachButton from "./CoachButton";
import CoachPanel from "./CoachPanel";

export default function CoachProvider() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <CoachButton onClick={() => setIsOpen(true)} />
      <CoachPanel isOpen={isOpen} onClose={() => setIsOpen(false)} />
    </>
  );
}
