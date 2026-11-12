import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import i18n from "@/i18n/config";
import ClassLists from "../ClassLists";
import EnrollmentStats from "../EnrollmentStats";
import Certificates from "../Certificates";

/** AUD-ROUTES (2026-11-12) : pages rebranchées sur des routes existantes. */
const get = vi.fn();
vi.mock("@/api/client", () => ({ apiClient: { get: (...a: unknown[]) => get(...a), post: vi.fn() } }));
vi.mock("@/contexts/TenantContext", () => ({ useTenant: () => ({ tenant: { id: "t1", type: "secondary", settings: {} } }) }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "u1" }, tenant: { id: "t1" } }) }));

const NONEXISTENT = /^\/(students\/(classes|academic-years|class-departments|enrollments|grades|term-results)|admissions\/(enrollments|applications))\//;

const DATA: Record<string, unknown> = {
  "/infrastructure/classrooms/": [{ id: "c1", name: "6e A", level_id: "l1", campus_id: null, capacity: 40 }],
  "/levels/": [{ id: "l1", name: "6ème" }],
  "/campuses/": [],
  "/departments/": [],
  "/academic-years/": [{ id: "y1", name: "2026-2027", start_date: "2026-09-01", is_current: true }],
  "/enrollments/": [{ id: "e1", student_id: "s1", class_id: "c1", academic_year_id: "y1", status: "ACTIVE",
    student: { id: "s1", first_name: "Aïssatou", last_name: "Diallo", registration_number: "ULS-001" } }],
  "/admissions/stats/": { SUBMITTED: 2, UNDER_REVIEW: 1, ACCEPTED: 3, REJECTED: 1, CONVERTED_TO_STUDENT: 1, DRAFT: 0, total: 8 },
};

beforeAll(async () => {
  await i18n.changeLanguage("fr");
});

beforeEach(() => {
  get.mockReset();
  get.mockImplementation((url: string, config?: { params?: Record<string, unknown> }) => {
    if (url === "/students/") {
      const page = Number(config?.params?.page ?? 1);
      const items = page === 1
        ? Array.from({ length: 100 }, (_, i) => ({ id: `s${i}`, status: "ACTIVE", gender: "FEMALE" }))
        : [{ id: "s100", status: "ACTIVE", gender: "MALE" }, { id: "s101", status: "ARCHIVED", gender: "MALE" }];
      return Promise.resolve({ data: { items, total: 102, page, page_size: 100, pages: 2 } });
    }
    return Promise.resolve({ data: DATA[url] ?? [] });
  });
});

function renderPage(node: JSX.Element) {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>{node}</MemoryRouter>
    </QueryClientProvider>,
  );
}

const calledUrls = () => get.mock.calls.map((c) => c[0] as string);

describe("pages rebranchées (AUD-ROUTES)", () => {
  it("Listes de classe : classe, niveau et élèves depuis /enrollments/", async () => {
    renderPage(<ClassLists />);
    expect(await screen.findByText(/Diallo/)).toBeInTheDocument();
    expect(screen.getByText("6ème")).toBeInTheDocument();
    expect(get).toHaveBeenCalledWith("/enrollments/", { params: { status: "ACTIVE", class_ids: "c1" } });
    expect(calledUrls().filter((u) => NONEXISTENT.test(u))).toEqual([]);
  });

  it("Statistiques : tous les élèves (2 pages) et candidatures du serveur", async () => {
    renderPage(<EnrollmentStats />);
    await waitFor(() => expect(get).toHaveBeenCalledWith("/admissions/stats/", { params: {} }));
    await waitFor(() => expect(calledUrls().filter((u) => u === "/students/")).toHaveLength(2));
    expect(calledUrls().filter((u) => NONEXISTENT.test(u))).toEqual([]);
  });

  it("Certificats : classes et année en cours sur les routes réelles", async () => {
    renderPage(<Certificates />);
    await waitFor(() => expect(calledUrls()).toEqual(expect.arrayContaining(
      ["/infrastructure/classrooms/", "/levels/", "/academic-years/"])));
    expect(calledUrls().filter((u) => NONEXISTENT.test(u))).toEqual([]);
  });
});
