/**
 * Audit 2026-08-28 : la galerie n'appliquait jamais resolveUploadUrl()
 * sur item.url — une vraie photo uploadée (chemin relatif) s'affichait
 * cassée. Ajouté au passage : un lightbox (clic pour agrandir), demandé
 * explicitement ("pages avec images") — la grille seule ne permettait
 * aucun agrandissement.
 */
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, beforeEach } from "vitest";
import { Gallery } from "../Gallery";
import { DEFAULT_TOKENS } from "../../theme/tokens";
import type { GallerySectionData } from "../../types/sections";

beforeEach(() => {
  (window as any).__SCHOOLFLOW_CONFIG__ = { API_URL: "https://api.example.test" };
});

function makeSection(overrides: Partial<GallerySectionData> = {}): GallerySectionData {
  return {
    type: "gallery",
    title: "Notre galerie",
    items: [
      { url: "/uploads/photo1.jpg", caption: "Cour de récréation" },
      { url: "/uploads/photo2.jpg" },
    ],
    ...overrides,
  };
}

describe("Gallery — résolution des URL", () => {
  it("ne rend rien quand il n'y a aucune photo", () => {
    const { container } = render(<Gallery section={makeSection({ items: [] })} tokens={DEFAULT_TOKENS} />);
    expect(container.firstChild).toBeNull();
  });

  it("résout l'URL relative de chaque photo de la grille", () => {
    const { container } = render(<Gallery section={makeSection()} tokens={DEFAULT_TOKENS} />);
    // getAllByRole("img") ignore les <img alt=""> (rôle ARIA "presentation"
    // pour la 2e photo, sans légende) — requête DOM directe à la place.
    const images = container.querySelectorAll("img");
    expect(images[0]).toHaveAttribute("src", "https://api.example.test/uploads/photo1.jpg");
    expect(images[1]).toHaveAttribute("src", "https://api.example.test/uploads/photo2.jpg");
  });
});

describe("Gallery — lightbox", () => {
  it("ouvre la photo en plein écran au clic", () => {
    render(<Gallery section={makeSection()} tokens={DEFAULT_TOKENS} />);
    fireEvent.click(screen.getByRole("button", { name: "Agrandir : Cour de récréation" }));
    expect(screen.getByText("Cour de récréation", { selector: "p" })).toBeInTheDocument();
  });

  it("navigue vers la photo suivante dans le lightbox", () => {
    const { container } = render(<Gallery section={makeSection()} tokens={DEFAULT_TOKENS} />);
    fireEvent.click(screen.getByRole("button", { name: "Agrandir : Cour de récréation" }));
    fireEvent.click(screen.getByRole("button", { name: "Photo suivante" }));
    // La 2e photo n'a pas de légende — l'agrandie doit donc afficher la
    // bonne image (photo2.jpg) sans légende visible.
    const enlarged = Array.from(container.querySelectorAll("img")).find((img) =>
      img.getAttribute("src")?.includes("photo2.jpg"),
    );
    expect(enlarged).toBeInTheDocument();
  });

  it("ferme le lightbox", () => {
    render(<Gallery section={makeSection()} tokens={DEFAULT_TOKENS} />);
    fireEvent.click(screen.getByRole("button", { name: "Agrandir : Cour de récréation" }));
    fireEvent.click(screen.getByRole("button", { name: "Fermer" }));
    expect(screen.queryByText("Cour de récréation", { selector: "p" })).not.toBeInTheDocument();
  });

  it("n'affiche pas les flèches précédent/suivant pour une seule photo", () => {
    render(<Gallery section={makeSection({ items: [{ url: "/uploads/seule.jpg" }] })} tokens={DEFAULT_TOKENS} />);
    fireEvent.click(screen.getByRole("button", { name: "Agrandir la photo 1" }));
    expect(screen.queryByRole("button", { name: "Photo suivante" })).not.toBeInTheDocument();
  });
});
