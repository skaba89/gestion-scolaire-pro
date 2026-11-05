import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

const { state, get } = vi.hoisted(() => ({ state: { tenantId: "a" }, get: vi.fn() }));
vi.mock("@/contexts/TenantContext", () => ({ useTenant: () => ({ tenant: { id: state.tenantId } }) }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "parent-1" } }) }));
vi.mock("@/api/client", () => ({ apiClient: { get } }));
import { useParentData } from "../useParentData";

beforeEach(() => { state.tenantId = "a"; get.mockReset(); });

it("recharge les enfants lorsque l'établissement change pour le même compte", async () => {
  const data = (id: string) => ({ children: [{ student_id: id }], unpaidInvoices: [], upcomingEvents: [],
    notifications: [], unreadMessagesCount: 0, recentGrades: [], attendanceAlerts: [], latestScans: [] });
  get.mockResolvedValueOnce({ data: data("child-a") }).mockResolvedValueOnce({ data: data("child-b") });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  const { result, rerender } = renderHook(() => useParentData(), { wrapper });
  await waitFor(() => expect(result.current.studentIds).toEqual(["child-a"]));
  state.tenantId = "b";
  rerender();
  await waitFor(() => expect(result.current.studentIds).toEqual(["child-b"]));
  expect(get).toHaveBeenCalledTimes(2);
});

it("normalise les enfants plats réellement renvoyés par le tableau de bord", async () => {
  get.mockResolvedValue({ data: { children: [{ student_id: "s1", first_name: "Awa", last_name: "Bah", date_of_birth: "2012-01-01" }],
    unpaidInvoices: [], upcomingEvents: [], notifications: [], unreadMessagesCount: 0, recentGrades: [], attendanceAlerts: [], latestScans: [] } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  const { result } = renderHook(() => useParentData(), { wrapper });
  await waitFor(() => expect(result.current.children[0]?.student.first_name).toBe("Awa"));
  expect(result.current.children[0].student.date_of_birth).toBe("2012-01-01");
  expect(result.current.children[0].first_name).toBe("Awa");
});
