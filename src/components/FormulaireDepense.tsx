"use client";

import { useState, useEffect, useRef, type FormEvent } from "react";
import Image from "next/image";
import {
  ClipboardDocumentListIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  PaperAirplaneIcon,
  DocumentTextIcon,
} from "@heroicons/react/24/outline";
import { assainirSegmentNomFichier, devinerExtension } from "@/lib/attachments";
import {
  analyserDateIso,
  dedoublonnerNomsFichiers,
  genererNomsNomenclature,
  type ParametresAnneeComptable,
} from "@/lib/nomenclature";
import {
  MAX_ATTACHMENT_COUNT,
  MAX_ATTACHMENT_SIZE_BYTES,
  MAX_TOTAL_ATTACHMENTS_SIZE_BYTES,
  type PieceJointeDepense,
} from "@/constants/piecesJointes";
import { MODES_PAIEMENT } from "@/constants/configDepenses";
import {
  analyserMontantSaisi,
  detailSaisiComplet,
  detailSaisieVide,
  montantSaisiValide,
  totalLignes,
  versDepenseNomenclature,
  versDetailDepense,
  type DetailSaisie,
} from "@/lib/depenses";
import { AccordeonJustificatif } from "@/components/AccordeonJustificatif";
import { LignesCategories } from "@/components/LignesCategories";
import type { UniteGroupe } from "@/lib/group";

interface FormulaireDepenseProps {
  readonly piecesJointes: PieceJointeDepense[];
  readonly emailUtilisateur: string;
  readonly units: UniteGroupe[];
  readonly nomenclature?: {
    format: string | null;
    anneeComptable: ParametresAnneeComptable;
  };
  readonly uniteInitiale?: string;
  readonly treasuryVerified: boolean;
  readonly onChangementUnite?: (unitId: string) => void;
  readonly erreurEnregistrementUnite?: string;
  readonly onCreerNouvelleNote?: () => void;
  readonly onSupprimerPieceJointe?: (index: number) => void;
}

