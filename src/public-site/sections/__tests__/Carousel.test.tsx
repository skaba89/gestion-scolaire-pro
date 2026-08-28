import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { Carousel } from "../Carousel";
import { DEFAULT_TOKENS } from "../../theme/tokens";
import type { CarouselSectionData } from "../../types/sections";

beforeEach(() => {
  (window as any).__SCHOOLFLOW_CONFIG__ = { API_URL: "https://api.example.test" };
});

function makeSection(overrides: Partial<CarouselSectionData> = {}): CarouselSectionData {
  return {
    type: "carousel",
    title: "Notre campus",
    items: [
      { url: "/uploads/a.jpg", caption: "Bibliothèque" },
      { url: "/uploads/b.jpg" },
    ],
    ...overrides,
  };
}

describe("Carousel (Website Builder premium)", () => {
  it("ne rend rien sans photo (jamais de placeholder fabriqué)", () => {
    const { container } = render(<Carousel section={makeSection({ items: [] })} tokens={DEFAULT_TOKENS} />);
    expect(container.firstChild).toBeNull();
  });

  it("résout l'URL relative de chaque photo", () => {
    const { container } = render(<Carousel section={makeSection()} tokens={DEFAULT_TOKENS} />);
    const srcs = Array.from(container.querySelectorAll("img")).map((img) => img.getAttribute("src"));
    expect(srcs).toEqual([
      "https://api.example.test/uploads/a.jpg",
      "https://api.example.test/uploads/b.jpg",
    ]);
  });

  it("affiche le titre et une légende", () => {
    render(<Carousel section={makeSection()} tokens={DEFAULT_TOKENS} />);
    expect(screen.getByText("Notre campus")).toBeInTheDocument();
    expect(screen.getByText("Bibliothèque")).toBeInTheDocument();
  });

  it("n'affiche pas les contrôles pour une seule photo", () => {
    render(<Carousel section={makeSection({ items: [{ url: "/uploads/seule.jpg" }] })} tokens={DEFAULT_TOKENS} />);
    expect(screen.queryByLabelText("Photo suivante")).not.toBeInTheDocument();
  });

  it("affiche les contrôles à partir de 2 photos", () => {
    render(<Carousel section={makeSection()} tokens={DEFAULT_TOKENS} />);
    expect(screen.getByLabelText("Photo précédente")).toBeInTheDocument();
    expect(screen.getByLabelText("Photo suivante")).toBeInTheDocument();
  });

  it("settings.autoplay=false n'empêche pas l'affichage des photos", () => {
    const { container } = render(
      <Carousel section={makeSection({ settings: { autoplay: false } })} tokens={DEFAULT_TOKENS} />,
    );
    expect(container.querySelectorAll("img").length).toBe(2);
  });
});
