"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ChampDebutAnneeComptable,
  type DebutAnneeComptableSaisi,
} from "@/components/ChampDebutAnneeComptable";
import { DialogConfirmationSaisie } from "@/components/DialogConfirmationSaisie";
import { InterrupteurParametre } from "@/components/InterrupteurParametre";
import { LogoGroupe } from "@/components/LogoGroupe";
import { SelecteurMoyensPaiement } from "@/components/SelecteurMoyensPaiement";
import { TauxKilometre } from "@/components/TauxKilometre";
import { clientAuth } from "@/lib/auth-client";
import { erreurDebutAnneeComptable } from "@/lib/nomenclature";
import {
  PARAMETRES_GROUPE_PAR_DEFAUT,
  type ParametresGroupe,
} from "@/lib/parametresGroupe";

type Groupe = { isAdmin: boolean; parametres?: ParametresGroupe };

export default function PageParametresGroupe() {
  const { data: organisation, isPending: organisationEnChargement } =
    clientAuth.useActiveOrganization();
  const [parametres, setParametres] = useState<ParametresGroupe>(
    PARAMETRES_GROUPE_PAR_DEFAUT,
  );
  const [chargement, setChargement] = useState(true);
  const [estAdministrateur, setEstAdministrateur] = useState(false);
  const [enregistrement, setEnregistrement] = useState(false);
  const [message, setMessage] = useState("");
  // Désactivation de l'historique : nombre d'entrées affiché dans le dialog (null = fermé).
  const [entreesHistorique, setEntreesHistorique] = useState<number | null>(
    null,
  );
  const [suppressionHistoriqueEnCours, setSuppressionHistoriqueEnCours] =
    useState(false);
  const [erreurHistorique, setErreurHistorique] = useState("");
  const [exportEnCours, setExportEnCours] = useState(false);
  const [historiqueExporte, setHistoriqueExporte] = useState(false);
  // Désactivation du suivi budgétaire : postes et écritures affectées (null = fermé).
  const [donneesBudget, setDonneesBudget] = useState<{
    postes: number;
    ecritures: number;
  } | null>(null);
  const [suppressionBudgetEnCours, setSuppressionBudgetEnCours] =
    useState(false);
  const [erreurBudget, setErreurBudget] = useState("");
  const [exportBudgetEnCours, setExportBudgetEnCours] = useState(false);
  const [budgetExporte, setBudgetExporte] = useState(false);
  // Brouillon du début d'année comptable : enregistré à la demande (saisie intermédiaire invalide).
  const [debutAnnee, setDebutAnnee] = useState<DebutAnneeComptableSaisi>(
    PARAMETRES_GROUPE_PAR_DEFAUT.anneeComptableDebut,
  );

  useEffect(() => {
    fetch("/api/group/config")
      .then((reponse) => (reponse.ok ? reponse.json() : null))
      .then((groupe: Groupe | null) => {
        if (!groupe?.isAdmin) {
          setMessage("Accès réservé aux responsables du groupe.");
          return;
        }
        setEstAdministrateur(true);
        const charges = {
          ...PARAMETRES_GROUPE_PAR_DEFAUT,
          ...groupe.parametres,
        };
        setParametres(charges);
        setDebutAnnee(charges.anneeComptableDebut);
      })
      .catch(() => setMessage("Impossible de charger les paramètres."))
      .finally(() => setChargement(false));
  }, []);

  // Chaque interrupteur s'enregistre immédiatement ; l'état est rétabli en cas d'échec.
  const modifier = async (modification: Partial<ParametresGroupe>) => {
    const precedents = parametres;
    setParametres({ ...parametres, ...modification });
    setEnregistrement(true);
    setMessage("");
    try {
      const reponse = await fetch("/api/group/parametres", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(modification),
      });
      const corps = reponse.ok
        ? ((await reponse.json().catch(() => null)) as {
            parametres?: ParametresGroupe;
          } | null)
        : null;
      if (!corps?.parametres) throw new Error("PARAMETRES_NON_ENREGISTRES");
      setParametres(corps.parametres);
      setMessage("Paramètres enregistrés.");
    } catch {
      setParametres(precedents);
      setMessage("Impossible d’enregistrer le paramètre. Réessayez.");
    } finally {
      setEnregistrement(false);
    }
  };

  const demanderDesactivationHistorique = async () => {
    setErreurHistorique("");
    setHistoriqueExporte(false);
    const reponse = await fetch("/api/historique?taille=1").catch(() => null);
    const corps = reponse?.ok
      ? ((await reponse.json().catch(() => null)) as { total?: number } | null)
      : null;
    setEntreesHistorique(corps?.total ?? 0);
  };

  // Propose de garder une copie de l'historique avant sa suppression définitive.
  const exporterHistorique = async () => {
    setExportEnCours(true);
    setErreurHistorique("");
    try {
      const reponse = await fetch("/api/historique/export");
      if (!reponse.ok) throw new Error("EXPORT_IMPOSSIBLE");
      const adresse = URL.createObjectURL(await reponse.blob());
      const lien = document.createElement("a");
      lien.href = adresse;
      lien.download = "historique.csv";
      lien.click();
      URL.revokeObjectURL(adresse);
      setHistoriqueExporte(true);
    } catch {
      setErreurHistorique("Impossible d’exporter l’historique. Réessayez.");
    } finally {
      setExportEnCours(false);
    }
  };

  const desactiverHistorique = async () => {
    setSuppressionHistoriqueEnCours(true);
    setErreurHistorique("");
    try {
      const reponse = await fetch("/api/group/parametres", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          historiqueActif: false,
          confirmationSuppressionHistorique: true,
        }),
      });
      const corps = reponse.ok
        ? ((await reponse.json().catch(() => null)) as {
            parametres?: ParametresGroupe;
          } | null)
        : null;
      if (!corps?.parametres) throw new Error("HISTORIQUE_NON_DESACTIVE");
      setParametres(corps.parametres);
      setEntreesHistorique(null);
      setMessage("Historique désactivé et supprimé.");
    } catch {
      setErreurHistorique("Impossible de supprimer l’historique. Réessayez.");
    } finally {
      setSuppressionHistoriqueEnCours(false);
    }
  };

  const demanderDesactivationBudget = async () => {
    setErreurBudget("");
    setBudgetExporte(false);
    const reponse = await fetch("/api/budget/donnees").catch(() => null);
    const corps = reponse?.ok
      ? ((await reponse.json().catch(() => null)) as {
          postes?: number;
          ecritures?: number;
        } | null)
      : null;
    setDonneesBudget({
      postes: corps?.postes ?? 0,
      ecritures: corps?.ecritures ?? 0,
    });
  };

  // Propose de garder une copie du suivi avant la suppression des postes et budgets.
  const exporterBudget = async () => {
    setExportBudgetEnCours(true);
    setErreurBudget("");
    try {
      const reponse = await fetch("/api/budget/export");
      if (!reponse.ok) throw new Error("EXPORT_IMPOSSIBLE");
      const adresse = URL.createObjectURL(await reponse.blob());
      const lien = document.createElement("a");
      lien.href = adresse;
      lien.download = "suivi-budgetaire.csv";
      lien.click();
      URL.revokeObjectURL(adresse);
      setBudgetExporte(true);
    } catch {
      setErreurBudget("Impossible d’exporter le suivi. Réessayez.");
    } finally {
      setExportBudgetEnCours(false);
    }
  };

  const desactiverBudget = async () => {
    setSuppressionBudgetEnCours(true);
    setErreurBudget("");
    try {
      const reponse = await fetch("/api/group/parametres", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          budgetActif: false,
          confirmationSuppressionBudget: true,
        }),
      });
      const corps = reponse.ok
        ? ((await reponse.json().catch(() => null)) as {
            parametres?: ParametresGroupe;
          } | null)
        : null;
      if (!corps?.parametres) throw new Error("BUDGET_NON_DESACTIVE");
      setParametres(corps.parametres);
      setDonneesBudget(null);
      setMessage("Suivi budgétaire désactivé et supprimé.");
    } catch {
      setErreurBudget(
        "Impossible de supprimer le suivi budgétaire. Réessayez.",
      );
    } finally {
      setSuppressionBudgetEnCours(false);
    }
  };

  const erreurDebutAnnee = erreurDebutAnneeComptable(
    debutAnnee.mois,
    debutAnnee.jour,
  );
  const debutEnregistre =
    parametres.anneeComptableDebut ??
    PARAMETRES_GROUPE_PAR_DEFAUT.anneeComptableDebut;
  const debutAnneeModifie =
    debutAnnee.mois !== debutEnregistre.mois ||
    debutAnnee.jour !== debutEnregistre.jour;

  if (organisationEnChargement)
    return (
      <main className="min-h-screen bg-zinc-50 p-6 text-center text-zinc-600">
        Chargement…
      </main>
    );
  if (!organisation)
    return (
      <main className="min-h-screen bg-zinc-50 p-6 text-center text-zinc-600">
        Aucun groupe actif.
      </main>
    );
  return (
    <main className="min-h-screen bg-zinc-50 p-4">
      <section className="mx-auto max-w-lg rounded-xl border border-zinc-200 bg-white p-6">
        <Link href="/" className="text-sm text-[#1E3A8A]">
          ← Retour
        </Link>
        <h1 className="mt-4 text-2xl font-semibold text-zinc-900">
          Paramètres du groupe
        </h1>
        <p className="mt-2 text-zinc-600">{organisation.name}</p>
        {chargement ? (
          <p className="mt-5 text-sm text-zinc-600">Chargement…</p>
        ) : !estAdministrateur ? (
          <p className="mt-5 text-sm text-rose-600">{message}</p>
        ) : (
          <div className="mt-5 space-y-5">
            <h2 className="text-lg font-semibold text-zinc-900">
              Année comptable
            </h2>
            <div className="space-y-2">
              <ChampDebutAnneeComptable
                valeur={debutAnnee}
                onChange={setDebutAnnee}
                desactive={enregistrement}
              />
              <p className="text-xs text-zinc-500">
                Sert à l’historique, au suivi budgétaire et à la numérotation
                des justificatifs. Le format d’affichage se règle dans la{" "}
                <Link
                  href="/gestion-nomenclature"
                  className="underline text-[#1E3A8A]"
                >
                  nomenclature
                </Link>
                .
              </p>
              <button
                type="button"
                disabled={
                  enregistrement ||
                  Boolean(erreurDebutAnnee) ||
                  !debutAnneeModifie
                }
                onClick={() =>
                  void modifier({
                    anneeComptableDebut: {
                      mois: debutAnnee.mois,
                      jour: debutAnnee.jour,
                    },
                  })
                }
                className="rounded-lg bg-[#1E3A8A] px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                Enregistrer le début de l’année comptable
              </button>
            </div>
            <h2 className="text-lg font-semibold text-zinc-900">
              Justificatifs
            </h2>
            <InterrupteurParametre
              id="scan-justificatifs"
              titre="Scan automatique des justificatifs"
              description="Détecte, redresse et recadre automatiquement les photos et images importées. Les membres peuvent ajuster le recadrage avant l’ajout. Les PDF sont ajoutés tels quels."
              actif={parametres.scanJustificatifsActif}
              desactive={enregistrement}
              onChange={(actif) => modifier({ scanJustificatifsActif: actif })}
            />
            <InterrupteurParametre
              id="convertir-justificatifs-pdf"
              titre="Conversion des justificatifs en PDF"
              description="Convertit toutes les photos et images en PDF avant l’envoi par e-mail à la trésorerie (un PDF par justificatif). Désactivé, les justificatifs sont envoyés dans leur format d’origine."
              actif={parametres.convertirJustificatifsEnPdf}
              desactive={enregistrement}
              onChange={(actif) =>
                modifier({ convertirJustificatifsEnPdf: actif })
              }
            />
            <h2 className="text-lg font-semibold text-zinc-900">
              Notes de frais
            </h2>
            <InterrupteurParametre
              id="ndf-signee"
              titre="Notes de frais signées"
              description="Active la validation des notes de frais par signature avant envoi au trésorier."
              actif={parametres.ndfSigneeActif}
              desactive={enregistrement}
              onChange={(actif) => modifier({ ndfSigneeActif: actif })}
            />
            {parametres.ndfSigneeActif ? (
              <Link
                href="/parametres-groupe/signataires"
                className="block text-sm font-medium text-[#1E3A8A]"
              >
                Gestion des signataires →
              </Link>
            ) : (
              <p className="text-sm text-zinc-400">
                Gestion des signataires (activez les notes de frais signées pour
                y accéder)
              </p>
            )}
            <InterrupteurParametre
              id="ndf-km"
              titre="Notes de frais kilométriques"
              description={
                parametres.ndfSigneeActif
                  ? "Permet d’ajouter des kilomètres dans une note de frais, remboursés selon le taux du kilomètre ci-dessous."
                  : "Permet d’ajouter des kilomètres dans une note de frais (activez d’abord les notes de frais signées)."
              }
              actif={parametres.kmActif}
              desactive={enregistrement || !parametres.ndfSigneeActif}
              onChange={(actif) => modifier({ kmActif: actif })}
            />
            {parametres.kmActif && (
              <TauxKilometre
                taux={parametres.kmTaux}
                misAJourLe={parametres.kmTauxMajLe}
                desactive={enregistrement}
                onChange={(kmTaux) => modifier({ kmTaux })}
              />
            )}
            {parametres.ndfSigneeActif && (
              <LogoGroupe
                logoPersonnalise={parametres.logoPersonnalise}
                onChange={(logoPersonnalise) =>
                  setParametres((actuels) => ({
                    ...actuels,
                    logoPersonnalise,
                  }))
                }
              />
            )}
            <h2 className="text-lg font-semibold text-zinc-900">Historique</h2>
            <InterrupteurParametre
              id="historique"
              titre="Historique des dépenses, recettes et notes de frais"
              description="Conserve en base les dépenses, recettes et notes de frais envoyées à partir de l’activation (montants, catégories, unité, références), consultables et modifiables par les responsables. Les justificatifs ne sont jamais conservés : ils sont uniquement envoyés par e-mail au trésorier, qui doit les archiver. Désactiver l’historique supprime définitivement toutes ses entrées."
              actif={parametres.historiqueActif}
              desactive={
                enregistrement ||
                suppressionHistoriqueEnCours ||
                parametres.budgetActif
              }
              onChange={(actif) =>
                actif
                  ? modifier({ historiqueActif: true })
                  : void demanderDesactivationHistorique()
              }
            />
            {parametres.budgetActif && (
              <p className="text-sm text-zinc-500">
                Désactivez d’abord le suivi budgétaire pour pouvoir désactiver
                l’historique.
              </p>
            )}
            {parametres.historiqueActif && (
              <Link
                href="/historique"
                className="block text-sm font-medium text-[#1E3A8A]"
              >
                Consulter l’historique →
              </Link>
            )}
            <h2 className="text-lg font-semibold text-zinc-900">
              Suivi budgétaire
            </h2>
            <InterrupteurParametre
              id="budget"
              titre="Suivi budgétaire par poste"
              description={
                parametres.historiqueActif
                  ? "Associe chaque dépense et recette à un poste budgétaire (différent des catégories comptables) et compare le budget prévu au réalisé sur l’année comptable. Désactiver le suivi supprime définitivement les postes, les budgets et les affectations."
                  : "Associe chaque dépense et recette à un poste budgétaire et compare le budget prévu au réalisé (activez d’abord l’historique)."
              }
              actif={parametres.budgetActif}
              desactive={
                enregistrement ||
                suppressionBudgetEnCours ||
                !parametres.historiqueActif
              }
              onChange={(actif) =>
                actif
                  ? modifier({ budgetActif: true })
                  : void demanderDesactivationBudget()
              }
            />
            {parametres.budgetActif && (
              <Link
                href="/suivi-budgetaire"
                className="block text-sm font-medium text-[#1E3A8A]"
              >
                Consulter le suivi budgétaire →
              </Link>
            )}
            <h2 className="text-lg font-semibold text-zinc-900">
              Moyens de paiement
            </h2>
            <SelecteurMoyensPaiement
              id="moyens-paiement"
              libelle="Moyens de paiement du groupe"
              valeur={parametres.moyensPaiement}
              desactive={enregistrement}
              onChange={(moyensPaiement) => modifier({ moyensPaiement })}
            />
            {message && (
              <p role="status" className="text-sm text-zinc-600">
                {message}
              </p>
            )}
          </div>
        )}
      </section>
      {entreesHistorique !== null && (
        <DialogConfirmationSaisie
          id="titre-desactivation-historique"
          titre="Désactiver et supprimer l’historique"
          motConfirmation="SUPPRIMER"
          libelleConfirmation="Supprimer définitivement"
          libelleEnCours="Suppression…"
          enCours={suppressionHistoriqueEnCours}
          erreur={erreurHistorique}
          onConfirmer={() => void desactiverHistorique()}
          onFermer={() => setEntreesHistorique(null)}
        >
          <p>
            <strong>
              {entreesHistorique} entrée{entreesHistorique > 1 ? "s" : ""}
            </strong>{" "}
            de l’historique de ce groupe seront supprimées définitivement, sans
            possibilité de les récupérer.
          </p>
          <p>
            Aucune entrée ne sera enregistrée tant que l’historique restera
            désactivé.
          </p>
          {entreesHistorique > 0 && (
            <div className="flex flex-wrap items-center gap-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3">
              <p className="min-w-0 flex-1 text-zinc-700">
                Pensez à conserver une copie avant de supprimer.
              </p>
              <button
                type="button"
                disabled={exportEnCours || suppressionHistoriqueEnCours}
                onClick={() => void exporterHistorique()}
                className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-semibold text-zinc-700 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {exportEnCours
                  ? "Export…"
                  : historiqueExporte
                    ? "Exporter à nouveau"
                    : "Exporter en CSV"}
              </button>
              {historiqueExporte && (
                <p role="status" className="w-full text-emerald-700">
                  Export téléchargé.
                </p>
              )}
            </div>
          )}
        </DialogConfirmationSaisie>
      )}
      {donneesBudget !== null && (
        <DialogConfirmationSaisie
          id="titre-desactivation-budget"
          titre="Désactiver et supprimer le suivi budgétaire"
          motConfirmation="SUPPRIMER"
          libelleConfirmation="Supprimer définitivement"
          libelleEnCours="Suppression…"
          enCours={suppressionBudgetEnCours}
          erreur={erreurBudget}
          onConfirmer={() => void desactiverBudget()}
          onFermer={() => setDonneesBudget(null)}
        >
          <p>
            <strong>
              {donneesBudget.postes} poste{donneesBudget.postes > 1 ? "s" : ""}
            </strong>{" "}
            budgétaire{donneesBudget.postes > 1 ? "s" : ""} et leurs budgets
            seront supprimés définitivement, et{" "}
            <strong>
              {donneesBudget.ecritures} écriture
              {donneesBudget.ecritures > 1 ? "s" : ""}
            </strong>{" "}
            de l’historique perdront leur poste. Les montants de l’historique
            sont conservés.
          </p>
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3">
            <p className="min-w-0 flex-1 text-zinc-700">
              Pensez à conserver une copie du suivi de l’année en cours.
            </p>
            <button
              type="button"
              disabled={exportBudgetEnCours || suppressionBudgetEnCours}
              onClick={() => void exporterBudget()}
              className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-semibold text-zinc-700 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {exportBudgetEnCours
                ? "Export…"
                : budgetExporte
                  ? "Exporter à nouveau"
                  : "Exporter en CSV"}
            </button>
            {budgetExporte && (
              <p role="status" className="w-full text-emerald-700">
                Export téléchargé.
              </p>
            )}
          </div>
        </DialogConfirmationSaisie>
      )}
    </main>
  );
}