export function FormulaireDepense({
  piecesJointes,
  emailUtilisateur,
  units,
  nomenclature,
  uniteInitiale = "",
  treasuryVerified,
  onChangementUnite,
  erreurEnregistrementUnite,
  onCreerNouvelleNote,
  onSupprimerPieceJointe,
  estEnLigne = true,
}: FormulaireDepenseProps & { estEnLigne?: boolean }) {
  const [formulaire, setFormulaire] = useState({
    date: new Date().toISOString().split("T")[0],
    branche: uniteInitiale || "",
    description: "",
  });
  const [detailsDepenses, setDetailsDepenses] = useState<DetailSaisie[]>([]);
  const [indexOuvert, setIndexOuvert] = useState(0);
  const [erreurUnite, setErreurUnite] = useState("");
  const uniteSelectionnee = units.find(
    (unit) => unit.id === formulaire.branche,
  );

  const [envoiEnCours, setEnvoiEnCours] = useState(false);
  const [afficherErreursValidation, setAfficherErreursValidation] =
    useState(false);
  const [statutEnvoi, setStatutEnvoi] = useState<{
    type: "succes" | "erreur" | null;
    message: string;
  }>({ type: null, message: "" });

  const modifierChamp = (
    champ: "date" | "branche" | "description",
    valeur: string,
  ) => {
    if (
      champ === "branche" &&
      valeur !== "" &&
      !units.some((unite) => unite.id === valeur)
    ) {
      setErreurUnite("Cette unité n’est pas autorisée pour ce groupe.");
      return;
    }

    setFormulaire((prev) => ({ ...prev, [champ]: valeur }));
    if (champ === "branche") {
      setErreurUnite("");
      onChangementUnite?.(valeur);
    }
    if (statutEnvoi.type) {
      setStatutEnvoi({ type: null, message: "" });
    }
  };

  useEffect(() => {
    setDetailsDepenses((precedents) =>
      piecesJointes.map((_, index) => precedents[index] ?? detailSaisieVide()),
    );
  }, [piecesJointes]);

  const detailPourIndex = (index: number) =>
    detailsDepenses[index] ?? detailSaisieVide();

  const modifierDetailDepense = (
    index: number,
    modification: Partial<DetailSaisie>,
  ) => {
    setDetailsDepenses((precedents) =>
      piecesJointes.map((_, detailIndex) => {
        const detail = precedents[detailIndex] ?? detailSaisieVide();
        return detailIndex === index ? { ...detail, ...modification } : detail;
      }),
    );
    if (statutEnvoi.type) setStatutEnvoi({ type: null, message: "" });
  };

  const totalLignesDetail = (detail: DetailSaisie) =>
    totalLignes(
      detail.lignes.map((ligne) => ({
        montant: analyserMontantSaisi(ligne.montant),
      })),
    );
  const totalDepenses =
    Math.round(
      piecesJointes.reduce(
        (total, _, index) => total + totalLignesDetail(detailPourIndex(index)),
        0,
      ) * 100,
    ) / 100;
  const detailsDepensesValides =
    piecesJointes.length > 0 &&
    piecesJointes.every((_, index) =>
      detailSaisiComplet(detailPourIndex(index)),
    );
  const erreurJustificatif =
    afficherErreursValidation && piecesJointes.length === 0;
  const erreurDate = afficherErreursValidation && !formulaire.date;
  const erreurUniteObligatoire =
    afficherErreursValidation && !formulaire.branche;
  const champsManquants = [
    ...(piecesJointes.length === 0 ? ["un justificatif"] : []),
    ...(!formulaire.date ? ["la date"] : []),
    ...(!formulaire.branche ? ["l’unité"] : []),
    ...piecesJointes.flatMap((_, index) => {
      const detail = detailPourIndex(index);
      const numero = index + 1;
      return [
        ...(!detail.modePaiement
          ? [`le mode de paiement du justificatif ${numero}`]
          : []),
        ...detail.lignes.flatMap((ligne, indexLigne) => [
          ...(!ligne.categorie
            ? [
                `la catégorie de la ligne ${indexLigne + 1} du justificatif ${numero}`,
              ]
            : []),
          ...(!montantSaisiValide(ligne.montant)
            ? [
                `le montant de la ligne ${indexLigne + 1} du justificatif ${numero}`,
              ]
            : []),
        ]),
      ];
    }),
  ];
  const alerteValidationRef = useRef<HTMLDivElement>(null);
  const formulaireRef = useRef<HTMLFormElement>(null);

  // Le justificatif ouvert ne peut pas dépasser le dernier (suppression).
  const indexOuvertEffectif = Math.min(indexOuvert, piecesJointes.length - 1);

  const genererNomsFichiers = () => {
    if (piecesJointes.length === 0) return [];
    if (nomenclature?.format && analyserDateIso(formulaire.date)) {
      return genererNomsNomenclature({
        format: nomenclature.format,
        parametresAnnee: nomenclature.anneeComptable,
        date: formulaire.date,
        branche: uniteSelectionnee?.label ?? "",
        depenses: piecesJointes.map((_, index) =>
          versDepenseNomenclature(versDetailDepense(detailPourIndex(index))),
        ),
        extensions: piecesJointes.map((piece) =>
          devinerExtension(piece.typeMime, piece.nomFichierOriginal),
        ),
        apercu: true,
      });
    }
    return dedoublonnerNomsFichiers(
      piecesJointes.map((piece) =>
        assainirSegmentNomFichier(piece.nomFichierOriginal),
      ),
    );
  };

  const envoyerDepense = async (evenement: FormEvent) => {
    evenement.preventDefault();

    setAfficherErreursValidation(true);

    if (detailsDepenses.length !== piecesJointes.length) {
      setStatutEnvoi({
        type: "erreur",
        message:
          "Les justificatifs et leurs détails ne sont plus synchronisés. Veuillez actualiser la page avant de réessayer.",
      });
      return;
    }

    if (!formulaireEstValide) {
      // Ouvre le premier justificatif incomplet pour que ses erreurs soient visibles.
      const premierIncomplet = piecesJointes.findIndex(
        (_, index) => !detailSaisiComplet(detailPourIndex(index)),
      );
      if (premierIncomplet >= 0) setIndexOuvert(premierIncomplet);
      requestAnimationFrame(() => {
        const premierChampInvalide =
          formulaireRef.current?.querySelector<HTMLElement>(
            '[aria-invalid="true"]',
          );
        (premierChampInvalide ?? alerteValidationRef.current)?.focus();
      });
      return;
    }

    setEnvoiEnCours(true);
    setStatutEnvoi({ type: null, message: "" });

    try {
      const piecesJointesPourApi = piecesJointes.map((pieceJointe) => ({
        displayName: pieceJointe.nomAffiche,
        mimeType: pieceJointe.typeMime,
        base64Data: pieceJointe.donneesBase64,
        originalFileName: pieceJointe.nomFichierOriginal,
      }));

      const reponse = await fetch("/api/send-expense", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userEmail: emailUtilisateur,
          date: formulaire.date,
          unitId: formulaire.branche,
          description: formulaire.description,
          attachments: piecesJointesPourApi,
          expenses: detailsDepenses.map((detail) => ({
            paymentMethod: detail.modePaiement,
            lines: detail.lignes.map((ligne) => ({
              category: ligne.categorie,
              amount: analyserMontantSaisi(ligne.montant),
            })),
          })),
        }),
      });

      const texteReponse = await reponse.text();
      let erreurApi = "";
      if (texteReponse) {
        try {
          const donnees = JSON.parse(texteReponse) as { error?: string };
          erreurApi = donnees.error || "";
        } catch {
          // Certaines erreurs plateforme (ex. 413) ne renvoient pas du JSON.
        }
      }

      if (reponse.ok) {
        setStatutEnvoi({
          type: "succes",
          message:
            "Email envoyé avec succès ! La facture a été transmise à la trésorerie et une copie vous a été envoyée.",
        });
        // Réinitialise les champs variables, garde la branche, puis vide les fichiers côté parent.
        setFormulaire((prev) => ({
          date: new Date().toISOString().split("T")[0],
          branche: prev.branche,
          description: "",
        }));
        setAfficherErreursValidation(false);
        setDetailsDepenses([]);
        setIndexOuvert(0);
        onCreerNouvelleNote?.();
      } else {
        const piecesJointesTropLourdes =
          reponse.status === 413 ||
          /payload too large|request entity too large|function_payload_too_large/i.test(
            texteReponse,
          );
        const erreurValidation = reponse.status === 400;
        const erreurAuth = reponse.status === 401 || reponse.status === 403;
        const tropDeTentatives = reponse.status === 429;
        const erreurServeur = reponse.status >= 500;

        let messageErreur = erreurApi || "Erreur lors de l'envoi de l'email";

        if (piecesJointesTropLourdes) {
          messageErreur = `Pièces jointes trop volumineuses. Réduisez la taille ou le nombre de fichiers (max ${MAX_ATTACHMENT_COUNT} fichiers, ${(MAX_ATTACHMENT_SIZE_BYTES / (1024 * 1024)).toFixed(0)}MB/fichier, ${(MAX_TOTAL_ATTACHMENTS_SIZE_BYTES / (1024 * 1024)).toFixed(0)}MB au total), puis réessayez.`;
        } else if (erreurAuth) {
          messageErreur =
            "Session expirée ou accès refusé. Veuillez vous reconnecter puis réessayer.";
        } else if (tropDeTentatives) {
          messageErreur =
            "Trop de tentatives. Veuillez patienter quelques minutes puis réessayer.";
        } else if (erreurServeur) {
          messageErreur =
            "Erreur serveur temporaire. Veuillez réessayer plus tard.";
        } else if (erreurValidation && !erreurApi) {
          messageErreur =
            "Données invalides. Vérifiez le formulaire puis réessayez.";
        }

        setStatutEnvoi({
          type: "erreur",
          message: messageErreur,
        });
      }
    } catch (erreur) {
      console.error("Erreur:", erreur);
      setStatutEnvoi({
        type: "erreur",
        message: "Erreur de connexion. Veuillez réessayer.",
      });
    } finally {
      setEnvoiEnCours(false);
    }
  };

  const formulaireEstValide = Boolean(
    piecesJointes.length > 0 &&
    formulaire.date &&
    formulaire.branche &&
    detailsDepensesValides,
  );
  const nomsFichiersApercu = formulaireEstValide ? genererNomsFichiers() : [];

  const creerNouvelleNote = () => {
    // Vide le formulaire, garde la branche et demande au parent de retirer les fichiers.
    setFormulaire((prev) => ({
      date: new Date().toISOString().split("T")[0],
      branche: prev.branche,
      description: "",
    }));
    setStatutEnvoi({ type: null, message: "" });
    setAfficherErreursValidation(false);
    setDetailsDepenses([]);
    setIndexOuvert(0);
    if (onCreerNouvelleNote) onCreerNouvelleNote();
  };

  return (
    <form
      ref={formulaireRef}
      noValidate
      onSubmit={envoyerDepense}
      className="space-y-6"
    >
      <h2 className="text-lg font-semibold text-zinc-900 flex items-center gap-2">
        <ClipboardDocumentListIcon
          className="w-5 h-5 text-zinc-700"
          aria-hidden="true"
        />
        Informations de la dépense
      </h2>

      {afficherErreursValidation && champsManquants.length > 0 && (
        <div
          ref={alerteValidationRef}
          tabIndex={-1}
          role="alert"
          className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"
        >
          <p className="font-medium">
            Il manque des informations pour envoyer la facture :
          </p>
          <ul className="mt-2 list-inside list-disc">
            {champsManquants.map((champ) => (
              <li key={champ}>{champ}</li>
            ))}
          </ul>
          {erreurJustificatif && (
            <p className="mt-2">
              Ajoutez un justificatif avec le module ci-dessus.
            </p>
          )}
        </div>
      )}

      {piecesJointes.length > 0 && (
        <div className="space-y-2">
          <p className="block text-sm font-medium text-zinc-700">
            Justificatifs ({piecesJointes.length})
          </p>
          <div className="space-y-2">
            {piecesJointes.map((pieceJointe, index) => {
              const estImage = pieceJointe.typeMime.startsWith("image/");
              const detail = detailPourIndex(index);
              const idAccordeon = `justificatif-${index}`;
              const erreurModePaiement =
                afficherErreursValidation && !detail.modePaiement;
              return (
                <AccordeonJustificatif
                  key={`${pieceJointe.nomAffiche}-${index}`}
                  id={idAccordeon}
                  titre={pieceJointe.nomAffiche}
                  sousTitre={
                    pieceJointe.typeMime === "application/pdf" ? "PDF" : "Image"
                  }
                  vignette={
                    estImage ? (
                      <Image
                        src={`data:${pieceJointe.typeMime};base64,${pieceJointe.donneesBase64}`}
                        alt=""
                        width={56}
                        height={56}
                        className="w-14 h-14 object-cover rounded-md border border-zinc-200"
                      />
                    ) : (
                      <span className="w-14 h-14 rounded-md border border-zinc-200 bg-white flex items-center justify-center">
                        <DocumentTextIcon
                          className="w-8 h-8 text-zinc-500"
                          aria-hidden="true"
                        />
                      </span>
                    )
                  }
                  total={totalLignesDetail(detail)}
                  complet={detailSaisiComplet(detail)}
                  ouvert={index === indexOuvertEffectif}
                  onBasculer={() => setIndexOuvert(index)}
                  onSupprimer={
                    onSupprimerPieceJointe
                      ? () => {
                          setDetailsDepenses((precedents) =>
                            precedents.filter(
                              (_, detailIndex) => detailIndex !== index,
                            ),
                          );
                          setIndexOuvert((ouvert) =>
                            index < ouvert ? ouvert - 1 : ouvert,
                          );
                          onSupprimerPieceJointe(index);
                        }
                      : undefined
                  }
                >
                  <div className="space-y-2">
                    <label
                      htmlFor={`${idAccordeon}-mode-paiement`}
                      className="block text-sm font-medium text-zinc-700"
                    >
                      Mode de paiement *
                    </label>
                    <select
                      id={`${idAccordeon}-mode-paiement`}
                      value={detail.modePaiement}
                      onChange={(e) =>
                        modifierDetailDepense(index, {
                          modePaiement: e.target.value,
                        })
                      }
                      aria-invalid={erreurModePaiement}
                      aria-describedby={
                        erreurModePaiement
                          ? `erreur-${idAccordeon}-mode-paiement`
                          : undefined
                      }
                      className={`w-full p-3 border rounded-lg focus:ring-2 focus:ring-zinc-400 focus:border-zinc-400 bg-white text-zinc-900 ${erreurModePaiement ? "border-rose-500" : "border-zinc-300"}`}
                    >
                      <option value="">Sélectionner un mode</option>
                      {MODES_PAIEMENT.map((mode) => (
                        <option key={mode} value={mode}>
                          {mode}
                        </option>
                      ))}
                    </select>
                    {erreurModePaiement && (
                      <p
                        id={`erreur-${idAccordeon}-mode-paiement`}
                        className="text-sm text-rose-700"
                      >
                        Sélectionnez un mode de paiement.
                      </p>
                    )}
                  </div>
                  <LignesCategories
                    idPrefixe={idAccordeon}
                    lignes={detail.lignes}
                    onChange={(lignes) =>
                      modifierDetailDepense(index, { lignes })
                    }
                    afficherErreurs={afficherErreursValidation}
                  />
                </AccordeonJustificatif>
              );
            })}
          </div>
        </div>
      )}

      <div className="space-y-2">
        <label
          htmlFor="date"
          className="block text-sm font-medium text-zinc-700"
        >
          Date *
        </label>
        <input
          id="date"
          type="date"
          value={formulaire.date}
          onChange={(e) => modifierChamp("date", e.target.value)}
          aria-invalid={erreurDate}
          aria-describedby={erreurDate ? "erreur-date" : undefined}
          className={`w-full p-3 border rounded-lg focus:ring-2 focus:ring-zinc-400 focus:border-zinc-400 bg-white text-zinc-900 ${
            erreurDate ? "border-rose-500" : "border-zinc-300"
          }`}
        />
        {erreurDate && (
          <p id="erreur-date" className="text-sm text-rose-700">
            Saisissez une date.
          </p>
        )}
      </div>

      <div className="space-y-2">
        <label
          htmlFor="branche"
          className="block text-sm font-medium text-zinc-700"
        >
          Unité *
        </label>
        <select
          id="branche"
          value={formulaire.branche}
          onChange={(e) => modifierChamp("branche", e.target.value)}
          aria-invalid={erreurUniteObligatoire}
          aria-describedby={erreurUniteObligatoire ? "erreur-unite" : undefined}
          className={`w-full p-3 border rounded-lg focus:ring-2 focus:ring-zinc-400 focus:border-zinc-400 bg-white text-zinc-900 ${
            erreurUniteObligatoire ? "border-rose-500" : "border-zinc-300"
          }`}
        >
          <option value="">Sélectionner une unité</option>
          {units.map((unit) => (
            <option key={unit.id} value={unit.id}>
              {unit.label}
            </option>
          ))}
        </select>
        {erreurUniteObligatoire && (
          <p id="erreur-unite" className="text-sm text-rose-700">
            Sélectionnez une unité.
          </p>
        )}
        {uniteSelectionnee && (
          <div
            className="mt-2 h-1.5 rounded-full"
            style={{ backgroundColor: uniteSelectionnee.color }}
          />
        )}
        {(erreurUnite || erreurEnregistrementUnite) && (
          <p className="text-sm text-amber-700" role="status">
            {erreurUnite || erreurEnregistrementUnite}
          </p>
        )}
      </div>

      {piecesJointes.length > 0 && (
        <div className="p-3 bg-zinc-50 border border-zinc-200 rounded-lg flex items-center justify-between">
          <span className="text-sm font-medium text-zinc-700">
            Total des dépenses
          </span>
          <span className="text-lg font-bold text-zinc-900">
            {totalDepenses.toFixed(2)} €
          </span>
        </div>
      )}

      <div className="space-y-2">
        <label
          htmlFor="description"
          className="block text-sm font-medium text-zinc-700"
        >
          Description (optionnel)
        </label>
        <textarea
          id="description"
          placeholder="Description de la dépense..."
          value={formulaire.description}
          onChange={(e) => modifierChamp("description", e.target.value)}
          rows={3}
          className="w-full p-3 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-zinc-400 focus:border-zinc-400 resize-none bg-white text-zinc-900"
        />
      </div>

      {/* Messages de statut */}
      {statutEnvoi.type && (
        <div
          className={`p-4 rounded-lg space-y-3 ${
            statutEnvoi.type === "succes"
              ? "bg-emerald-50 border border-emerald-200 text-emerald-800"
              : "bg-rose-50 border border-rose-200 text-rose-800"
          }`}
        >
          <p className="text-sm flex items-start gap-2">
            {statutEnvoi.type === "succes" ? (
              <CheckCircleIcon
                className="w-5 h-5 flex-none"
                aria-hidden="true"
              />
            ) : (
              <ExclamationTriangleIcon
                className="w-5 h-5 flex-none"
                aria-hidden="true"
              />
            )}
            <span>{statutEnvoi.message}</span>
          </p>
        </div>
      )}

      <div className="space-y-4">
        {formulaireEstValide && !statutEnvoi.type && (
          <div className="p-3 bg-zinc-50 border border-zinc-200 rounded-lg">
            <p className="text-sm text-zinc-800">
              <span className="inline-flex items-center gap-2 font-medium">
                <PaperAirplaneIcon className="w-4 h-4" aria-hidden="true" />{" "}
                Email sera envoyé à :
              </span>
              <br />• Trésorerie : votre groupe
              <br />• Vous : {emailUtilisateur}
              <br />
              <span className="inline-flex items-center gap-2 font-medium">
                <svg
                  className="w-4 h-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 5 17 10" />
                  <line x1="12" x2="12" y1="5" y2="20" />
                </svg>
                Pièce(s) jointe(s) :
              </span>
              <br />
              {nomsFichiersApercu.map((nom, index) => (
                <span key={`${nom}-${index}`}>
                  • {nom}
                  <br />
                </span>
              ))}
            </p>
          </div>
        )}

        {!estEnLigne && (
          <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm flex items-start gap-2">
            <ExclamationTriangleIcon
              className="w-5 h-5 mt-0.5"
              aria-hidden="true"
            />
            <span>
              Vous êtes hors ligne. Vous pouvez préparer la note mais
              l&apos;envoi ne fonctionnera qu&apos;une fois reconnecté.
            </span>
          </div>
        )}

        <button
          type="submit"
          disabled={envoiEnCours || !estEnLigne || !treasuryVerified}
          className={`w-full p-4 rounded-lg font-semibold text-white transition-colors focus:outline-none ${
            !envoiEnCours && estEnLigne && treasuryVerified
              ? "bg-zinc-900 hover:bg-zinc-800 focus:ring-2 focus:ring-zinc-400"
              : "bg-zinc-300 cursor-not-allowed"
          }`}
        >
          {!treasuryVerified ? (
            "Validation de la trésorerie en attente"
          ) : envoiEnCours ? (
            <span className="flex items-center justify-center">
              <svg
                className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                ></circle>
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                ></path>
              </svg>
              Envoi en cours...
            </span>
          ) : (
            <span className="inline-flex items-center justify-center gap-2">
              <PaperAirplaneIcon className="w-5 h-5" aria-hidden="true" />{" "}
              Envoyer la facture
            </span>
          )}
        </button>
      </div>
    </form>
  );
}
