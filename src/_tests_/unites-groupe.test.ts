import { describe, expect, it } from "vitest";
import { validerUnites } from "@/lib/group";
import { deplacerUnite } from "@/components/EditeurUnites";

describe("Réordonnancement des unités de groupe", () => {
  const unites = [
    { id: "a", label: "A", color: "#111111" },
    { id: "b", label: "B", color: "#222222" },
    { id: "c", label: "C", color: "#333333" },
  ];

  it("échange une unité avec la précédente", () => {
    expect(deplacerUnite(unites, 1, -1)).toEqual([
      { id: "b", label: "B", color: "#222222" },
      { id: "a", label: "A", color: "#111111" },
      { id: "c", label: "C", color: "#333333" },
    ]);
  });

  it("échange une unité avec la suivante", () => {
    expect(deplacerUnite(unites, 1, 1)).toEqual([
      { id: "a", label: "A", color: "#111111" },
      { id: "c", label: "C", color: "#333333" },
      { id: "b", label: "B", color: "#222222" },
    ]);
  });

  it("ne fait rien en déplaçant la première unité vers le haut", () => {
    expect(deplacerUnite(unites, 0, -1)).toEqual(unites);
  });

  it("ne fait rien en déplaçant la dernière unité vers le bas", () => {
    expect(deplacerUnite(unites, 2, 1)).toEqual(unites);
  });
});

describe("Validation des unités de groupe", () => {
  it("accepte une couleur choisie par le responsable", () => {
    expect(
      validerUnites([
        { id: "unite-test", label: "Unité test", color: "#8b5cf6" },
      ]),
    ).toEqual([{ id: "unite-test", label: "Unité test", color: "#8b5cf6" }]);
  });

  it("refuse une couleur qui ne peut pas être utilisée dans un e-mail", () => {
    expect(
      validerUnites([
        {
          id: "unite-test",
          label: "Unité test",
          color: "url(javascript:alert(1))",
        },
      ]),
    ).toBeNull();
  });
});
