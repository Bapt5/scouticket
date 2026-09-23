import Link from "next/link";
import SuppressionCompte from "@/components/SuppressionCompte";

/** Page « Mon compte » : paramètres du profil de l’utilisateur connecté. */
export default function PageCompte() {
  return (
    <main className="min-h-screen bg-zinc-50 p-4">
      <div className="mx-auto max-w-md space-y-6 overflow-hidden rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
        <header className="flex items-start justify-between">
          <h1 className="text-2xl font-semibold text-zinc-900">Mon compte</h1>
          <Link href="/" className="text-sm text-zinc-600 underline">
            Retour
          </Link>
        </header>
        <SuppressionCompte />
      </div>
    </main>
  );
}
