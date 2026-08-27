/**
 * Signalé par un utilisateur : le candidat doit pouvoir suivre l'évolution
 * de son dossier étape par étape — composant partagé entre la page
 * publique de suivi (ApplicationStatus.tsx) et le dialog admin
 * (AdmissionDetailDialog.tsx). Verrouille le rendu des différents états
 * d'étape (done/current/pending/rejected) — la logique de calcul elle-même
 * vit côté serveur (_build_admission_steps), ce composant n'est que de
 * la présentation.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AdmissionTimeline } from "../AdmissionTimeline";
import type { AdmissionStep } from "@/queries/admissions";

describe("AdmissionTimeline", () => {
  it("affiche toutes les étapes dans l'ordre, avec leur libellé", () => {
    const steps: AdmissionStep[] = [
      { key: "SUBMITTED", label: "Soumis", date: "2026-08-01T10:00:00Z", state: "done" },
      { key: "UNDER_REVIEW", label: "En cours d'examen", date: "2026-08-05T09:00:00Z", state: "done" },
      { key: "ACCEPTED", label: "Accepté", date: null, state: "current" },
      { key: "CONVERTED_TO_STUDENT", label: "Inscrit", date: null, state: "pending" },
    ];
    render(<AdmissionTimeline steps={steps} />);

    const labels = screen.getAllByText(/Soumis|En cours d'examen|Accepté|Inscrit/);
    expect(labels.map((l) => l.textContent)).toEqual(["Soumis", "En cours d'examen", "Accepté", "Inscrit"]);
  });

  it("affiche une date formatée pour les étapes atteintes", () => {
    const steps: AdmissionStep[] = [
      { key: "SUBMITTED", label: "Soumis", date: "2026-08-01T10:00:00Z", state: "done" },
    ];
    render(<AdmissionTimeline steps={steps} />);
    expect(screen.getByText(/01 août 2026/)).toBeInTheDocument();
  });

  it('affiche "En cours" pour l\'étape courante sans date', () => {
    const steps: AdmissionStep[] = [
      { key: "UNDER_REVIEW", label: "En cours d'examen", date: null, state: "current" },
    ];
    render(<AdmissionTimeline steps={steps} />);
    expect(screen.getByText("En cours")).toBeInTheDocument();
  });

  it('affiche "En attente" pour une étape future', () => {
    const steps: AdmissionStep[] = [
      { key: "ACCEPTED", label: "Accepté", date: null, state: "pending" },
    ];
    render(<AdmissionTimeline steps={steps} />);
    expect(screen.getByText("En attente")).toBeInTheDocument();
  });

  it("remplace les étapes restantes par un statut refusé quand le dossier a été rejeté", () => {
    const steps: AdmissionStep[] = [
      { key: "SUBMITTED", label: "Soumis", date: "2026-08-01T10:00:00Z", state: "done" },
      { key: "UNDER_REVIEW", label: "En cours d'examen", date: "2026-08-05T09:00:00Z", state: "done" },
      { key: "REJECTED", label: "Refusé", date: "2026-08-06T09:00:00Z", state: "rejected" },
    ];
    render(<AdmissionTimeline steps={steps} />);
    expect(screen.queryByText("Accepté")).not.toBeInTheDocument();
    expect(screen.queryByText("Inscrit")).not.toBeInTheDocument();
    expect(screen.getByText("Refusé")).toBeInTheDocument();
  });

  it("mode compact n'affiche pas les dates/statuts textuels", () => {
    const steps: AdmissionStep[] = [
      { key: "SUBMITTED", label: "Soumis", date: "2026-08-01T10:00:00Z", state: "done" },
    ];
    render(<AdmissionTimeline steps={steps} compact />);
    expect(screen.getByText("Soumis")).toBeInTheDocument();
    expect(screen.queryByText(/01 août 2026/)).not.toBeInTheDocument();
  });

  it("ne rend rien pour une liste d'étapes vide", () => {
    const { container } = render(<AdmissionTimeline steps={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
