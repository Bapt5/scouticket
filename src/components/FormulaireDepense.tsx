"use client";

import {
  useState,
  useEffect,
  useRef,
  type ChangeEvent,
  type FormEvent,
} from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
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
  ALLOWED_ATTACHMENT_MIME_TYPES,
  MAX_ATTACHMENT_COUNT,
  MAX_ATTACHMENT_SIZE_BYTES,
  MAX_TOTAL_ATTACHMENTS_SIZE_BYTES,
  type PieceJointeDepense,
  type TypeEnvoi,
} from "@/constants/piecesJointes";
import {
  categoriesPourTypeEnvoi,
  MOYENS_PAIEMENT_PAR_DEFAUT,
} from "@/constants/configDepenses";
import {
  analyserMontantSaisi,
  dateDuJour,
  detailSaisiComplet,
  detailSaisieVide,
  ligneKilometriqueComplete,
  ligneKilometriqueVide,
  montantKilometrique,
  montantSaisiValide,
  totalKilometres,
  totalLignes,
  versLigneKilometrique,
  versDepenseNomenclature,
  versDetailDepense,
  type DetailSaisie,
  type LigneKilometriqueSaisie,
} from "@/lib/depenses";
import { AccordeonJustificatif } from "@/components/AccordeonJustificatif";
import { IconeVoiture } from "@/components/IconeVoiture";
import { ChampsKilometrage } from "@/components/ChampsKilometrage";
import { LignesCategories } from "@/components/LignesCategories";
import type { UniteGroupe } from "@/lib/group";

const lireFichierBase64 = (fichier: File) =>
  new Promise<string>((resoudre, rejeter) => {
    const lecteur = new FileReader();
    lecteur.onload = () => {
      const resultat = String(lecteur.result ?? "");
      resoudre(resultat.slice(resultat.indexOf(",") + 1));
    };
    lecteur.onerror = () => rejeter(lecteur.error);
    lecteur.readAsDataURL(fichier);
  });

interface FormulaireDepenseProps {
  readonly typeEnvoi: TypeEnvoi;
  readonly piecesJointes: PieceJointeDepense[];
  readonly emailUtilisateur: string;
  readonly units: UniteGroupe[];
  readonly moyensPaiement?: string[];
  /** Note de frais signée active pour ce groupe : notice avant envoi (uniquement typeEnvoi note-de-frais). */
  readonly ndfSigneeActif?: boolean;
  /** Lignes kilométriques saisies (état porté par le parent, qui porte aussi le bouton d'ajout). */
  readonly kilometrages?: LigneKilometriqueSaisie[];
  readonly onKilometragesChange?: (lignes: LigneKilometriqueSaisie[]) => void;
  /** Taux du kilomètre du groupe (€), pour l'estimation affichée. */
  readonly kmTaux?: number;
  readonly nomenclature?: {
    format: string | null;
    anneeComptable: ParametresAnneeComptable;
  };
  readonly uniteInitiale?: string;
  readonly aTresorier: boolean;
  readonly onChangementUnite?: (unitId: string) => void;
  readonly erreurEnregistrementUnite?: string;
  readonly onCreerNouvelleNote?: () => void;
  readonly onSupprimerPieceJointe?: (index: number) => void;
  /** Responsable du groupe (owner/admin) : seul rôle pouvant déclarer une
   * dépense avec moyen de paiement du groupe sans justificatif. */
  readonly estAdmin?: boolean;
}

