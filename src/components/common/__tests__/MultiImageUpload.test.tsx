/**
 * Audit 2026-08-28 (banner carrousel) : settings.gallery n'avait aucun
 * vrai upload de fichier — uniquement un champ texte où coller une URL
 * externe (src/pages/admin/LandingPageEditor.tsx::TabGallery, avant
 * correctif). Ce composant réutilise exactement le chemin d'upload déjà
 * prouvé par LogoSection.tsx (compressImage + POST /storage/upload/),
 * étendu au multi-fichiers + liste ordonnée.
 */
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { MultiImageUpload } from "../MultiImageUpload";

const { mockPost } = vi.hoisted(() => ({ mockPost: vi.fn() }));

vi.mock("@/api/client", () => ({
  apiClient: { post: (...args: any[]) => mockPost(...args) },
}));

beforeEach(() => {
  mockPost.mockReset();
  (window as any).__SCHOOLFLOW_CONFIG__ = { API_URL: "https://api.example.test" };
});

function makeFile(name = "photo.jpg", size = 1024): File {
  const file = new File([new Uint8Array(size)], name, { type: "image/jpeg" });
  return file;
}

describe("MultiImageUpload — état vide et affichage", () => {
  it("affiche le message vide quand il n'y a aucune photo", () => {
    render(<MultiImageUpload images={[]} onChange={vi.fn()} emptyLabel="Aucune photo" />);
    expect(screen.getByText("Aucune photo")).toBeInTheDocument();
  });

  it("résout l'URL relative de chaque photo affichée", () => {
    const { container } = render(
      <MultiImageUpload images={["/uploads/p1.jpg"]} onChange={vi.fn()} />,
    );
    expect(container.querySelector("img")).toHaveAttribute("src", "https://api.example.test/uploads/p1.jpg");
  });
});

describe("MultiImageUpload — upload réel", () => {
  it("uploade un fichier et l'ajoute à la liste via onChange", async () => {
    mockPost.mockResolvedValue({ data: { url: "/uploads/nouvelle-photo.webp" } });
    const onChange = vi.fn();
    const { container } = render(<MultiImageUpload images={["/uploads/existante.jpg"]} onChange={onChange} />);

    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [makeFile()] } });

    await waitFor(() => expect(onChange).toHaveBeenCalledWith(["/uploads/existante.jpg", "/uploads/nouvelle-photo.webp"]));
    expect(mockPost).toHaveBeenCalledWith("/storage/upload/", expect.any(FormData), expect.any(Object));
  });

  it("uploade plusieurs fichiers en une fois", async () => {
    mockPost
      .mockResolvedValueOnce({ data: { url: "/uploads/a.jpg" } })
      .mockResolvedValueOnce({ data: { url: "/uploads/b.jpg" } });
    const onChange = vi.fn();
    const { container } = render(<MultiImageUpload images={[]} onChange={onChange} />);

    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [makeFile("a.jpg"), makeFile("b.jpg")] } });

    await waitFor(() => expect(onChange).toHaveBeenCalledWith(["/uploads/a.jpg", "/uploads/b.jpg"]));
  });

  it("n'appelle jamais onChange quand l'upload échoue", async () => {
    mockPost.mockRejectedValue({ response: { data: { detail: "Erreur serveur" } } });
    const onChange = vi.fn();
    const { container } = render(<MultiImageUpload images={[]} onChange={onChange} />);

    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [makeFile()] } });

    await waitFor(() => expect(mockPost).toHaveBeenCalled());
    expect(onChange).not.toHaveBeenCalled();
  });

  it("rejette un fichier trop volumineux sans appeler l'API", async () => {
    const onChange = vi.fn();
    const { container } = render(<MultiImageUpload images={[]} onChange={onChange} maxSizeMb={1} />);

    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const tooLarge = makeFile("grosse.jpg", 2 * 1024 * 1024);
    fireEvent.change(input, { target: { files: [tooLarge] } });

    await waitFor(() => expect(input.value).toBe(""));
    expect(mockPost).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("MultiImageUpload — suppression", () => {
  it("retire une photo de la liste au clic sur Supprimer", () => {
    const onChange = vi.fn();
    render(<MultiImageUpload images={["/uploads/a.jpg", "/uploads/b.jpg"]} onChange={onChange} />);

    fireEvent.click(screen.getAllByTitle("Supprimer")[0]);

    expect(onChange).toHaveBeenCalledWith(["/uploads/b.jpg"]);
  });
});
