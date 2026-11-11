import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

/**
 * Rendez-vous côté parent (2026-11-11). Avant : la liste attendait un tableau
 * alors que l'API renvoie une page { items } (toujours vide), la réservation
 * envoyait enseignant / date / heure / tenant_id / parent_id puis un PUT vers
 * une route inexistante, et l'annulation un PUT inexistant (404).
 */

const { get, post, put, success, error } = vi.hoisted(() => ({
  get: vi.fn(), post: vi.fn(), put: vi.fn(), success: vi.fn(), error: vi.fn(),
}));
vi.mock("@/api/client", () => ({ apiClient: { get, post, put } }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "parent-1" } }) }));
vi.mock("@/contexts/TenantContext", () => ({ useTenant: () => ({ tenant: { id: "tenant-1" } }) }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("sonner", () => ({ toast: { success, error } }));
vi.mock("@/components/ui/select", () => ({
  Select: ({ value, onValueChange, children }: { value: string; onValueChange: (value: string) => void; children: ReactNode }) =>
    <select value={value} onChange={(event) => onValueChange(event.target.value)}><option value="" />{children}</select>,
  SelectTrigger: () => null, SelectValue: () => null,
  SelectContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  SelectItem: ({ value, children }: { value: string; children: ReactNode }) => <option value={value}>{children}</option>,
}));
import Appointments from "../Appointments";

const inDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().split("T")[0];

beforeEach(() => {
  vi.clearAllMocks();
  get.mockImplementation((url: string) => {
    if (url === "/parents/children/") return Promise.resolve({ data: [{ student: { id: "child-1", first_name: "Awa", last_name: "Bah" } }] });
    if (url === "/parents/children-teachers/") return Promise.resolve({ data: [{ id: "teacher-1", first_name: "Moussa", last_name: "Camara" }] });
    if (url === "/parents/appointment-slots/") return Promise.resolve({ data: [{
      id: "slot-1", teacher_id: "teacher-1", teacher: null, date: inDays(7), start_time: "16:00:00", end_time: "16:30:00",
      max_appointments: 1, booked_count: 0, is_available: true, location: "Salle 12",
    }] });
    if (url === "/parents/appointments/") return Promise.resolve({ data: { items: [{
      id: "apt-1", status: "CONFIRMED", appointment_date: inDays(3), start_time: "17:00:00", end_time: "17:30:00",
      location: "https://meet.example.org/abc", slot_id: "slot-0", notes: "Comportement",
      teacher: { id: "teacher-1", first_name: "Moussa", last_name: "Camara" }, parent: null,
      student: { id: "child-1", first_name: "Awa", last_name: "Bah" },
    }], total: 1, page: 1, page_size: 100, pages: 1 } });
    return Promise.reject(new Error(`URL inattendue ${url}`));
  });
  post.mockResolvedValue({ data: {} });
});

function setup() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}><Appointments /></QueryClientProvider>);
}

it("affiche les rendez-vous de la page { items } et annule par la route dédiée", async () => {
  setup();
  expect(await screen.findByText("Moussa Camara")).toBeInTheDocument();
  expect(screen.getByText("Awa Bah")).toBeInTheDocument();
  expect(screen.getByText("appointments.statusConfirmed")).toBeInTheDocument();
  expect(screen.getByText("17:00 - 17:30")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "appointments.online" })).toHaveAttribute("href", "https://meet.example.org/abc");

  fireEvent.click(screen.getByRole("button", { name: /common.cancel/ }));
  await waitFor(() => expect(post).toHaveBeenCalledWith("/parents/appointments/apt-1/cancel/"));
  expect(put).not.toHaveBeenCalled();
  await waitFor(() => expect(success).toHaveBeenCalledWith("appointments.cancelled"));
});

it("réserve en n'envoyant que l'élève, le créneau et les notes", async () => {
  setup();
  await screen.findByText("Moussa Camara");
  fireEvent.click(screen.getAllByRole("button", { name: /appointments.newAppointment/ })[0]);
  const dialog = await screen.findByRole("dialog");
  const [childSelect, teacherSelect] = within(dialog).getAllByRole("combobox");
  fireEvent.change(childSelect, { target: { value: "child-1" } });
  fireEvent.change(teacherSelect, { target: { value: "teacher-1" } });
  await waitFor(() => expect(within(dialog).getAllByRole("combobox")).toHaveLength(3));
  await within(dialog).findByRole("option", { name: /16:00 à 16:30/ });
  fireEvent.change(within(dialog).getAllByRole("combobox")[2], { target: { value: "slot-1" } });
  fireEvent.change(within(dialog).getByPlaceholderText("appointments.subjectPlaceholder"), { target: { value: "Suivi scolaire" } });
  fireEvent.change(within(dialog).getByPlaceholderText("appointments.notesPlaceholder"), { target: { value: "Notes de maths" } });
  fireEvent.click(within(dialog).getByRole("button", { name: "appointments.confirmBtn" }));

  await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
  expect(post).toHaveBeenCalledWith("/parents/appointments/", {
    student_id: "child-1", slot_id: "slot-1", notes: "Suivi scolaire\n\nNotes de maths",
  });
  expect(put).not.toHaveBeenCalled();
  expect(get).toHaveBeenCalledWith("/parents/appointment-slots/", { params: { teacher_id: "teacher-1" } });
});

it("affiche la raison du refus quand le créneau vient d'être pris", async () => {
  post.mockRejectedValueOnce({ response: { data: { detail: "Ce créneau n'est plus disponible" } } });
  setup();
  await screen.findByText("Moussa Camara");
  fireEvent.click(screen.getAllByRole("button", { name: /appointments.newAppointment/ })[0]);
  const dialog = await screen.findByRole("dialog");
  const [childSelect, teacherSelect] = within(dialog).getAllByRole("combobox");
  fireEvent.change(childSelect, { target: { value: "child-1" } });
  fireEvent.change(teacherSelect, { target: { value: "teacher-1" } });
  await within(dialog).findByRole("option", { name: /16:00 à 16:30/ });
  fireEvent.change(within(dialog).getAllByRole("combobox")[2], { target: { value: "slot-1" } });
  fireEvent.click(within(dialog).getByRole("button", { name: "appointments.confirmBtn" }));
  await waitFor(() => expect(error).toHaveBeenCalledWith("appointments.bookingError : Ce créneau n'est plus disponible"));
});