export function FormulaireDepense({
  typeEnvoi,
  piecesJointes,
  emailUtilisateur,
  units,
  moyensPaiement = MOYENS_PAIEMENT_PAR_DEFAUT as string[],
  ndfSigneeActif = false,
  kilometrages = [],
  onKilometragesChange,
  kmTaux = 0,
  nomenclature,
  uniteInitiale = "",
  aTresorier,
  onChangementUnite,
  erreurEnregistrementUnite,
  onCreerNouvelleNote,
  onSupprimerPieceJointe,
  estAdmin = false,
  estEnLigne = true,
}: FormulaireDepenseProps & { estEnLigne?: boolean }) {
  const router = useRouter();
  const estNoteDeFrais = typeEnvoi === "note-de-frais";
  const estDepenseGroupe = typeEnvoi === "depense-groupe";
  const libelleBoutonEnvoi = estNoteDeFrais
    ? ndfSigneeActif
      ? "Envoyer la note de frais pour signature"
      : "Envoyer la note de frais"
    : "Déclarer la dépense";
  const [formulaire, setFormulaire] = useState({
    branche: uniteInitiale || "",
  });
  const [rib, setRib] = useState<PieceJointeDepense | null>(null);
  const [erreurRib, setErreurRib] = useState("");
  const [detailsDepenses, setDetailsDepenses] = useState<DetailSaisie[]>([]);
  const [indexOuvert, setIndexOuvert] = useState(0);
  // Ligne kilométrique dépliée (null : aucune) ; une seule section ouverte à la fois.
  const [indexKmOuvert, setIndexKmOuvert] = useState<number | null>(null);
  const [erreurUnite, setErreurUnite] = useState("");
  // Attestation du responsable qu'aucun justificatif n'est nécessaire pour
  // cette dépense (ex. virement interne à l'association) : seuls les
  // responsables du groupe peuvent la cocher, et uniquement sans pièce jointe.
  const [sansJustificatifDeclare, setSansJustificatifDeclare] = useState(false);
  const peutDeclarerSansJustificatif = estDepenseGroupe && estAdmin;
  const declarationSansJustificatifActive =
    peutDeclarerSansJustificatif &&
    sansJustificatifDeclare &&
    piecesJointes.length === 0;
  const nombreEmplacements =
    piecesJointes.length > 0
      ? piecesJointes.length
      : declarationSansJustificatifActive
        ? 1
        : 0;
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

  const modifierChamp = (champ: "branche", valeur: string) => {
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
      Array.from(
        { length: nombreEmplacements },
        (_, index) => precedents[index] ?? detailSaisieVide(),
      ),
    );
  }, [nombreEmplacements]);

  // Si la liste des moyens de paiement du groupe change (paramètres modifiés
  // ailleurs) et qu'une sélection en cours n'y figure plus, on la réinitialise.
  useEffect(() => {
    setDetailsDepenses((precedents) =>
      precedents.map((detail) =>
        detail.modePaiement && !moyensPaiement.includes(detail.modePaiement)
          ? { ...detail, modePaiement: "" }
          : detail,
      ),
    );
  }, [moyensPaiement]);

  // La déclaration sans justificatif n'a de sens que sans pièce jointe et
  // pour un responsable : on la réinitialise dès que l'une de ces conditions
  // n'est plus vraie (changement de type d'envoi, perte du rôle, ajout d'un
  // fichier après avoir cochée la case).
  useEffect(() => {
    if (!peutDeclarerSansJustificatif || piecesJointes.length > 0) {
      setSansJustificatifDeclare(false);
    }
  }, [peutDeclarerSansJustificatif, piecesJointes.length]);

  const detailPourIndex = (index: number) =>
    detailsDepenses[index] ?? detailSaisieVide();

  // ─── Kilomètres (note de frais) ───
  const nombreKm = estNoteDeFrais ? kilometrages.length : 0;
  const kilometragesValides = kilometrages.every(ligneKilometriqueComplete);
  const nombreKmPrecedent = useRef(nombreKm);
  // Une ligne km vient d'être ajoutée (bouton du parent) : on l'ouvre.
  useEffect(() => {
    if (nombreKm > nombreKmPrecedent.current) {
      setIndexKmOuvert(nombreKm - 1);
      setIndexOuvert(-1);
    }
    nombreKmPrecedent.current = nombreKm;
  }, [nombreKm]);

  const modifierKilometrage = (
    index: number,
    modification: Partial<LigneKilometriqueSaisie>,
  ) => {
    onKilometragesChange?.(
      kilometrages.map((ligne, ligneIndex) =>
        ligneIndex === index ? { ...ligne, ...modification } : ligne,
      ),
    );
    if (statutEnvoi.type) setStatutEnvoi({ type: null, message: "" });
  };
  const montantEstimeKm = (ligne: LigneKilometriqueSaisie) =>
    montantKilometrique(
      totalKilometres([versLigneKilometrique(ligne)]),
      kmTaux,
    );

  const modifierDetailDepense = (
    index: number,
    modification: Partial<DetailSaisie>,
  ) => {
    setDetailsDepenses((precedents) =>
      Array.from({ length: nombreEmplacements }, (_, detailIndex) => {
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
  const montantTotalKm = montantKilometrique(
    totalKilometres(kilometrages.map(versLigneKilometrique)),
    kmTaux,
  );
  const totalDepenses =
    Math.round(
      (Array.from({ length: nombreEmplacements }).reduce(
        (total: number, _, index) =>
          total + totalLignesDetail(detailPourIndex(index)),
        0,
      ) +
        (nombreKm > 0 ? montantTotalKm : 0)) *
        100,
    ) / 100;
  const detailsDepensesValides =
    (nombreEmplacements > 0 || nombreKm > 0) &&
    Array.from({ length: nombreEmplacements }).every((_, index) =>
      detailSaisiComplet(detailPourIndex(index), typeEnvoi),
    );
  // Date de référence (nomenclature) : la plus ancienne des dates saisies.
  const dateReference =
    Array.from({ length: nombreEmplacements })
      .map((_, index) => detailPourIndex(index).date)
      .filter(Boolean)
      .sort()[0] ?? dateDuJour();
  const erreurJustificatif =
    afficherErreursValidation &&
    piecesJointes.length === 0 &&
    nombreKm === 0 &&
    !declarationSansJustificatifActive;
  const erreurUniteObligatoire =
    afficherErreursValidation && !formulaire.branche;
  const champsManquants = [
    ...(piecesJointes.length === 0 &&
    nombreKm === 0 &&
    !declarationSansJustificatifActive
      ? ["un justificatif ou des kilomètres"]
      : []),
    ...kilometrages.flatMap((ligne, index) =>
      ligneKilometriqueComplete(ligne)
        ? []
        : [`les informations du déplacement ${index + 1}`],
    ),
    ...(!formulaire.branche ? ["l’unité"] : []),
    ...Array.from({ length: nombreEmplacements }).flatMap((_, index) => {
      const detail = detailPourIndex(index);
      const numero = index + 1;
      const aPieceJointe = index < piecesJointes.length;
      const libelleJustificatif = aPieceJointe
        ? `du justificatif ${numero}`
        : "de la dépense";
      return [
        ...(!detail.date
          ? [
              `la date ${estNoteDeFrais ? "de la dépense" : libelleJustificatif}`,
            ]
          : []),
        ...(estNoteDeFrais && !detail.activite.trim()
          ? [`l’activité liée du justificatif ${numero}`]
          : []),
        ...(!estNoteDeFrais && !detail.modePaiement
          ? [`le moyen de paiement ${libelleJustificatif}`]
          : []),
        ...detail.lignes.flatMap((ligne, indexLigne) => [
          ...(!ligne.categorie
            ? [
                `la catégorie de la ligne ${indexLigne + 1} ${libelleJustificatif}`,
              ]
            : []),
          ...(!montantSaisiValide(ligne.montant)
            ? [
                `le montant de la ligne ${indexLigne + 1} ${libelleJustificatif}`,
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
    if (nomenclature?.format && analyserDateIso(dateReference)) {
      return genererNomsNomenclature({
        format: nomenclature.format,
        parametresAnnee: nomenclature.anneeComptable,
        date: dateReference,
        branche: uniteSelectionnee?.label ?? "",
        depenses: piecesJointes.map((_, index) =>
          versDepenseNomenclature(
            versDetailDepense(detailPourIndex(index), typeEnvoi),
          ),
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

    if (detailsDepenses.length !== nombreEmplacements) {
      setStatutEnvoi({
        type: "erreur",
        message:
          "Les justificatifs et leurs détails ne sont plus synchronisés. Veuillez actualiser la page avant de réessayer.",
      });
      return;
    }

    if (!formulaireEstValide) {
      // Ouvre le premier justificatif incomplet pour que ses erreurs soient visibles.
      const premierIncomplet = Array.from({
        length: nombreEmplacements,
      }).findIndex(
        (_, index) => !detailSaisiComplet(detailPourIndex(index), typeEnvoi),
      );
      if (premierIncomplet >= 0) {
        setIndexOuvert(premierIncomplet);
        setIndexKmOuvert(null);
      } else {
        const premierKmIncomplet = kilometrages.findIndex(
          (ligne) => !ligneKilometriqueComplete(ligne),
        );
        if (premierKmIncomplet >= 0) {
          setIndexKmOuvert(premierKmIncomplet);
          setIndexOuvert(-1);
        }
      }
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
          envoiType: typeEnvoi,
          unitId: formulaire.branche,
          attachments: piecesJointesPourApi,
          ...(declarationSansJustificatifActive
            ? { withoutReceipt: true }
            : {}),
          ...(estNoteDeFrais && rib
            ? {
                rib: {
                  displayName: rib.nomAffiche,
                  mimeType: rib.typeMime,
                  base64Data: rib.donneesBase64,
                  originalFileName: rib.nomFichierOriginal,
                },
              }
            : {}),
          ...(nombreKm > 0
            ? { kilometrages: kilometrages.map(versLigneKilometrique) }
            : {}),
          expenses: detailsDepenses.map((detail) => ({
            date: detail.date,
            description: detail.description,
            ...(estNoteDeFrais
              ? { activity: detail.activite }
              : { paymentMethod: detail.modePaiement }),
            lines: detail.lignes.map((ligne) => ({
              category: ligne.categorie,
              amount: analyserMontantSaisi(ligne.montant),
            })),
          })),
        }),
      });

      const texteReponse = await reponse.text();
      let erreurApi = "";
      let statutReponse: string | undefined;
      let noteDeFraisId: string | undefined;
      if (texteReponse) {
        try {
          const donnees = JSON.parse(texteReponse) as {
            error?: string;
            statut?: string;
            noteDeFraisId?: string;
          };
          erreurApi = donnees.error || "";
          statutReponse = donnees.statut;
          noteDeFraisId = donnees.noteDeFraisId;
        } catch {
          // Certaines erreurs plateforme (ex. 413) ne renvoient pas du JSON.
        }
      }

      if (
        reponse.ok &&
        statutReponse === "en_attente_signature" &&
        noteDeFraisId
      ) {
        // Note de frais signée : le circuit démarre par la propre signature
        // du bénéficiaire (un e-mail « c'est votre tour de signer » vient
        // d'être envoyé), donc on l'y emmène directement plutôt que de
        // laisser un lien dans un message de confirmation.
        router.push(`/note-de-frais/${noteDeFraisId}/signature`);
        return;
      }

      if (reponse.ok) {
        setStatutEnvoi({
          type: "succes",
          message: `Email envoyé avec succès ! ${estNoteDeFrais ? "La note de frais a été transmise" : "La dépense a été déclarée et transmise"} à la trésorerie et une copie vous a été envoyée.`,
        });
        // Réinitialise les champs variables, garde la branche, puis vide les fichiers côté parent.
        setFormulaire((prev) => ({ branche: prev.branche }));
        setRib(null);
        setErreurRib("");
        setAfficherErreursValidation(false);
        setDetailsDepenses([]);
        setIndexOuvert(0);
        setIndexKmOuvert(null);
        onKilometragesChange?.([]);
        setSansJustificatifDeclare(false);
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
    (piecesJointes.length > 0 ||
      nombreKm > 0 ||
      declarationSansJustificatifActive) &&
    formulaire.branche &&
    detailsDepensesValides &&
    kilometragesValides,
  );
  const choisirRib = async (evenement: ChangeEvent<HTMLInputElement>) => {
    const fichier = evenement.target.files?.[0];
    evenement.target.value = "";
    if (!fichier) return;
    if (
      !(ALLOWED_ATTACHMENT_MIME_TYPES as readonly string[]).includes(
        fichier.type,
      )
    ) {
      setErreurRib("Le RIB doit être un PDF ou une image (JPG, PNG, WEBP).");
      return;
    }
    if (fichier.size > MAX_ATTACHMENT_SIZE_BYTES) {
      setErreurRib(
        `Le RIB dépasse ${(MAX_ATTACHMENT_SIZE_BYTES / (1024 * 1024)).toFixed(0)}MB.`,
      );
      return;
    }
    try {
      setRib({
        nomAffiche: fichier.name,
        typeMime: fichier.type,
        donneesBase64: await lireFichierBase64(fichier),
        nomFichierOriginal: fichier.name,
        nomFichierNormalise: fichier.name,
      });
      setErreurRib("");
    } catch {
      setErreurRib("Impossible de lire le fichier du RIB.");
    }
  };

  const nomsFichiersApercu = formulaireEstValide ? genererNomsFichiers() : [];

  // Champs de saisie d'une dépense (date, mode de paiement ou activité,
  // description, lignes) : partagés entre un justificatif joint (accordéon)
  // et la dépense déclarée sans justificatif (aucune pièce jointe).
  const champsDetailDepense = (
    index: number,
    idPrefixe: string,
    aPieceJointe: boolean,
  ) => {
    const detail = detailPourIndex(index);
    const erreurDate = afficherErreursValidation && !detail.date;
    const erreurActivite = afficherErreursValidation && !detail.activite.trim();
    const erreurModePaiement =
      afficherErreursValidation && !detail.modePaiement;
    return (
      <>
        <div className="space-y-2">
          <label
            htmlFor={`${idPrefixe}-date`}
            className="block text-sm font-medium text-zinc-700"
          >
            {estNoteDeFrais || !aPieceJointe
              ? "Date de la dépense *"
              : "Date du justificatif *"}
          </label>
          <input
            id={`${idPrefixe}-date`}
            type="date"
            value={detail.date}
            onChange={(e) =>
              modifierDetailDepense(index, { date: e.target.value })
            }
            aria-invalid={erreurDate}
            className={`w-full p-3 border rounded-lg focus:ring-2 focus:ring-zinc-400 focus:border-zinc-400 bg-white text-zinc-900 ${erreurDate ? "border-rose-500" : "border-zinc-300"}`}
          />
          {erreurDate && (
            <p className="text-sm text-rose-700">Saisissez une date.</p>
          )}
        </div>
        {estNoteDeFrais ? (
          <div className="space-y-2">
            <label
              htmlFor={`${idPrefixe}-activite`}
              className="block text-sm font-medium text-zinc-700"
            >
              Activité liée *
            </label>
            <input
              id={`${idPrefixe}-activite`}
              type="text"
              placeholder="Journée, week-end, camp…"
              value={detail.activite}
              onChange={(e) =>
                modifierDetailDepense(index, { activite: e.target.value })
              }
              aria-invalid={erreurActivite}
              className={`w-full p-3 border rounded-lg focus:ring-2 focus:ring-zinc-400 focus:border-zinc-400 bg-white text-zinc-900 ${erreurActivite ? "border-rose-500" : "border-zinc-300"}`}
            />
            {erreurActivite && (
              <p className="text-sm text-rose-700">
                Indiquez l’activité liée à la dépense.
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            <label
              htmlFor={`${idPrefixe}-mode-paiement`}
              className="block text-sm font-medium text-zinc-700"
            >
              Moyen de paiement *
            </label>
            <select
              id={`${idPrefixe}-mode-paiement`}
              value={detail.modePaiement}
              onChange={(e) =>
                modifierDetailDepense(index, { modePaiement: e.target.value })
              }
              aria-invalid={erreurModePaiement}
              aria-describedby={
                erreurModePaiement
                  ? `erreur-${idPrefixe}-mode-paiement`
                  : undefined
              }
              className={`w-full p-3 border rounded-lg focus:ring-2 focus:ring-zinc-400 focus:border-zinc-400 bg-white text-zinc-900 ${erreurModePaiement ? "border-rose-500" : "border-zinc-300"}`}
            >
              <option value="">Sélectionner un moyen</option>
              {moyensPaiement.map((moyen) => (
                <option key={moyen} value={moyen}>
                  {moyen}
                </option>
              ))}
            </select>
            {erreurModePaiement && (
              <p
                id={`erreur-${idPrefixe}-mode-paiement`}
                className="text-sm text-rose-700"
              >
                Sélectionnez un moyen de paiement.
              </p>
            )}
          </div>
        )}
        <div className="space-y-2">
          <label
            htmlFor={`${idPrefixe}-description`}
            className="block text-sm font-medium text-zinc-700"
          >
            Description (optionnel)
          </label>
          <textarea
            id={`${idPrefixe}-description`}
            placeholder="Détails sur la dépense..."
            value={detail.description}
            onChange={(e) =>
              modifierDetailDepense(index, { description: e.target.value })
            }
            rows={2}
            className="w-full p-3 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-zinc-400 focus:border-zinc-400 resize-none bg-white text-zinc-900"
          />
        </div>
        <LignesCategories
          idPrefixe={idPrefixe}
          categories={categoriesPourTypeEnvoi(typeEnvoi)}
          lignes={detail.lignes}
          onChange={(lignes) => modifierDetailDepense(index, { lignes })}
          afficherErreurs={afficherErreursValidation}
        />
      </>
    );
  };

  const creerNouvelleNote = () => {
    // Vide le formulaire, garde la branche et demande au parent de retirer les fichiers.
    setFormulaire((prev) => ({ branche: prev.branche }));
    setRib(null);
    setErreurRib("");
    setStatutEnvoi({ type: null, message: "" });
    setAfficherErreursValidation(false);
    setDetailsDepenses([]);
    setIndexOuvert(0);
    setIndexKmOuvert(null);
    onKilometragesChange?.([]);
    setSansJustificatifDeclare(false);
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

      {estNoteDeFrais && ndfSigneeActif && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
          Ce groupe a activé la note de frais signée : après l&rsquo;envoi,
          votre note de frais partira dans un circuit de signature électronique
          (vous, puis un approbateur, puis un trésorier) avant d&rsquo;être
          transmise à la trésorerie, en un seul PDF avec vos justificatifs. Vous
          la signerez en premier, avec un code envoyé à {emailUtilisateur}.
        </div>
      )}

      {afficherErreursValidation && champsManquants.length > 0 && (
        <div
          ref={alerteValidationRef}
          tabIndex={-1}
          role="alert"
          className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"
        >
          <p className="font-medium">
            Il manque des informations pour{" "}
            {estNoteDeFrais
              ? "envoyer la note de frais"
              : "déclarer la dépense"}{" "}
            :
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
                  complet={detailSaisiComplet(detail, typeEnvoi)}
                  ouvert={index === indexOuvertEffectif}
                  onBasculer={() => {
                    setIndexOuvert(index);
                    setIndexKmOuvert(null);
                  }}
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
                  {champsDetailDepense(index, idAccordeon, true)}
                </AccordeonJustificatif>
              );
            })}
          </div>
        </div>
      )}

      {nombreKm > 0 && (
        <div className="space-y-2">
          <p className="block text-sm font-medium text-zinc-700">
            Kilomètres ({nombreKm})
          </p>
          <div className="space-y-2">
            {kilometrages.map((ligne, index) => {
              const idAccordeon = `kilometrage-${index}`;
              return (
                <AccordeonJustificatif
                  key={idAccordeon}
                  id={idAccordeon}
                  titre={
                    ligne.distanceKm.trim()
                      ? `${ligne.distanceKm.trim()} km`
                      : "Déplacement"
                  }
                  sousTitre={`Déplacement ${index + 1} · ${ligne.objet.trim() || "objet à préciser"}`}
                  vignette={
                    <span className="w-14 h-14 rounded-md border border-zinc-200 bg-white flex items-center justify-center">
                      <IconeVoiture className="w-8 h-8 text-zinc-500" />
                    </span>
                  }
                  total={montantEstimeKm(ligne)}
                  complet={ligneKilometriqueComplete(ligne)}
                  ouvert={index === indexKmOuvert}
                  onBasculer={() => {
                    setIndexKmOuvert(index);
                    setIndexOuvert(-1);
                  }}
                  onSupprimer={() => {
                    onKilometragesChange?.(
                      kilometrages.filter((_, i) => i !== index),
                    );
                    setIndexKmOuvert((ouvert) =>
                      ouvert === null || ouvert === index
                        ? null
                        : index < ouvert
                          ? ouvert - 1
                          : ouvert,
                    );
                  }}
                >
                  <ChampsKilometrage
                    idPrefixe={idAccordeon}
                    ligne={ligne}
                    onChange={(modification) =>
                      modifierKilometrage(index, modification)
                    }
                    afficherErreurs={afficherErreursValidation}
                  />
                </AccordeonJustificatif>
              );
            })}
          </div>
          <p className="text-sm text-zinc-600">
            Total : {totalKilometres(kilometrages.map(versLigneKilometrique))}{" "}
            km, soit {montantTotalKm.toFixed(2)} € au taux de {kmTaux} € / km.
          </p>
        </div>
      )}

      {peutDeclarerSansJustificatif && piecesJointes.length === 0 && (
        <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <input
            type="checkbox"
            checked={sansJustificatifDeclare}
            onChange={(e) => setSansJustificatifDeclare(e.target.checked)}
            className="mt-0.5 h-4 w-4 flex-none rounded border-amber-400 text-zinc-900 focus:ring-2 focus:ring-zinc-400"
          />
          <span>
            Je déclare cette dépense sans justificatif (par exemple un virement
            interne à l’association) et j’ai conscience de l’envoyer sans aucune
            pièce jointe.
          </span>
        </label>
      )}

      {declarationSansJustificatifActive && (
        <div className="space-y-4 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
          <p className="block text-sm font-medium text-zinc-700">
            Détails de la dépense
          </p>
          {champsDetailDepense(0, "depense-sans-justificatif", false)}
        </div>
      )}

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

      {(nombreEmplacements > 0 || nombreKm > 0) && (
        <div className="p-3 bg-zinc-50 border border-zinc-200 rounded-lg flex items-center justify-between">
          <span className="text-sm font-medium text-zinc-700">
            Total des dépenses
          </span>
          <span className="text-lg font-bold text-zinc-900">
            {totalDepenses.toFixed(2)} €
          </span>
        </div>
      )}

      {estNoteDeFrais && (
        <div className="space-y-2">
          <label
            htmlFor="rib"
            className="block text-sm font-medium text-zinc-700"
          >
            RIB pour le remboursement (optionnel)
          </label>
          <input
            id="rib"
            type="file"
            accept="application/pdf,image/jpeg,image/png,image/webp"
            onChange={(e) => void choisirRib(e)}
            className="w-full p-3 border border-zinc-300 rounded-lg bg-white text-zinc-900 text-sm"
          />
          {rib && (
            <p className="text-sm text-zinc-700 flex items-center justify-between gap-2">
              <span>RIB : {rib.nomAffiche}</span>
              <button
                type="button"
                onClick={() => setRib(null)}
                className="text-rose-700 underline"
              >
                Retirer
              </button>
            </p>
          )}
          {erreurRib && <p className="text-sm text-rose-700">{erreurRib}</p>}
        </div>
      )}

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
        {formulaireEstValide &&
          !statutEnvoi.type &&
          !(estNoteDeFrais && ndfSigneeActif) && (
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
                {declarationSansJustificatifActive ? (
                  <span>Aucune (dépense déclarée sans justificatif)</span>
                ) : (
                  nomsFichiersApercu.map((nom, index) => (
                    <span key={`${nom}-${index}`}>
                      • {nom}
                      <br />
                    </span>
                  ))
                )}
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
          disabled={envoiEnCours || !estEnLigne || !aTresorier}
          className={`w-full p-4 rounded-lg font-semibold text-white transition-colors focus:outline-none ${
            !envoiEnCours && estEnLigne && aTresorier
              ? "bg-zinc-900 hover:bg-zinc-800 focus:ring-2 focus:ring-zinc-400"
              : "bg-zinc-300 cursor-not-allowed"
          }`}
        >
          {!aTresorier ? (
            "Aucun trésorier n'est configuré pour ce groupe"
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
              {libelleBoutonEnvoi}
            </span>
          )}
        </button>
      </div>
    </form>
  );
}
