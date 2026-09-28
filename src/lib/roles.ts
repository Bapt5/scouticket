/** Libellé affiché d'un rôle : owner = Trésorier, admin = Responsable de groupe. */
export function libelleRole(role: string | null) {
  if (role === "owner") return "Trésorier";
  if (role === "admin") return "Responsable de groupe";
  return "Membre";
}
