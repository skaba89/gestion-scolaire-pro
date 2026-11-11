import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

/**
 * Mentors alumni (2026-11-11) : changer le statut d'une demande appelait
 * `PUT /hr/mentorship-requests/{id}/` (inexistant → 404) avec des champs
 * absents de la table. Route réelle : PATCH /alumni/admin/mentorship-requests/{id}/.
 */

const { get, patch, success, error } = vi.hoisted(() => ({ get: vi.fn(), patch: vi.fn(), success: vi.fn(), error: vi.fn() }));
vi.mock("@/api/client", () => ({ apiClient: { get, patch, put: vi.fn(), post: vi.fn(), delete: vi.fn() } }));
vi.mock("@/contexts/TenantContext", () => ({ useTenant: () => ({ tenant: { id: "tenant-1" } }) }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("sonner", () => ({ toast: { success, error } }));
vi.mock("@/queries/admin", () => ({ adminQueries: {
  alumniMentors: () => ({ queryKey: ["mentors"], queryFn: async () => [] }),
  mentorshipRequests: () => ({ queryKey: ["admin-mentorship-requests", "tenant-1"], queryFn: async () => [{
    id: "req-1", status: "PENDING", message: "Orientation", created_at: "2026-11-01T10:00:00",
    students: { first_name: "Awa", last_name: "Bah" }, alumni_mentors: { first_name: "Moussa", last_name: "Camara" },
  }] }),
} }));
vi.mock("@/components/ui/select", () => ({
  Select: ({ value, onValueChange, children }: { value: string; onValueChange: (v: string) => void; children: ReactNode }) =>
    <select aria-label="statut" value={value} onChange={(e) => onValueChange(e.target.value)}>{children}</select>,
  SelectTrigger: () => null, SelectValue: () => null,
  SelectContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  SelectItem: ({ value, children }: { value: string; children: ReactNode }) => <option value={value}>{children}</option>,
}));
import AlumniMentors from "../AlumniMentors";

beforeEach(() => { vi.clearAllMocks(); patch.mockResolvedValue({ data: {} }); });

async function openRequestsTab() {
  const tab = await screen.findByRole("tab", { name: /alumniMentors.tabRequests/ });
  fireEvent.mouseDown(tab);
  fireEvent.click(tab);
}

it("change le statut d'une demande par la route réelle", async () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={queryClient}><AlumniMentors /></QueryClientProvider>);
  await openRequestsTab();
  fireEvent.change(await screen.findByRole("combobox", { name: "statut" }), { target: { value: "ACTIVE" } });
  await waitFor(() => expect(patch).toHaveBeenCalledWith("/alumni/admin/mentorship-requests/req-1/", { status: "ACTIVE" }));
  await waitFor(() => expect(success).toHaveBeenCalled());
});

it("affiche la raison d'un refus", async () => {
  patch.mockRejectedValueOnce({ response: { data: { detail: "Permission refusée" } } });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={queryClient}><AlumniMentors /></QueryClientProvider>);
  await openRequestsTab();
  fireEvent.change(await screen.findByRole("combobox", { name: "statut" }), { target: { value: "CANCELLED" } });
  await waitFor(() => expect(error).toHaveBeenCalledWith("Permission refusée"));
});
