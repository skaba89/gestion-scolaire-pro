/**
 * Nouveau type de section "carousel" (audit 2026-08-28, "des pages avec
 * images") — même liste de photos réelles par section ({url, caption?})
 * que la Galerie photo existante, présentées en diaporama automatique
 * au lieu d'une grille statique. Verrouille : résolution des URL
 * (resolveUploadUrl), pas de photo fabriquée si la section est vide, et
 * les contrôles de navigation n'apparaissent qu'à partir de 2 photos.
 */
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { CarouselSection } from "@/pages/public/PublicPageView";
import type { PublicPageSection } from "@/hooks/usePublicPages";

beforeEach(() => {
  (window as any).__SCHOOLFLOW_CONFIG__ = { API_URL: "https://api.example.test" };
});

describe("CarouselSection", () => {
  it("ne rend rien quand la section n'a aucune photo", () => {
    const section: PublicPageSection = { type: "carousel", items: [] };
    const { container } = render(<CarouselSection section={section} />);
    expect(container.firstChild).toBeNull();
  });

  it("résout l'URL relative de chaque photo", () => {
    const section: PublicPageSection = {
      type: "carousel",
      items: [{ url: "/uploads/a.jpg" }, { url: "/uploads/b.jpg" }],
    };
    const { container } = render(<CarouselSection section={section} />);
    const srcs = Array.from(container.querySelectorAll("img")).map((img) => img.getAttribute("src"));
    expect(srcs).toEqual([
      "https://api.example.test/uploads/a.jpg",
      "https://api.example.test/uploads/b.jpg",
    ]);
  });

  it("n'affiche pas les contrôles de navigation pour une seule photo", () => {
    const section: PublicPageSection = { type: "carousel", items: [{ url: "/uploads/seule.jpg" }] };
    render(<CarouselSection section={section} />);
    expect(screen.queryByLabelText("Photo suivante")).not.toBeInTheDocument();
  });

  it("affiche les contrôles de navigation à partir de 2 photos", () => {
    const section: PublicPageSection = {
      type: "carousel",
      items: [{ url: "/uploads/a.jpg" }, { url: "/uploads/b.jpg" }],
    };
    render(<CarouselSection section={section} />);
    expect(screen.getByLabelText("Photo précédente")).toBeInTheDocument();
    expect(screen.getByLabelText("Photo suivante")).toBeInTheDocument();
    expect(screen.getByLabelText("Aller à la photo 1")).toBeInTheDocument();
    expect(screen.getByLabelText("Aller à la photo 2")).toBeInTheDocument();
  });

  it("affiche le titre et la légende d'une photo", () => {
    const section: PublicPageSection = {
      type: "carousel",
      title: "Notre campus",
      items: [{ url: "/uploads/a.jpg", caption: "Bibliothèque" }],
    };
    render(<CarouselSection section={section} />);
    expect(screen.getByText("Notre campus")).toBeInTheDocument();
    expect(screen.getByText("Bibliothèque")).toBeInTheDocument();
  });
});
