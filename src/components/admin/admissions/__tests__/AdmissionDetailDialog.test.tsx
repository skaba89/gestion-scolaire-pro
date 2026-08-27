/**
 * Signalé par un utilisateur : "quand les étudiants postulent en envoyant
 * les documents en pièces jointes on ne voit pas les pièces mais on voit
 * la demande" — la table d'admissions n'affichait jamais les documents
 * déposés par le candidat, alors que le backend les stockait bel et bien
 * (admission_applications.documents). Ce test verrouille que le dialog
 * de détail les affiche réellement, avec un lien fonctionnel par pièce.
 *
 * Suite (même utilisateur) : "il faut que l'étudiant ... puisse suivre
 * ... l'évolution des dossiers et l'administrateur puisse traiter par
 * étape" — le dialog doit maintenant charger et afficher la timeline
 * (GET /admissions/{id}/timeline/), d'où le passage à un
 * QueryClientProvider et le mock d'apiClient.get ci-dessous (absents
 * avant, ce composant n'avait aucune requête réseau à l'époque).
 */
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi, beforeEach } from "vitest";

import { AdmissionDetailDialog } from "../AdmissionDetailDialog";
import type { AdmissionApplication, AdmissionTimeline } from "@/queries/admissions";

const mockApiGet = vi.fn();
vi.mock("@/api/client", () => ({
  apiClient: { get: (...args: unknown[]) => mockApiGet(...args) },
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
    student_date_of_birth: "2012-03-01",
    student_gender: "F",
    parent_first_name: "Mariam",
    parent_last_name: "Camara",
    parent_email: "mariam.camara@example.com",
    parent_phone: "+224600000001",
    status: "SUBMITTED",
    documents: [],
    ...overrides,
  };
}

function makeTimeline(overrides: Partial<AdmissionTimeline> = {}): AdmissionTimeline {
  return {
    steps: [
      { key: "SUBMITTED", label: "Soumis", date: "2026-08-01T10:00:00Z", state: "done" },
      { key: "UNDER_REVIEW", label: "En cours d'examen", date: null, state: "current" },
      { key: "ACCEPTED", label: "Accepté", date: null, state: "pending" },
      { key: "CONVERTED_TO_STUDENT", label: "Inscrit", date: null, state: "pending" },
    ],
    events: [],
    ...overrides,
  };
}

beforeEach(() => {
  mockApiGet.mockReset();
  mockApiGet.mockResolvedValue({ data: makeTimeline() });
});

describe("AdmissionDetailDialog — pièces jointes du candidat", () => {
  it("affiche chaque document déposé avec son libellé et un lien vers le fichier", async () => {
    const application = makeApplication({
      documents: [
        {
          key: "admissions/tenant-1/piece1.pdf",
          url: "https://storage.example/piece1.pdf",
          filename: "extrait_naissance.pdf",
          document_type: "birth_certificate",
        },
        {
          key: "admissions/tenant-1/piece2.jpg",
          url: "https://storage.example/piece2.jpg",
          filename: "photo.jpg",
          document_type: "id_photo",
        },
      ],
    });

    renderWithClient(
      <AdmissionDetailDialog
        application={application}
        open={true}
        onOpenChange={() => {}}
        studentLabel="Élève"
      />,
    );

    // Libellé lisible (pas le code brut document_type), matching celui vu
    // par le candidat au dépôt (src/pages/public/AdmissionForm.tsx).
    expect(screen.getByText("Extrait de naissance ou carte d'identité")).toBeInTheDocument();
    expect(screen.getByText("Photo d'identité récente")).toBeInTheDocument();
    expect(screen.getByText("extrait_naissance.pdf")).toBeInTheDocument();
    expect(screen.getByText("photo.jpg")).toBeInTheDocument();

    const links = screen.getAllByRole("link", { name: /voir/i });
    expect(links).toHaveLength(2);
    expect(links[0]).toHaveAttribute("href", "https://storage.example/piece1.pdf");
    expect(links[0]).toHaveAttribute("target", "_blank");
    expect(links[1]).toHaveAttribute("href", "https://storage.example/piece2.jpg");
  });

  it("affiche un état vide honnête quand aucun document n'a été déposé", () => {
    renderWithClient(
      <AdmissionDetailDialog
        application={makeApplication({ documents: [] })}
        open={true}
        onOpenChange={() => {}}
        studentLabel="Élève"
      />,
    );

    expect(screen.getByText(/aucun document n'a été déposé/i)).toBeInTheDocument();
  });

  it("affiche les informations complètes du candidat et du parent", () => {
    renderWithClient(
      <AdmissionDetailDialog
        application={makeApplication({
          student_address: "Quartier Almamya, Conakry",
          student_previous_school: "École Les Palmiers",
          parent_occupation: "Commerçante",
          notes: "Dossier prioritaire — fratrie déjà inscrite.",
        })}
        open={true}
        onOpenChange={() => {}}
        studentLabel="Élève"
      />,
    );

    expect(screen.getByText("Quartier Almamya, Conakry")).toBeInTheDocument();
    expect(screen.getByText("École Les Palmiers")).toBeInTheDocument();
    expect(screen.getByText("Commerçante")).toBeInTheDocument();
    expect(screen.getByText("Dossier prioritaire — fratrie déjà inscrite.")).toBeInTheDocument();
  });
});

describe("AdmissionDetailDialog — évolution du dossier (suivi étape par étape)", () => {
  it("charge et affiche la timeline du dossier ouvert", async () => {
    renderWithClient(
      <AdmissionDetailDialog
        application={makeApplication({ id: "app-42" })}
        open={true}
        onOpenChange={() => {}}
        studentLabel="Élève"
      />,
    );

    await waitFor(() => expect(mockApiGet).toHaveBeenCalledWith("/admissions/app-42/timeline/"));
    expect(await screen.findByText("Soumis")).toBeInTheDocument();
    expect(screen.getByText("En cours d'examen")).toBeInTheDocument();
    expect(screen.getByText("Accepté")).toBeInTheDocument();
    expect(screen.getByText("Inscrit")).toBeInTheDocument();
  });

  it("ne charge pas la timeline quand le dialog est fermé", () => {
    renderWithClient(
      <AdmissionDetailDialog
        application={makeApplication()}
        open={false}
        onOpenChange={() => {}}
        studentLabel="Élève"
      />,
    );
    expect(mockApiGet).not.toHaveBeenCalled();
  });
});
