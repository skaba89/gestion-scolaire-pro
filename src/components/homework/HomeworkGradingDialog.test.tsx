import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, expect, it, vi } from "vitest";
import HomeworkGradingDialog from "./HomeworkGradingDialog";

const { get, put } = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn() }));
vi.mock("@/api/client", () => ({ apiClient: { get, put } }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "teacher" } }) }));
vi.mock("@/hooks/useStudentLabel", () => ({ useStudentLabel: () => ({ StudentLabel: "Élève" }) }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

const homework = { id: "hw", title: "Calcul", class_id: "class", tenant_id: "school" };
const student = { id: "student", first_name: "Aïcha", last_name: "Camara" };
const submission = { id: "sub", tenant_id: "school", homework_id: "hw", student_id: "student", grade: 0, feedback: "À revoir" };

function openDialog() {
  render(<QueryClientProvider client={new QueryClient()}>
    <HomeworkGradingDialog homework={homework} tenantId="school" open onOpenChange={() => {}} />
  </QueryClientProvider>);
}

beforeEach(() => { get.mockReset(); put.mockReset(); });

it("arrête la lecture des copies lorsque la liste de classe est refusée", async () => {
  get.mockRejectedValue(new Error("Forbidden"));
  openDialog();
  expect(await screen.findByRole("alert")).toHaveTextContent("homework.gradingLoadError");
  expect(get).toHaveBeenCalledTimes(1);
  expect(get).toHaveBeenCalledWith("/infrastructure/enrollments/", expect.objectContaining({
    params: { class_id: "class", status: "active" },
  }));
  expect(screen.queryByRole("spinbutton")).toBeNull();
});

it("écarte les données si le devoir a changé de classe", async () => {
  get.mockResolvedValueOnce({ data: [{ student }] })
    .mockResolvedValueOnce({ data: { ...homework, class_id: "other", submissions: [submission] } });
  openDialog();
  expect(await screen.findByRole("alert")).toBeInTheDocument();
  expect(screen.queryByRole("spinbutton")).toBeNull();
});

it("n'affiche que les inscrits actifs et conserve une note de zéro pendant la correction du commentaire", async () => {
  get.mockImplementation(async (path: string) => path === "/infrastructure/enrollments/" ?
    { data: [{ student }, { student }] } :
    { data: { ...homework, submissions: [submission, { ...submission, student_id: "former", content: "Ancienne copie" }] } });
  put.mockResolvedValue({ data: {} });
  openDialog();
  expect(await screen.findByRole("spinbutton")).toHaveValue(0);
  expect(screen.queryByText("Ancienne copie")).toBeNull();
  expect(screen.getAllByText("Aïcha Camara")).toHaveLength(1);
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "Progrès" } });
  fireEvent.click(screen.getByRole("button", { name: "common.save" }));
  await waitFor(() => expect(put).toHaveBeenCalledWith("/homework-submissions/sub", { grade: 0, feedback: "Progrès" }));
});

it("préserve le commentaire en modifiant uniquement la note et refuse une valeur hors barème", async () => {
  get.mockImplementation(async (path: string) => path === "/infrastructure/enrollments/" ?
    { data: [{ student }] } : { data: { ...homework, submissions: [submission] } });
  put.mockResolvedValue({ data: {} });
  openDialog();
  const grade = await screen.findByRole("spinbutton");
  const save = screen.getByRole("button", { name: "common.save" });
  fireEvent.change(grade, { target: { value: "21" } });
  expect(save).toBeDisabled();
  fireEvent.change(grade, { target: { value: "16.5" } });
  fireEvent.click(save);
  await waitFor(() => expect(put).toHaveBeenCalledWith("/homework-submissions/sub", { grade: 16.5, feedback: "À revoir" }));
});
