/**
 * Audit 2026-08-28 (banner carrousel) : le Hero n'affichait qu'une seule
 * image de fond statique (settings.banner_url), sans jamais résoudre
 * l'URL via resolveUploadUrl() — un tenant qui uploadait vraiment sa
 * bannière (chemin relatif /uploads/...) la voyait cassée sur son site
 * public, seule une URL externe absolue collée à la main fonctionnait
 * par coïncidence. Ce fichier verrouille : (1) le repli 1-image statique
 * continue de fonctionner ET résout désormais bien l'URL, (2) 2+ photos
 * réelles (settings.gallery) déclenchent le carrousel automatique, (3)
 * jamais de photo fabriquée insérée pour "remplir" le carrousel.
 */
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, beforeEach } from "vitest";
import { Hero } from "../Hero";
import { DEFAULT_TOKENS } from "../../theme/tokens";
import type { HeroSectionData } from "../../types/sections";

function renderHero(props: Partial<Parameters<typeof Hero>[0]> = {}) {
  const section: HeroSectionData = { type: "hero", title: "Bienvenue", ...(props.section as object) };
  return render(
    <MemoryRouter>
      <Hero section={section} tokens={DEFAULT_TOKENS} {...props} />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  (window as any).__SCHOOLFLOW_CONFIG__ = { API_URL: "https://api.example.test" };
});

describe("Hero — image de fond", () => {
  it("n'affiche aucune image de fond quand rien n'est fourni", () => {
    const { container } = renderHero();
    expect(container.querySelector("img")).not.toBeInTheDocument();
  });

  it("affiche une seule image statique et résout son URL relative (fallbackBackgroundImage)", () => {
    const { container } = renderHero({ fallbackBackgroundImage: "/uploads/banniere.jpg" });
    const img = container.querySelector("img");
    expect(img).toBeInTheDocument();
    expect(img?.getAttribute("src")).toBe("https://api.example.test/uploads/banniere.jpg");
  });

  it("une seule photo dans settings.gallery reste une image statique (pas de contrôles de carrousel)", () => {
    const { container } = renderHero({ images: ["/uploads/photo1.jpg"] });
    expect(container.querySelectorAll("img").length).toBe(1);
    expect(screen.queryByLabelText("Photo suivante")).not.toBeInTheDocument();
  });

  it("2+ photos réelles déclenchent le carrousel avec ses contrôles", () => {
    const { container } = renderHero({ images: ["/uploads/p1.jpg", "/uploads/p2.jpg", "/uploads/p3.jpg"] });
    expect(container.querySelectorAll("img").length).toBe(3);
    expect(screen.getByLabelText("Photo suivante")).toBeInTheDocument();
    expect(screen.getByLabelText("Photo précédente")).toBeInTheDocument();
    // Un indicateur (point) par photo
    expect(screen.getByLabelText("Aller à la photo 1")).toBeInTheDocument();
    expect(screen.getByLabelText("Aller à la photo 3")).toBeInTheDocument();
  });

  it("résout l'URL de chaque photo du carrousel", () => {
    const { container } = renderHero({ images: ["/uploads/p1.jpg", "/uploads/p2.jpg"] });
    const srcs = Array.from(container.querySelectorAll("img")).map((img) => img.getAttribute("src"));
    expect(srcs).toEqual([
      "https://api.example.test/uploads/p1.jpg",
      "https://api.example.test/uploads/p2.jpg",
    ]);
  });

  it("images vides ne génèrent jamais de photo fabriquée — repli sur fallbackBackgroundImage", () => {
    const { container } = renderHero({ images: [], fallbackBackgroundImage: "/uploads/banniere.jpg" });
    expect(container.querySelectorAll("img").length).toBe(1);
  });

  it("priorise section.settings.background_image sur fallbackBackgroundImage quand une seule image", () => {
    const { container } = renderHero({
      section: { type: "hero", title: "T", settings: { background_image: "/uploads/prioritaire.jpg" } } as HeroSectionData,
      fallbackBackgroundImage: "/uploads/secondaire.jpg",
    });
    const img = container.querySelector("img");
    expect(img?.getAttribute("src")).toBe("https://api.example.test/uploads/prioritaire.jpg");
  });
});

describe("Hero — contenu texte inchangé", () => {
  it("affiche le titre et le sous-titre", () => {
    renderHero({ section: { type: "hero", title: "Mon École", subtitle: "Un sous-titre" } as HeroSectionData });
    expect(screen.getByText("Mon École")).toBeInTheDocument();
    expect(screen.getByText("Un sous-titre")).toBeInTheDocument();
  });
});
