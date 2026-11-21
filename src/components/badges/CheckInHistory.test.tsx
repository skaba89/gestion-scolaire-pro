import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { addDays, startOfDay } from "date-fns";
import { beforeEach, expect, it, vi } from "vitest";
import CheckInHistory from "./CheckInHistory";

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@/api/client", () => ({ apiClient: { get } }));
vi.mock("@/hooks/useStudentLabel", () => ({ useStudentLabel: () => ({ StudentLabel: "Élève", studentsLabel: "élèves" }) }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

vi.mock("@/components/ui/calendar", () => ({
  Calendar: ({ onSelect }: { onSelect: (day: Date) => void }) =>
    <button onClick={() => onSelect(new Date(2024, 2, 31))}>Choisir le 31 mars</button>,
}));

beforeEach(() => get.mockReset());

it("charge la journée civile entière et écarte les lignes du compte précédent", async () => {
  const client = new QueryClient();
  function panel(userId: string) {
    return <QueryClientProvider client={client}><CheckInHistory tenantId="school" userId={userId} /></QueryClientProvider>;
  }
  const day = startOfDay(new Date());
  get.mockResolvedValueOnce({ data: [{ id: "1", student_id: "s", student: { first_name: "Aïcha", last_name: "Camara" },
    check_in_type: "ENTRY", checked_at: day.toISOString(), source: "MANUAL" }] });
  const view = render(panel("a"));
  expect(await screen.findByText("Aïcha Camara")).toBeInTheDocument();
  expect(get).toHaveBeenCalledWith("/student-check-ins/", expect.objectContaining({ params: expect.objectContaining({
    tenant_id: "school", checked_at_gte: day.toISOString(), checked_at_lt: addDays(day, 1).toISOString(), complete_day: true,
  }) }));
  get.mockRejectedValueOnce(new Error("indisponible"));
  view.rerender(panel("b"));
  expect(screen.queryByText("Aïcha Camara")).toBeNull();
  expect(await screen.findByRole("alert")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "CSV" })).toBeDisabled();
  expect(screen.queryByText("Aucun pointage pour cette date")).toBeNull();
  get.mockResolvedValueOnce({ data: [] });
  fireEvent.click(screen.getByRole("button", { name: "badges.historyRetry" }));
  expect(await screen.findByText("Aucun pointage pour cette date")).toBeInTheDocument();
});

it("relance la lecture au changement de date ou d’établissement", async () => {
  const client = new QueryClient();
  function panel(tenantId: string) {
    return <QueryClientProvider client={client}><CheckInHistory tenantId={tenantId} userId="a" /></QueryClientProvider>;
  }
  get.mockResolvedValue({ data: [] });
  const view = render(panel("école A"));
  await screen.findByText("Aucun pointage pour cette date");
  fireEvent.click(screen.getByRole("button", { expanded: false }));
  fireEvent.click(await screen.findByText("Choisir le 31 mars"));
  const params = {
    checked_at_gte: new Date(2024, 2, 31).toISOString(),
    checked_at_lt: new Date(2024, 3, 1).toISOString(),
    complete_day: true,
  };
  await waitFor(() => expect(get).toHaveBeenCalledWith("/student-check-ins/", expect.objectContaining({
    params: { ...params, tenant_id: "école A" },
  })));
  view.rerender(panel("école B"));
  await waitFor(() => expect(get).toHaveBeenCalledWith("/student-check-ins/", expect.objectContaining({
    params: { ...params, tenant_id: "école B" },
  })));
});
