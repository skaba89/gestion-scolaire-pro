/**
 * Signalé par un utilisateur : "quand les étudiants postulent en envoyant
 * les documents en pièces jointes on ne voit pas les pièces mais on voit
 * la demande" — la table d'admissions n'affichait jamais les documents
 * déposés par le candidat, alors que le backend les stockait bel et bien
 * (admission_applications.documents). Ce test verrouille que le dialog
 * de détail les affiche réellement, avec un lien fonctionnel par pièce.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AdmissionDetailDialog } from "../AdmissionDetailDialog";
import type { AdmissionApplication } from "@/queries/admissions";

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

describe("AdmissionDetailDialog — pièces jointes du candidat", () => {
  it("affiche chaque document déposé avec son libellé et un lien vers le fichier", () => {
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

    render(
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
    render(
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
    render(
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
