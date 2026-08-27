/**
 * BUG RÉEL trouvé en construisant le suivi de candidature : le bouton
 * "Inscrire" (ACCEPTED -> CONVERTED_TO_STUDENT) appelait onUpdateStatus,
 * qui ne fait que PATCH /admissions/{id}/status/ — une simple mise à
 * jour du champ status, sans jamais créer la ligne Student réelle
 * (seul POST /admissions/{id}/convert/ le fait, voir
 * useConvertAdmission dans queries/admissions.ts). Cliquer "Inscrire"
 * marquait donc le dossier comme inscrit sans qu'aucun élève n'existe
 * réellement. Ce test verrouille que le bouton appelle bien le callback
 * dédié onConvert, jamais onUpdateStatus.
 */
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

import { AdmissionTable } from "../AdmissionTable";
import type { AdmissionApplication } from "@/queries/admissions";

vi.mock("@/api/client", () => ({
  apiClient: { get: vi.fn().mockResolvedValue({ data: { steps: [], events: [] } }) },
}));

// JSDOM ne mesure aucun layout réel (getBoundingClientRect renvoie 0) —
// useVirtualizer ne "voit" donc aucune ligne visible et ne rend rien.
// Simule un rendu complet, non virtualisé, pour ces tests d'interaction.
vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    getVirtualItems: () =>
      Array.from({ length: count }, (_, index) => ({ index, start: index * 73, size: 73, end: (index + 1) * 73 })),
    getTotalSize: () => count * 73,
  }),
}));

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

function makeApplication(overrides: Partial<AdmissionApplication> = {}): AdmissionApplication {
  return {
    id: "app-1",
    tenant_id: "tenant-1",
    student_first_name: "Awa",
    student_last_name: "Camara",
    parent_first_name: "Mariam",
    parent_last_name: "Camara",
    parent_email: "mariam.camara@example.com",
    parent_phone: "+224600000001",
    status: "ACCEPTED",
    created_at: "2026-08-01T10:00:00Z",
    ...overrides,
  };
}

describe("AdmissionTable — bouton Inscrire", () => {
  it('appelle onConvert (pas onUpdateStatus) pour un dossier ACCEPTED', () => {
    const onUpdateStatus = vi.fn();
    const onConvert = vi.fn();

    renderWithClient(
      <AdmissionTable
        applications={[makeApplication()]}
        isLoading={false}
        studentLabel="Élève"
        onUpdateStatus={onUpdateStatus}
        onConvert={onConvert}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /inscrire/i }));

    expect(onConvert).toHaveBeenCalledWith("app-1", expect.objectContaining({ id: "app-1" }));
    expect(onUpdateStatus).not.toHaveBeenCalled();
  });

  it("désactive le bouton Inscrire pendant la conversion (isConverting)", () => {
    renderWithClient(
      <AdmissionTable
        applications={[makeApplication()]}
        isLoading={false}
        studentLabel="Élève"
        onUpdateStatus={vi.fn()}
        onConvert={vi.fn()}
        isConverting
      />,
    );

    expect(screen.getByRole("button", { name: /inscrire/i })).toBeDisabled();
  });

  it("les autres transitions (SUBMITTED -> UNDER_REVIEW) continuent d'appeler onUpdateStatus", () => {
    const onUpdateStatus = vi.fn();

    renderWithClient(
      <AdmissionTable
        applications={[makeApplication({ id: "app-2", status: "SUBMITTED" })]}
        isLoading={false}
        studentLabel="Élève"
        onUpdateStatus={onUpdateStatus}
        onConvert={vi.fn()}
      />,
    );

    // Le bouton "passer en examen" (icône Eye, statut SUBMITTED) est le
    // seul bouton d'action de transition sur cette ligne.
    const actionButtons = screen.getAllByRole("button").filter((b) => b.title !== "Voir le dossier complet");
    fireEvent.click(actionButtons[0]);

    expect(onUpdateStatus).toHaveBeenCalledWith("app-2", "UNDER_REVIEW", expect.objectContaining({ id: "app-2" }));
  });
});
