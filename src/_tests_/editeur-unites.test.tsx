import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { EditeurUnites } from "@/components/EditeurUnites";

const unites = [
  { id: "a", label: "A", color: "#111111" },
  { id: "b", label: "B", color: "#222222" },
  { id: "c", label: "C", color: "#333333" },
];

describe("EditeurUnites", () => {
  it("remonte l’unité du milieu au clic sur « Monter »", async () => {
    const utilisateur = userEvent.setup();
    const onChange = vi.fn();
    render(<EditeurUnites unites={unites} onChange={onChange} />);

    await utilisateur.click(screen.getByLabelText("Monter B"));

    expect(onChange).toHaveBeenCalledWith([
      { id: "b", label: "B", color: "#222222" },
      { id: "a", label: "A", color: "#111111" },
      { id: "c", label: "C", color: "#333333" },
    ]);
  });

  it("désactive « Monter » sur la première unité et « Descendre » sur la dernière", () => {
    const onChange = vi.fn();
    render(<EditeurUnites unites={unites} onChange={onChange} />);

    expect(screen.getByLabelText("Monter A")).toBeDisabled();
    expect(screen.getByLabelText("Descendre C")).toBeDisabled();
  });

  it("n’appelle pas onChange au clic sur un bouton désactivé", async () => {
    const utilisateur = userEvent.setup();
    const onChange = vi.fn();
    render(<EditeurUnites unites={unites} onChange={onChange} />);

    await utilisateur.click(screen.getByLabelText("Monter A"));

    expect(onChange).not.toHaveBeenCalled();
  });
});
