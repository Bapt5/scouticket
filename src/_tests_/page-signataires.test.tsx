import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PageSignataires from "../app/(main)/parametres-groupe/signataires/page";

const reponse = (corps: unknown, ok = true) =>
  Promise.resolve({ ok, json: () => Promise.resolve(corps) });

const signatairesExemple = () =>
  reponse({
    responsables: {
      retenus: [{ id: "m1", nom: "Alice", email: "alice@test.fr" }],
      nonRetenus: [{ id: "m2", nom: "Bob", email: "bob@test.fr" }],
    },
    tresoriers: {
      retenus: [{ id: "m3", nom: "Carla", email: "carla@test.fr" }],
      nonRetenus: [],
    },
  });

describe("Page Gestion des signataires", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  it("refuse l'accès à un membre simple", async () => {
    fetchMock.mockReturnValue(reponse({ error: "Accès refusé" }, false));

    render(<PageSignataires />);

    expect(
      await screen.findByText("Accès réservé aux responsables du groupe."),
    ).toBeInTheDocument();
  });

  it("affiche les listes de responsables et de trésoriers", async () => {
    fetchMock.mockReturnValue(signatairesExemple());

    render(<PageSignataires />);

    expect(await screen.findByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("Carla")).toBeInTheDocument();
    expect(screen.getByText("Bob")).toBeInTheDocument();
  });

  it("retire un responsable de la liste des signataires", async () => {
    fetchMock.mockImplementation(
      (_url: string, options?: { method?: string }) =>
        options?.method === "PATCH"
          ? reponse({
              responsables: {
                retenus: [],
                nonRetenus: [
                  { id: "m1", nom: "Alice", email: "alice@test.fr" },
                ],
              },
              tresoriers: {
                retenus: [{ id: "m3", nom: "Carla", email: "carla@test.fr" }],
                nonRetenus: [],
              },
            })
          : signatairesExemple(),
    );

    render(<PageSignataires />);
    await screen.findByText("Alice");
    await userEvent.click(
      screen.getByRole("button", { name: "Retirer Alice de la liste" }),
    );

    expect(await screen.findByText("Signataires enregistrés.")).toBeVisible();
    const appel = fetchMock.mock.calls.find(
      ([, options]) => options?.method === "PATCH",
    );
    expect(appel?.[0]).toBe("/api/group/signataires");
    expect(JSON.parse(appel?.[1].body)).toEqual({
      responsables: [],
      tresoriers: ["m3"],
    });
  });

  it("réintègre un responsable exclu via sa puce", async () => {
    fetchMock.mockImplementation(
      (_url: string, options?: { method?: string }) =>
        options?.method === "PATCH"
          ? reponse({
              responsables: {
                retenus: [
                  { id: "m1", nom: "Alice", email: "alice@test.fr" },
                  { id: "m2", nom: "Bob", email: "bob@test.fr" },
                ],
                nonRetenus: [],
              },
              tresoriers: {
                retenus: [{ id: "m3", nom: "Carla", email: "carla@test.fr" }],
                nonRetenus: [],
              },
            })
          : signatairesExemple(),
    );

    render(<PageSignataires />);
    await screen.findByText("Bob");
    await userEvent.click(screen.getByRole("button", { name: /Bob/ }));

    const appel = fetchMock.mock.calls.find(
      ([, options]) => options?.method === "PATCH",
    );
    expect(JSON.parse(appel?.[1].body)).toEqual({
      responsables: ["m1", "m2"],
      tresoriers: ["m3"],
    });
  });
});
