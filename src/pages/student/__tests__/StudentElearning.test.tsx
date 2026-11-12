import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import i18n from "@/i18n/config";
import StudentElearning from "../StudentElearning";

const get = vi.fn();
const post = vi.fn();
vi.mock("@/api/client", () => ({ apiClient: { get: (...a: unknown[]) => get(...a), post: (...a: unknown[]) => post(...a) } }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const lesson = (id: string, extra = {}) => ({
  id, course_id: "c1", module_id: "m1", title: `Leçon ${id}`, content: null, resource_url: null,
  lesson_type: "text", duration_minutes: 10, order_index: 0, is_published: true, completed: false, ...extra,
});

beforeAll(async () => {
  await i18n.changeLanguage("fr");
});

beforeEach(() => {
  get.mockReset();
  post.mockReset();
  get.mockImplementation((url: string) => {
    if (url === "/me/elearning/courses/") {
      return Promise.resolve({ data: [{ id: "c1", title: "Algèbre", description: null, duration_hours: null,
        subject_name: "Mathématiques", lesson_count: 2, completed_count: 1 }] });
    }
    return Promise.resolve({ data: { course: { id: "c1", title: "Algèbre", description: null }, modules: [{
      id: "m1", course_id: "c1", title: "Équations", description: null, order_index: 0, lessons: [
        lesson("l1", { content: "<img src=x onerror=alert(1)> texte", resource_url: "https://exemple.org/video" }),
        lesson("l2", { resource_url: "javascript:alert(1)" }),
      ] }] } });
  });
  post.mockResolvedValue({ data: { completed: true } });
});

function renderPage() {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <StudentElearning />
    </QueryClientProvider>,
  );
}

describe("StudentElearning", () => {
  it("lists the student's courses with their progress", async () => {
    renderPage();
    expect(await screen.findByText("Algèbre")).toBeInTheDocument();
    expect(screen.getByText("1 leçon(s) terminée(s) sur 2")).toBeInTheDocument();
    expect(screen.getByText("50%")).toBeInTheDocument();
  });

  it("shows lesson content as plain text, only https links, and marks a lesson done", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /Continuer/ }));
    expect(await screen.findByText("<img src=x onerror=alert(1)> texte")).toBeInTheDocument();
    expect(document.querySelector("img")).toBeNull();
    expect(screen.getByRole("link", { name: /Ouvrir la ressource/ })).toHaveAttribute("href", "https://exemple.org/video");

    fireEvent.click(screen.getByRole("button", { name: "Marquer comme terminée" }));
    await waitFor(() => expect(post).toHaveBeenCalledWith("/me/elearning/lessons/l1/complete/"));

    fireEvent.click(screen.getByRole("button", { name: /Leçon l2/ }));
    expect(screen.queryByRole("link", { name: /Ouvrir la ressource/ })).toBeNull();
  });

  it("says when no course is published for the student's level", async () => {
    get.mockResolvedValueOnce({ data: [] });
    renderPage();
    expect(await screen.findByText(/Aucun cours en ligne/)).toBeInTheDocument();
  });
});
