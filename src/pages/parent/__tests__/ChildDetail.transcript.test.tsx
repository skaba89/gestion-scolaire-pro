import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, expect, it, vi } from "vitest";

const { get, getStudentEnrollment, generateTranscript, success, error, createUrl, revokeUrl, click } = vi.hoisted(() => ({
  get: vi.fn(), getStudentEnrollment: vi.fn(), generateTranscript: vi.fn(), success: vi.fn(), error: vi.fn(),
  createUrl: vi.fn(), revokeUrl: vi.fn(), click: vi.fn(),
}));
vi.mock("@/api/client", () => ({ apiClient: { get } }));
vi.mock("@/features/parents/services/parentsService", () => ({ parentsService: {
  getStudentDetails: vi.fn().mockResolvedValue({ id: "s1", first_name: "Awa", last_name: "Bah" }),
  getStudentEnrollment,
  getStudentAllGradesDetailed: vi.fn().mockResolvedValue([]),
  getStudentAllEnrollments: vi.fn().mockResolvedValue([]),
  getStudentAllAttendance: vi.fn().mockResolvedValue([]),
  getChildCheckInHistory: vi.fn().mockResolvedValue([]),
  generateTranscript,
} }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "parent-1" } }) }));
vi.mock("@/contexts/TenantContext", () => ({ useTenant: () => ({ tenant: { id: "tenant-1" } }) }));
vi.mock("react-router-dom", () => ({
  useParams: () => ({ studentId: "s1" }),
  Link: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("sonner", () => ({ toast: { success, error } }));
vi.mock("@/hooks/useTenantUrl", () => ({ useTenantUrl: () => ({ getTenantUrl: (path: string) => path }) }));
vi.mock("@/components/student/StudentDigitalBadge", () => ({ StudentDigitalBadge: () => null }));
vi.mock("@/components/attendance/CheckInHistoryList", () => ({ CheckInHistoryList: () => null }));
vi.mock("@/components/ui/tabs", () => ({
  Tabs: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TabsList: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TabsTrigger: ({ children }: { children: React.ReactNode }) => <button>{children}</button>,
  TabsContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  AreaChart: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Area: () => null, XAxis: () => null, YAxis: () => null, CartesianGrid: () => null, Tooltip: () => null,
  LineChart: ({ children }: { children: React.ReactNode }) => <>{children}</>, Line: () => null,
}));

import ChildDetail from "../ChildDetail";

beforeEach(() => {
  vi.clearAllMocks();
  get.mockResolvedValue({ data: [{ id: "relation-1", student_id: "s1" }] });
  getStudentEnrollment.mockResolvedValue(null);
  generateTranscript.mockResolvedValue(new Blob(["%PDF-transcript"], { type: "application/pdf" }));
  createUrl.mockReturnValue("blob:transcript");
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createUrl });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revokeUrl });
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(click);
});

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><ChildDetail /></QueryClientProvider>);
}

async function openReports() {
  return screen.findByRole("button", { name: "childDetail.downloadRecord" });
}

it("télécharge le relevé PDF calculé par le serveur sans envoyer de notes locales", async () => {
  setup();
  const button = await openReports();
  fireEvent.click(button);
  await waitFor(() => expect(generateTranscript).toHaveBeenCalledExactlyOnceWith("s1"));
  expect(createUrl).toHaveBeenCalled();
  expect(click).toHaveBeenCalled();
  expect(revokeUrl).toHaveBeenCalledWith("blob:transcript");
  expect(success).toHaveBeenCalled();
});

it("n'annonce pas de succès lorsque le serveur refuse le relevé", async () => {
  generateTranscript.mockRejectedValue(new Error("HTTP 403"));
  setup();
  fireEvent.click(await openReports());
  await waitFor(() => expect(error).toHaveBeenCalled());
  expect(success).not.toHaveBeenCalled();
  expect(createUrl).not.toHaveBeenCalled();
});

it("affiche l'indisponibilité de l'inscription au lieu de la masquer", async () => {
  getStudentEnrollment.mockRejectedValue(new Error("HTTP 503"));
  setup();
  expect(await screen.findByRole("alert")).toHaveTextContent("common.error");
});
