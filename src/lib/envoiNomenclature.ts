import { envoyerEmailDepense, type DonneesEmailDepense } from "@/lib/email";
import { devinerExtension } from "@/lib/attachments";
import {
  calculerReservation,
  genererNomsNomenclature,
  type ParametresAnneeComptable,
} from "@/lib/nomenclature";
import { versDepenseNomenclature } from "@/lib/depenses";
import { pool } from "@/lib/baseDeDonnees";
import { reserverNumeros } from "@/lib/groupServer";

/**
 * Envoie une dépense (note de frais ou dépense de groupe) en réservant et en
 * appliquant la nomenclature du groupe. Les numéros globaux sont réservés
 * dans une transaction validée seulement après l'envoi : un échec SMTP n'en
 * consomme aucun. Partagé entre `POST /api/send-expense` (envoi direct) et
 * la validation finale d'une note de frais signée
 * (`src/lib/ndfSignature/signer.ts`), qui envoie le PDF final signé comme
 * une dépense de groupe (le remboursement est fait, l'argent du groupe est
 * sorti).
 */
export async function envoyerAvecNomenclature(
  donneesEmail: DonneesEmailDepense,
  identifiantOrganisation: string,
  format: string,
  anneeComptable: ParametresAnneeComptable,
) {
  const depenses = donneesEmail.detailsDepenses.map(versDepenseNomenclature);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Un numéro par dépense, pas par pièce jointe : une dépense sans
    // justificatif (attestée par un responsable) réserve tout de même un
    // numéro, comme une recette envoyée sans pièce jointe.
    const reservation = calculerReservation(
      format,
      donneesEmail.date,
      depenses.length,
      anneeComptable,
    );
    const numeros =
      reservation.global > 0 || reservation.comptable
        ? await reserverNumeros(client, identifiantOrganisation, reservation)
        : {};
    const noms = genererNomsNomenclature({
      format,
      parametresAnnee: anneeComptable,
      date: donneesEmail.date,
      branche: donneesEmail.branche,
      depenses,
      extensions: donneesEmail.piecesJointes.map((piece) =>
        devinerExtension(piece.typeMime, piece.nomFichierOriginal),
      ),
      ...numeros,
    });
    donneesEmail.piecesJointes = donneesEmail.piecesJointes.map(
      (piece, index) => ({ ...piece, nomFichierNormalise: noms[index] }),
    );
    // Référence textuelle (sans extension) affichée dans le corps de
    // l'e-mail, en plus du nom de la pièce jointe : mêmes numéros déjà
    // réservés ci-dessus, aucune nouvelle réservation.
    const references = genererNomsNomenclature({
      format,
      parametresAnnee: anneeComptable,
      date: donneesEmail.date,
      branche: donneesEmail.branche,
      depenses,
      extensions: depenses.map(() => null),
      ...numeros,
    });
    donneesEmail.detailsDepenses = donneesEmail.detailsDepenses.map(
      (detail, index) => ({ ...detail, reference: references[index] }),
    );
    const resultat = await envoyerEmailDepense(donneesEmail);
    await client.query("COMMIT");
    return resultat;
  } catch (erreur) {
    await client.query("ROLLBACK");
    throw erreur;
  } finally {
    client.release();
  }
}
