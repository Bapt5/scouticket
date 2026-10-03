/**
 * Lien (dans un e-mail) vers l'historique : vers l'entrée elle-même quand
 * l'envoi n'en produit qu'une, sinon vers la page. Sans entrée (historique
 * désactivé) ou sans `APP_URL`, aucun lien : l'envoi ne doit jamais échouer
 * pour un simple lien de confort.
 */
export function lienHistorique(
  identifiantsEntrees: readonly string[],
): string | undefined {
  const urlApplication = process.env.APP_URL?.trim().replace(/\/+$/, "");
  if (identifiantsEntrees.length === 0 || !urlApplication) return undefined;
  try {
    const url = new URL("/historique", urlApplication);
    if (identifiantsEntrees.length === 1)
      url.searchParams.set("entree", identifiantsEntrees[0]);
    return url.toString();
  } catch {
    return undefined;
  }
}
