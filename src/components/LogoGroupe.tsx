"use client";

import { useRef, useState } from "react";
import logoSgdf from "@/assets/sgdf/logo.png";

const TAILLE_MAX_OCTETS = 1024 * 1024;
// Next fournit un objet d'image statique, Vitest une simple URL.
const URL_LOGO_SGDF = typeof logoSgdf === "string" ? logoSgdf : logoSgdf.src;

interface LogoGroupeProps {
  logoPersonnalise: boolean;
  onChange: (logoPersonnalise: boolean) => void;
}

/** Import / suppression du logo affiché sur la note de frais signée (SGDF par défaut). */
export function LogoGroupe({ logoPersonnalise, onChange }: LogoGroupeProps) {
  const champ = useRef<HTMLInputElement>(null);
  const [version, setVersion] = useState(0);
  const [occupe, setOccupe] = useState(false);
  const [message, setMessage] = useState("");
  const [dialogOuvert, setDialogOuvert] = useState(false);

  const importer = async (fichier: File) => {
    setMessage("");
    if (fichier.size > TAILLE_MAX_OCTETS) {
      setMessage("Fichier trop volumineux (1 Mo maximum).");
      return;
    }
    setOccupe(true);
    try {
      const corps = new FormData();
      corps.append("logo", fichier);
      const reponse = await fetch("/api/group/parametres/logo", {
        method: "PUT",
        body: corps,
      });
      if (!reponse.ok) {
        const erreur = (await reponse.json().catch(() => null)) as {
          error?: string;
        } | null;
        setMessage(erreur?.error ?? "Impossible d’importer le logo.");
        return;
      }
      setVersion((valeur) => valeur + 1);
      onChange(true);
      setMessage("Logo enregistré.");
    } catch {
      setMessage("Impossible d’importer le logo.");
    } finally {
      setOccupe(false);
      if (champ.current) champ.current.value = "";
    }
  };

  const retablir = async () => {
    setMessage("");
    setOccupe(true);
    try {
      const reponse = await fetch("/api/group/parametres/logo", {
        method: "DELETE",
      });
      if (!reponse.ok) throw new Error("LOGO_NON_SUPPRIME");
      onChange(false);
      setMessage("Logo SGDF rétabli.");
    } catch {
      setMessage("Impossible de rétablir le logo.");
    } finally {
      setOccupe(false);
    }
  };

  const apercu = (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={
        logoPersonnalise
          ? `/api/group/parametres/logo?v=${version}`
          : URL_LOGO_SGDF
      }
      alt={logoPersonnalise ? "Logo du groupe" : "Logo SGDF par défaut"}
      className="max-h-16 max-w-full object-contain"
    />
  );

  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-zinc-900">
          Logo de la note de frais
        </p>
        <p className="text-sm text-zinc-500">
          {logoPersonnalise ? "Logo personnalisé" : "Logo SGDF par défaut"}
        </p>
      </div>
      <button
        type="button"
        onClick={() => {
          setMessage("");
          setDialogOuvert(true);
        }}
        className="shrink-0 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-[#1E3A8A] hover:bg-zinc-50"
      >
        Modifier le logo
      </button>

      {dialogOuvert && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="titre-logo-groupe"
          className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/40 p-4"
          onClick={() => !occupe && setDialogOuvert(false)}
        >
          <div
            onClick={(evenement) => evenement.stopPropagation()}
            className="w-full max-w-md space-y-4 rounded-xl border border-zinc-200 bg-white p-6 shadow-xl"
          >
            <h2
              id="titre-logo-groupe"
              className="text-lg font-semibold text-zinc-900"
            >
              Logo de la note de frais
            </h2>
            <p className="text-sm text-zinc-600">
              Remplace le logo SGDF en en-tête de la note de frais signée. PNG,
              JPEG ou WebP, 1 Mo maximum, de 100x30 à 2000x2000 px. N’y placez
              aucune donnée personnelle. Le changement ne s’applique qu’aux
              nouvelles notes de frais.
            </p>
            <div className="space-y-2">
              <p className="text-sm font-medium text-zinc-900">
                Logo utilisé actuellement
              </p>
              <div className="flex min-h-16 items-center justify-center rounded-lg border border-zinc-200 bg-white p-3">
                {apercu}
              </div>
            </div>
            <input
              ref={champ}
              id="logo-groupe"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              disabled={occupe}
              aria-label="Importer un logo"
              className="sr-only"
              onChange={(evenement) => {
                const fichier = evenement.target.files?.[0];
                if (fichier) void importer(fichier);
              }}
            />
            <button
              type="button"
              disabled={occupe}
              onClick={() => champ.current?.click()}
              className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-[#1E3A8A] hover:bg-zinc-50 disabled:opacity-50"
            >
              {logoPersonnalise ? "Remplacer le logo" : "Importer un logo"}
            </button>
            {message && (
              <p role="status" className="text-sm text-zinc-600">
                {message}
              </p>
            )}
            <div className="flex flex-wrap justify-between gap-3">
              {logoPersonnalise ? (
                <button
                  type="button"
                  disabled={occupe}
                  onClick={() => void retablir()}
                  className="text-sm font-medium text-red-700 disabled:opacity-50"
                >
                  Rétablir le logo SGDF
                </button>
              ) : (
                <span />
              )}
              <button
                type="button"
                disabled={occupe}
                onClick={() => setDialogOuvert(false)}
                className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
