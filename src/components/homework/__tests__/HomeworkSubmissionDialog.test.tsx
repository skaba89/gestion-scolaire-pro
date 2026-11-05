import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import HomeworkSubmissionDialog from "../HomeworkSubmissionDialog";

const { post, put, success, error } = vi.hoisted(() => ({
  post: vi.fn(), put: vi.fn(), success: vi.fn(), error: vi.fn(),
}));
vi.mock("@/api/client", () => ({ apiClient: { post, put } }));
vi.mock("sonner", () => ({ toast: { success, error } }));

const submission = {
  id: "submission-1", content: "Première réponse", submitted_at: null,
  grade: null, feedback: null,
};

function setup(existingSubmission: typeof submission | null = null) {
  const onOpenChange = vi.fn();
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const props = { homework: { id: "hw-1", title: "Devoir" }, studentId: "student-1",
    tenantId: "tenant-1", existingSubmission, open: true, onOpenChange };
  const view = render(<QueryClientProvider client={client}>
    <HomeworkSubmissionDialog {...props} />
  </QueryClientProvider>);
  return { ...view, client, props, onOpenChange };
}

beforeEach(() => {
  vi.clearAllMocks();
  post.mockResolvedValue({ data: { id: "submission-1" } });
  put.mockResolvedValue({ data: { id: "submission-1" } });
});

describe("Remise de devoir depuis le portail élève", () => {
  it("crée avec le contrat serveur et laisse le serveur dater la remise", async () => {
    const { client, onOpenChange } = setup();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Mon travail" } });
    fireEvent.click(screen.getByRole("button", { name: "Soumettre mon travail" }));
    await waitFor(() => expect(success).toHaveBeenCalled());
    expect(post).toHaveBeenCalledExactlyOnceWith("/homework/hw-1/submit/", {
      homework_id: "hw-1", student_id: "student-1", content: "Mon travail",
    });
    expect(put).not.toHaveBeenCalled();
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["student-submissions"] });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("modifie le contenu via la route élève sans envoyer de note", async () => {
    setup(submission);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Réponse corrigée" } });
    fireEvent.click(screen.getByRole("button", { name: "Modifier ma soumission" }));
    await waitFor(() => expect(success).toHaveBeenCalled());
    expect(put).toHaveBeenCalledExactlyOnceWith("/homework/hw-1/submissions/submission-1/", {
      content: "Réponse corrigée",
    });
    expect(post).not.toHaveBeenCalled();
  });

  it.each([403, 409, 500])("garde la saisie et le dialogue sur une erreur %s sans réécriture", async status => {
    const { onOpenChange } = setup(submission);
    put.mockRejectedValueOnce(new Error(`HTTP ${status}`));
    fireEvent.click(screen.getByRole("button", { name: "Modifier ma soumission" }));
    await waitFor(() => expect(error).toHaveBeenCalled());
    expect(success).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByRole("textbox")).toHaveValue("Première réponse");
    expect(put).toHaveBeenCalledTimes(1);
    expect(post).not.toHaveBeenCalled();
  });

  it("ne propose aucune modification après une note de zéro", () => {
    const { props, client, rerender } = setup();
    rerender(<QueryClientProvider client={client}>
      <HomeworkSubmissionDialog {...props} existingSubmission={{ ...submission, grade: 0 }} />
    </QueryClientProvider>);
    expect(screen.getByRole("textbox")).toBeDisabled();
    expect(screen.queryByRole("button", { name: /soumettre|modifier ma soumission/i })).not.toBeInTheDocument();
    expect(put).not.toHaveBeenCalled();
  });

  it("ne réutilise pas le contenu du devoir précédent", () => {
    const { props, client, rerender } = setup(submission);
    rerender(<QueryClientProvider client={client}>
      <HomeworkSubmissionDialog {...props} homework={{ id: "hw-2", title: "Autre devoir" }} existingSubmission={null} />
    </QueryClientProvider>);
    expect(screen.getByRole("textbox")).toHaveValue("");
  });
});
