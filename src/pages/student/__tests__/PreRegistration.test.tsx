import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import i18n from "@/i18n/config";
import PreRegistration from "../PreRegistration";

const get = vi.fn();
const post = vi.fn();
vi.mock("@/api/client", () => ({ apiClient: { get: (...a: unknown[]) => get(...a), post: (...a: unknown[]) => post(...a) } }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "u1" }, tenant: { id: "t1" } }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/contexts/TenantContext", () => ({ useTenant: () => ({ tenant: { id: "t1", type: "secondary", settings: {} } }) }));

beforeAll(async () => {
  await i18n.changeLanguage("fr");
});

beforeEach(() => {
  get.mockReset();
  post.mockReset();
  get.mockImplementation((url: string) => {
    if (url === "/students/me/") {
      return Promise.resolve({ data: {
        id: "s1", first_name: "Aïssatou", last_name: "Diallo", registration_number: "ULS-001",
        enrollments: [{ id: "e1", is_current: true, level_id: "L1", level_name: "6ème" }],
      } });
    }
    if (url === "/academic-years/") {
      return Promise.resolve({ data: [{ id: "Y1", name: "2026-2027", is_current: true }, { id: "Y2", name: "2027-2028" }] });
    }
    if (url === "/levels/") return Promise.resolve({ data: [{ id: "L1", name: "6ème" }, { id: "L2", name: "5ème" }] });
    if (url === "/students/me/reenrollment/") return Promise.resolve({ data: null });
    return Promise.resolve({ data: [] });
  });
  post.mockResolvedValue({ data: { id: "a1", status: "SUBMITTED" } });
});

describe("PreRegistration (élève)", () => {
  it("shows the student's own profile and submits through the student route", async () => {
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <PreRegistration />
      </QueryClientProvider>,
    );
    expect(await screen.findAllByText(/Aïssatou Diallo/)).not.toHaveLength(0);
    expect(get).toHaveBeenCalledWith("/students/me/");
    expect(screen.getByText(/Niveau actuel: 6ème/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Soumettre ma Pré-Réinscription/ }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: /Confirmer/ }));

    await waitFor(() => expect(post).toHaveBeenCalledWith("/students/me/reenroll/", {
      academic_year_id: "Y2", level_id: "L2", notes: undefined,
    }));
    expect(get).not.toHaveBeenCalledWith("/admissions/", expect.anything());
  });
});
