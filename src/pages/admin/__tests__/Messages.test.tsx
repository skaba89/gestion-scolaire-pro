import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import i18n from "@/i18n/config";
import MessagesPage from "../Messages";

const get = vi.fn();
const granted = new Set<string>();
vi.mock("@/api/client", () => ({ apiClient: { get: (...a: unknown[]) => get(...a) } }));
vi.mock("@/contexts/TenantContext", () => ({ useTenant: () => ({ tenant: { id: "t1" } }) }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ can: (p: string) => granted.has(p) }) }));
vi.mock("@/components/messages/MessengerInterface", () => ({ MessengerInterface: () => <div>messagerie</div> }));
vi.mock("@/components/messages/WhatsAppThreadsPanel", () => ({ WhatsAppThreadsPanel: () => null }));
vi.mock("@/components/messages/AdminMessageComposer", () => ({ AdminMessageComposer: () => null }));
vi.mock("@/components/messages/ExternalMessageComposer", () => ({ default: () => null }));

beforeAll(async () => {
  await i18n.changeLanguage("fr");
});

beforeEach(() => {
  get.mockReset();
  get.mockResolvedValue({ data: [] });
  granted.clear();
});

function renderPage() {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MessagesPage />
    </QueryClientProvider>,
  );
}

describe("Admin messages page", () => {
  it("loads recipients from the restricted route (no users:read needed)", async () => {
    renderPage();
    await screen.findByText("messagerie");
    expect(get).toHaveBeenCalledWith("/communication/messaging/recipients/");
  });

  it("hides the external e-mail tab without users:read (accountant)", () => {
    renderPage();
    expect(screen.getAllByRole("tab")).toHaveLength(3);
  });

  it("shows the external e-mail tab with users:read", () => {
    granted.add("users:read");
    renderPage();
    expect(screen.getAllByRole("tab")).toHaveLength(4);
  });
});
