/**
 * A5 : en modification d'un élève, changer la classe ici n'avait aucun effet
 * (seule la création inscrit) et rien ne le signalait. Le choix est désactivé
 * et renvoie vers « Changer de classe » de la page Inscriptions.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { useForm } from "react-hook-form";
import { Form } from "@/components/ui/form";
import { StudentEnrollmentSection } from "@/components/students/form/StudentEnrollmentSection";
import type { StudentFormValues } from "@/components/students/form/schema";
import { apiClient } from "@/api/client";

vi.mock("@/api/client", () => ({ apiClient: { get: vi.fn() } }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

const Harness = ({ isEdit }: { isEdit: boolean }) => {
  const form = useForm<StudentFormValues>({
    defaultValues: { level_id: "level-1", department_id: "none", class_id: "none" } as Partial<StudentFormValues>,
  });
  return (
    <Form {...form}>
      <StudentEnrollmentSection form={form} departments={[]} levels={[{ id: "level-1", name: "6e" }]}
        selectedOptionalSubjects={[]} onOptionalSubjectToggle={vi.fn()} isEdit={isEdit} />
    </Form>
  );
};

const classTrigger = () => screen.getAllByRole("combobox").at(-1)!;

describe("StudentEnrollmentSection — classe en modification (A5)", () => {
  beforeEach(() => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: [{ id: "class-1", name: "6e A" }] });
  });

  it("disables the class choice and points to the Enrollments page when editing", async () => {
    render(<Harness isEdit />);
    await waitFor(() => expect(screen.getByText(/Classe \(pour inscription\)/)).toBeInTheDocument());
    expect(classTrigger()).toBeDisabled();
    expect(screen.getByText("enrollments.classChangeHint")).toBeInTheDocument();
  });

  it("keeps the class choice for a new student", async () => {
    render(<Harness isEdit={false} />);
    await waitFor(() => expect(screen.getByText(/Classe \(pour inscription\)/)).toBeInTheDocument());
    expect(classTrigger()).toBeEnabled();
    expect(screen.queryByText("enrollments.classChangeHint")).not.toBeInTheDocument();
  });
});
