import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, expect, it, vi } from "vitest";

/**
 * Rendez-vous côté enseignant (2026-11-11). Avant : création de créneau avec
 * `slot_date` (refusée, le serveur attend `date`), « Générer semaine » vers
 * une route absente, confirmation par une route absente avec un statut en
 * minuscules, et liste filtrée sur des statuts que le serveur n'emploie pas.
 */

const { get, post, patch, del, success, error } = vi.hoisted(() => ({
  get: vi.fn(), post: vi.fn(), patch: vi.fn(), del: vi.fn(), success: vi.fn(), error: vi.fn(),
}));
vi.mock("@/api/client", () => ({ apiClient: { get, post, patch, delete: del } }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "teacher-1" } }) }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("sonner", () => ({ toast: { success, error } }));
import AppointmentSlots from "../AppointmentSlots";

const inDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().split("T")[0];

beforeEach(() => {
  vi.clearAllMocks();
  get.mockImplementation((url: string) => {
    if (url === "/school-life/appointment-slots/") return Promise.resolve({ data: { items: [
      { id: "slot-free", teacher_id: "teacher-1", teacher: null, date: inDays(7), start_time: "16:00:00", end_time: "16:30:00",
        max_appointments: 1, booked_count: 0, is_available: true, location: "Salle 12" },
      { id: "slot-taken", teacher_id: "teacher-1", teacher: null, date: inDays(7), start_time: "17:00:00", end_time: "17:30:00",
        max_appointments: 1, booked_count: 1, is_available: false, location: null },
    ], total: 2, page: 1, page_size: 200 } });
    if (url === "/school-life/appointment-slots/appointments/") return Promise.resolve({ data: [{
      id: "apt-1", status: "REQUESTED", appointment_date: inDays(7), start_time: "17:00:00", end_time: "17:30:00",
      location: null, slot_id: "slot-taken", notes: "Suivi scolaire",
      teacher: { id: "teacher-1", first_name: "Moussa", last_name: "Camara" },
      parent: { id: "parent-1", first_name: "Fanta", last_name: "Diallo" },
      student: { id: "child-1", first_name: "Awa", last_name: "Bah" },
    }] });
    return Promise.reject(new Error(`URL inattendue ${url}`));
  });
  post.mockResolvedValue({ data: {} });
  patch.mockResolvedValue({ data: {} });
});

function setup() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}><AppointmentSlots /></QueryClientProvider>);
}

it("lit les créneaux par `date` avec la disponibilité calculée par le serveur", async () => {
  setup();
  expect(await screen.findByText("16:00 - 16:30")).toBeInTheDocument();
  expect(screen.getByText("Salle 12")).toBeInTheDocument();
  expect(screen.getByText("appointments.booked")).toBeInTheDocument(); // créneau de 17 h pris
  expect(get).toHaveBeenCalledWith("/school-life/appointment-slots/appointments/", {
    params: expect.objectContaining({ status: "REQUESTED,CONFIRMED" }),
  });
});

it("génère la semaine par la route bulk avec le champ `date`", async () => {
  setup();
  await screen.findByText("16:00 - 16:30");
  fireEvent.click(screen.getByRole("button", { name: "appointments.generateWeek" }));
  await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
  const [url, body] = post.mock.calls[0];
  expect(url).toBe("/school-life/appointment-slots/bulk/");
  expect(body.slots).toHaveLength(15);
  expect(Object.keys(body.slots[0]).sort()).toEqual(["date", "end_time", "start_time"]);
});

it("confirme un rendez-vous avec le statut du serveur", async () => {
  setup();
  fireEvent.mouseDown(await screen.findByRole("tab", { name: /appointments.bookedAppointments/ }));
  fireEvent.click(screen.getByRole("tab", { name: /appointments.bookedAppointments/ }));
  expect(await screen.findByText("Fanta Diallo")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /appointments.confirm/ }));
  await waitFor(() => expect(patch).toHaveBeenCalledWith(
    "/school-life/appointment-slots/appointments/apt-1/", { status: "CONFIRMED" },
  ));
});
