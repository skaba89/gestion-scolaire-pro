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

it("recherche sur toutes les pages et exporte les mouvements filtrés avec leur source", async () => {
  const movements = Array.from({ length: 42 }, (_, i) => ({
    id: String(i), student_id: String(i), checked_at: "2026-11-02T08:24:00Z",
    student: { first_name: "Aïcha", last_name: i > 39 ? '=Nom;"Test"' : "Camara", registration_number: `MAT-${i}` },
    check_in_type: i === 41 ? null : i % 2 === 0 ? "EXIT" : "ENTRY",
    source: i === 41 ? null : "CARD",
  }));
  get.mockResolvedValue({ data: movements });
  render(<QueryClientProvider client={new QueryClient()}><CheckInHistory tenantId="a" userId="u" /></QueryClientProvider>);
  expect(await screen.findByText("1-10 sur 42")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Suivant" }));
  expect(screen.getByText("11-20 sur 42")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Précédent" }));
  fireEvent.click(screen.getByRole("button", { name: "5" }));
  expect(screen.getByText("41-42 sur 42")).toBeInTheDocument();
  // Radix recentre l’option lors de l’ouverture ; jsdom ne gère pas le défilement.
  const scroll = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollIntoView");
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: vi.fn() });
  try {
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "ArrowDown" });
    fireEvent.keyDown(await screen.findByRole("option", { name: "20" }), { key: "Enter" });
  } finally {
    if (scroll) Object.defineProperty(HTMLElement.prototype, "scrollIntoView", scroll);
    else Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
  }
  expect(screen.getByText("1-20 sur 42")).toBeInTheDocument();
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "mat-41" } });
  expect(screen.getByText("1-1 sur 1")).toBeInTheDocument();
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "=nom" } });
  expect(screen.getByText("1-2 sur 2")).toBeInTheDocument();
  const createURL = vi.fn((_file: Blob) => "blob:history");
  const revokeURL = vi.fn();
  const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  vi.stubGlobal("URL", class extends URL { static createObjectURL = createURL; static revokeObjectURL = revokeURL; });
  try {
    fireEvent.click(screen.getByRole("button", { name: "CSV" }));
    const reader = new FileReader();
    const content = new Promise<string>((resolve, reject) => {
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = reject;
    });
    reader.readAsText(createURL.mock.calls[0][0]);
    const lines = (await content).trim().split("\r\n");
    expect(lines).toHaveLength(3);
    expect(lines[1]).toContain(`"'=Nom;""Test""";"Aïcha";"MAT-40";"Sortie";"CARD"`);
    expect(lines[2]).toContain('"MAT-41";"—";"—"');
    expect(click).toHaveBeenCalledOnce();
    expect(revokeURL).toHaveBeenCalledWith("blob:history");
  } finally {
    click.mockRestore();
    vi.unstubAllGlobals();
  }
});
