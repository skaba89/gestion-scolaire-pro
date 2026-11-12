import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import i18n from "@/i18n/config";
import Elearning from "../Elearning";

const get = vi.fn();
const post = vi.fn();
const del = vi.fn();
vi.mock("@/api/client", () => ({
  apiClient: {
    get: (...a: unknown[]) => get(...a),
    post: (...a: unknown[]) => post(...a),
    put: vi.fn(),
    delete: (...a: unknown[]) => del(...a),
  },
}));
vi.mock("@/contexts/TenantContext", () => ({ useTenant: () => ({ tenant: { id: "t1" } }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

beforeAll(async () => {
  await i18n.changeLanguage("fr");
});

beforeEach(() => {
  [get, post, del].forEach((m) => m.mockReset());
  get.mockImplementation((url: string) => {
    if (url === "/analytics/elearning/courses/") {
      return Promise.resolve({ data: [{ id: "c1", title: "Algèbre", status: "published", thumbnail_url: null }] });
    }
    if (url === "/analytics/elearning/enrollments/") return Promise.resolve({ data: [] });
    return Promise.resolve({ data: { course: { id: "c1" }, modules: [{
      id: "m1", course_id: "c1", title: "Équations", description: null, order_index: 0, lessons: [] }] } });
  });
  post.mockResolvedValue({ data: {} });
  del.mockResolvedValue({ data: null });
  vi.spyOn(window, "confirm").mockReturnValue(true);
});

function openCourse() {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <Elearning />
    </QueryClientProvider>,
  );
}

describe("Elearning admin page", () => {
  it("loads the course programme from the server and saves a new lesson there", async () => {
    openCourse();
    fireEvent.click(await screen.findByLabelText("Voir le cours"));
    await waitFor(() => expect(get).toHaveBeenCalledWith("/analytics/elearning/courses/c1/content/"));
    expect(screen.queryByText(/ne sont pas enregistr/)).toBeNull();

    fireEvent.click(await screen.findByText("Équations"));
    fireEvent.click(screen.getByRole("button", { name: /Ajouter une leçon/ }));
    fireEvent.change(screen.getByLabelText("Titre de la leçon"), { target: { value: "Introduction" } });
    fireEvent.change(screen.getByLabelText(/Lien vers une ressource/), { target: { value: "http://exemple.org" } });
    expect(screen.getByText("Le lien doit commencer par https://")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Lien vers une ressource/), { target: { value: "https://exemple.org" } });
    fireEvent.click(screen.getByRole("button", { name: "Ajouter" }));

    await waitFor(() => expect(post).toHaveBeenCalledWith(
      "/analytics/elearning/modules/m1/lessons/",
      expect.objectContaining({ title: "Introduction", resource_url: "https://exemple.org", is_published: false }),
    ));
  });

  it("deletes a module on the server", async () => {
    openCourse();
    fireEvent.click(await screen.findByLabelText("Voir le cours"));
    fireEvent.click(await screen.findByLabelText("Supprimer le module"));
    await waitFor(() => expect(del).toHaveBeenCalledWith("/analytics/elearning/modules/m1/"));
  });
});
