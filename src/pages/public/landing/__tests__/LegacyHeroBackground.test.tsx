/**
 * Audit 2026-08-28 (banner carrousel) : les 4 templates legacy
 * n'appliquaient jamais resolveUploadUrl() sur settings.banner_url — une
 * vraie bannière uploadée (chemin relatif) s'affichait cassée. Aucun
 * composant Hero partagé n'existait entre eux non plus — ajouter le
 * carrousel en dupliquant une 5e fois aurait été le même risque de
 * dérive déjà signalé par l'audit précédent (PR #141). Ce fichier
 * verrouille le composant partagé factorisé à la place.
 */
import { describe, expect, it, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { LegacyHeroBackground } from "../LegacyHeroBackground";

beforeEach(() => {
  (window as any).__SCHOOLFLOW_CONFIG__ = { API_URL: "https://api.example.test" };
});

describe("LegacyHeroBackground", () => {
  it("ne rend rien sans images ni bannière", () => {
    const { container } = render(<LegacyHeroBackground alt="test" />);
    expect(container.firstChild).toBeNull();
  });

  it("affiche bannerUrl en repli et résout son URL relative", () => {
    const { container } = render(<LegacyHeroBackground bannerUrl="/uploads/banniere.jpg" alt="test" />);
    const img = container.querySelector("img");
    expect(img).toHaveAttribute("src", "https://api.example.test/uploads/banniere.jpg");
  });

  it("une seule photo dans images reste statique (pas de carrousel)", () => {
    render(<LegacyHeroBackground images={["/uploads/p1.jpg"]} alt="test" />);
    expect(screen.queryByLabelText("Aller à la photo 1")).not.toBeInTheDocument();
  });

  it("2+ photos déclenchent le carrousel avec ses indicateurs", () => {
    const { container } = render(<LegacyHeroBackground images={["/uploads/p1.jpg", "/uploads/p2.jpg"]} alt="test" />);
    expect(container.querySelectorAll("img").length).toBe(2);
    expect(screen.getByLabelText("Aller à la photo 1")).toBeInTheDocument();
    expect(screen.getByLabelText("Aller à la photo 2")).toBeInTheDocument();
  });

  it("priorise images sur bannerUrl quand les deux sont fournis", () => {
    const { container } = render(
      <LegacyHeroBackground images={["/uploads/prioritaire.jpg"]} bannerUrl="/uploads/secondaire.jpg" alt="test" />,
    );
    const img = container.querySelector("img");
    expect(img).toHaveAttribute("src", "https://api.example.test/uploads/prioritaire.jpg");
  });

  it("applique imageClassName à chaque image (traitement propre à chaque template)", () => {
    const { container } = render(
      <LegacyHeroBackground bannerUrl="/uploads/banniere.jpg" imageClassName="opacity-25" alt="test" />,
    );
    expect(container.querySelector("img")).toHaveClass("opacity-25");
  });
});
