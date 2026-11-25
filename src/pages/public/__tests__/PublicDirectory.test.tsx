/**
 * Incident production 2026-08-22 : quand /tenants/public/ échouait (429,
 * rate limit — depuis corrigé côté backend), l'annuaire retombait
 * silencieusement sur des données de démo codées en dur (FALLBACK_TENANTS)
 * — dont une entrée nommée "Université La Source" avec un slug factice
 * ("lasource") ne correspondant à aucun tenant réel. Un visiteur cliquant
 * dessus atterrissait sur "Établissement introuvable", sans jamais savoir
 * que l'annuaire avait en réalité échoué à charger les vrais
 * établissements. Ce test verrouille qu'une vraie erreur API affiche un
 * état d'erreur honnête (avec retry), jamais les fausses données.
 */
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

const { mockUsePublicTenants, mockRefetch, mockFacets } = vi.hoisted(() => ({
  mockUsePublicTenants: vi.fn(),
  mockRefetch: vi.fn(),
  mockFacets: vi.fn(() => ({ data: undefined })),
}));

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

vi.mock("@/hooks/usePublicTenant", () => ({
  usePublicTenants: mockUsePublicTenants,
  usePublicDirectoryFacets: mockFacets,
}));

import PublicDirectory from "@/pages/public/PublicDirectory";

function renderDirectory() {
  return render(
    <MemoryRouter>
      <PublicDirectory />
    </MemoryRouter>,
  );
}

describe("PublicDirectory — erreur API vs données de démo", () => {
  it("n'affiche jamais les établissements de démo factices quand l'API échoue réellement", () => {
    mockUsePublicTenants.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      isFetching: false,
      refetch: mockRefetch,
    });

    renderDirectory();

    // Aucune des institutions de démo codées en dur ne doit apparaître.
    expect(screen.queryByText("Université La Source")).not.toBeInTheDocument();
    expect(screen.queryByText("Lycée Montesquieu")).not.toBeInTheDocument();

    // Un état d'erreur honnête, avec un vrai bouton de nouvel essai.
    expect(
      screen.getByText(/Impossible de charger l'annuaire pour le moment/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /réessayer/i })).toBeInTheDocument();
  });

  it("le bouton 'Réessayer' déclenche un nouveau chargement", () => {
    mockUsePublicTenants.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      isFetching: false,
      refetch: mockRefetch,
    });

    renderDirectory();
    fireEvent.click(screen.getByRole("button", { name: /réessayer/i }));

    expect(mockRefetch).toHaveBeenCalledTimes(1);
  });

  it("annuaire vide : affiche l'état vide, jamais d'établissements fictifs", () => {
    mockUsePublicTenants.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      isFetching: false,
      refetch: mockRefetch,
    });

    renderDirectory();

    expect(screen.queryByText("Université La Source")).not.toBeInTheDocument();
    expect(screen.getByText("Aucun établissement trouvé")).toBeInTheDocument();
    expect(screen.queryByText(/Impossible de charger l'annuaire/i)).not.toBeInTheDocument();
  });

  it("affiche les vrais établissements quand l'API répond normalement", () => {
    mockUsePublicTenants.mockReturnValue({
      data: [
        {
          id: "real-1",
          name: "Université Réelle de Conakry",
          slug: "universite-conakry",
          type: "university",
          city: "Conakry",
          country: "Guinée",
        },
      ],
      isLoading: false,
      isError: false,
      isFetching: false,
      refetch: mockRefetch,
    });

    renderDirectory();

    expect(screen.getByText("Université Réelle de Conakry")).toBeInTheDocument();
    expect(screen.queryByText("Université La Source")).not.toBeInTheDocument();
  });
});

describe("PublicDirectory — filtre par type (audit 2026-08-28)", () => {
  // tenant.type réel envoyé par les formulaires de création :
  // "school"|"primary"|"middle"|"high"|"university"|"training" — jamais
  // "high_school"/"primary_school"/"training_center". L'onglet "Lycées"
  // comparait activeTab==="high_school" à tenant.type==="high" et ne
  // matchait donc jamais rien pour un vrai lycée.
  it("l'onglet 'Lycées' affiche bien un tenant réel de type 'high'", () => {
    mockUsePublicTenants.mockReturnValue({
      data: [
        { id: "1", name: "Université Test", slug: "univ-test", type: "university" },
        { id: "2", name: "Lycée Test", slug: "lycee-test", type: "high" },
      ],
      isLoading: false,
      isError: false,
      isFetching: false,
      refetch: mockRefetch,
    });

    renderDirectory();

    fireEvent.click(screen.getByRole("button", { name: /Lycées/i }));

    expect(screen.getByText("Lycée Test")).toBeInTheDocument();
    expect(screen.queryByText("Université Test")).not.toBeInTheDocument();
  });

  it("affiche le badge 'Lycée' (pas la valeur brute 'high') sur une carte d'établissement", () => {
    mockUsePublicTenants.mockReturnValue({
      data: [{ id: "1", name: "Lycée Test", slug: "lycee-test", type: "high" }],
      isLoading: false,
      isError: false,
      isFetching: false,
      refetch: mockRefetch,
    });

    renderDirectory();

    expect(screen.getByText("Lycée")).toBeInTheDocument();
    expect(screen.queryByText("high")).not.toBeInTheDocument();
  });
});

describe("PublicDirectory — filtres par région et préfecture (annuaires)", () => {
  it("propose les régions de l'annuaire réel et transmet le choix au serveur", () => {
    mockFacets.mockReturnValue({ data: {
      types: [], cities: [],
      regions: [{ value: "Conakry", count: 2 }, { value: "Kindia", count: 1 }],
      prefectures: [{ value: "Kaloum", count: 1 }],
    } } as never);
    mockUsePublicTenants.mockReturnValue({
      data: [{ id: "t1", name: "Lycée de Kaloum", slug: "lk", type: "high", city: "Conakry", prefecture: "Kaloum", region: "Conakry" }],
      isLoading: false, isError: false, isFetching: false, refetch: mockRefetch,
    });

    renderDirectory();
    expect(mockUsePublicTenants).toHaveBeenLastCalledWith({ region: "", prefecture: "" });
    fireEvent.change(screen.getByLabelText("publicDirectory.region"), { target: { value: "Kindia" } });
    expect(mockUsePublicTenants).toHaveBeenLastCalledWith({ region: "Kindia", prefecture: "" });
    expect(screen.getByText("Conakry, Kaloum")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "publicOffer.linkAria" })).toHaveAttribute("href", "/ecole/lk/offre");
  });
});
