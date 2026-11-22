import "@/i18n/config";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, expect, it, vi } from "vitest";

const { get, post, put } = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
}));

vi.mock("@/api/client", () => ({ apiClient: { get, post, put } }));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "director-1" } }),
}));
vi.mock("@/contexts/TenantContext", () => ({
  useTenant: () => ({ tenant: { id: "tenant-1" } }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import Incidents from "../Incidents";

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <Incidents />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  get.mockImplementation((url: string) => {
    if (url === "/incidents/") {
      return Promise.resolve({ data: [{
        id: "incident-1",
        incident_type: "discipline",
        severity: "major",
        title: "Bagarre dans la cour",
        location: "Cour",
        occurred_at: "2026-11-22T08:00:00Z",
        status: "INVESTIGATING",
        resolver: null,
        parties: ["student-1"],
      }] });
    }
    if (url === "/students/") {
      return Promise.resolve({ data: { items: [{
        id: "student-1",
        first_name: "Aïcha",
        last_name: "Camara",
        registration_number: "MAT-001",
      }], total: 1 } });
    }
    return Promise.reject(new Error(`URL inattendue ${url}`));
  });
  put.mockResolvedValue({ data: { id: "incident-1", status: "RESOLVED" } });
});

it("transmet les élèves sélectionnés lors du signalement", async () => {
  renderPage();

  fireEvent.click(await screen.findByRole("button", { name: "Signaler un incident" }));
  fireEvent.change(screen.getByLabelText("Élèves concernés"), {
    target: { value: "Aïcha" },
  });
  fireEvent.click(await screen.findByRole("button", { name: /Aïcha Camara/ }));
  fireEvent.change(screen.getByPlaceholderText("Résumé de l'incident"), {
    target: { value: "Bagarre dans la cour" },
  });
  fireEvent.change(screen.getByPlaceholderText("Décrivez ce qui s'est passé..."), {
    target: { value: "Deux élèves se sont disputés pendant la récréation." },
  });
  const dateInput = document.querySelector<HTMLInputElement>('input[type="datetime-local"]')!;
  fireEvent.change(dateInput, { target: { value: "2026-11-22T08:00" } });
  fireEvent.click(screen.getAllByRole("button", { name: "Signaler l'incident" }).at(-1)!);

  await waitFor(() => expect(post).toHaveBeenCalledWith("/incidents/", {
    incident_type: "discipline",
    severity: "medium",
    title: "Bagarre dans la cour",
    description: "Deux élèves se sont disputés pendant la récréation.",
    location: "",
    occurred_at: "2026-11-22T08:00",
    student_ids: ["student-1"],
  }));
});

it("résout un incident par la route métier avec le motif et l'action prise", async () => {
  renderPage();

  fireEvent.click(await screen.findByRole("button", { name: "Résoudre" }));
  fireEvent.change(await screen.findByLabelText("Résolution"), {
    target: { value: "Entretien avec les responsables" },
  });
  fireEvent.change(screen.getByLabelText("Action prise"), {
    target: { value: "Médiation et suivi pendant deux semaines" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Confirmer la résolution" }));

  await waitFor(() => expect(put).toHaveBeenCalledWith(
    "/incidents/incident-1/resolve/",
    {
      resolution: "Entretien avec les responsables",
      action_taken: "Médiation et suivi pendant deux semaines",
    },
  ));
});
