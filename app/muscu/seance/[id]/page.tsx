import { MUSCU_PROGRAM } from "@/lib/constants";
import { SessionClient } from "./session-client";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const session = MUSCU_PROGRAM.sessions.find((s) => s.id === id);
  if (!session) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold mb-4">Seance introuvable</h1>
        <p className="text-white/40">Aucune seance ne correspond a l&apos;identifiant &quot;{id}&quot;.</p>
      </div>
    );
  }

  return <SessionClient sessionId={id} />;
}
