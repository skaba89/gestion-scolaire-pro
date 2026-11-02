import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AxiosError, AxiosHeaders } from "axios";

import i18n from "@/i18n/config";
import SecuritySessions from "@/pages/admin/SecuritySessions";
import { getActiveSessions, terminateSession, toAuthEvent } from "@/hooks/useLoginTracking";

const mockGet = vi.fn();
const mockDelete = vi.fn();
const mockToast = vi.fn();

vi.mock("@/api/client", () => {
  const client = {
    get: (...args: unknown[]) => mockGet(...args),
    delete: (...args: unknown[]) => mockDelete(...args),
  };
  return { apiClient: client, default: client };
});

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: mockToast }),
}));

// recharts mesure le conteneur : sans dimensions en jsdom il ne rend rien
// d'utile ; le graphique n'est pas l'objet de ces tests.
vi.mock("recharts", async () => {
  const actual = await vi.importActual<typeof import("recharts")>("recharts");
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  };
});

const NOW = new Date().toISOString();

const SESSIONS = [
  {
    id: "sid-current",
    user_id: "u1",
    browser: "Chrome",
    os: "Windows",
    device_type: "desktop",
    ip_address: "196.200.1.10",
    created_at: NOW,
    last_activity_at: NOW,
    is_current: true,
  },
  {
    id: "sid-lost-phone",
    user_id: "u1",
    browser: "Chrome",
    os: "Android",
    device_type: "mobile",
    ip_address: "41.223.5.6",
    created_at: NOW,
    last_activity_at: NOW,
    is_current: false,
  },
];

const HISTORY = [
  {
    id: "a1",
    action: "LOGIN_SUCCESS",
    created_at: NOW,
    user_id: "u1",
    resource_id: "u1",
    ip_address: "196.200.1.10",
    user_agent: "Mozilla/5.0 (Windows NT 10.0) Chrome/130.0 Safari/537.36",
    severity: "INFO",
    details: { login: "directrice@ecole.gn", session_id: "sid-current" },
  },
  {
    id: "a2",
    action: "LOGIN_FAILED",
    created_at: NOW,
    user_id: "u2",
    resource_id: "u2",
    ip_address: "41.223.5.6",
    user_agent: null,
    severity: "WARNING",
    details: '{"login": "comptable@ecole.gn", "reason": "invalid_password"}',
  },
];

function forbidden(): AxiosError {
  const headers = new AxiosHeaders();
  return new AxiosError("Forbidden", "ERR_BAD_REQUEST", { headers }, undefined, {
    status: 403,
    statusText: "Forbidden",
    headers: {},
    config: { headers },
    data: {},
  });
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <SecuritySessions />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mockGet.mockReset();
  mockDelete.mockReset();
  mockToast.mockReset();
  mockGet.mockImplementation((url: string) => {
    if (url === "/auth/sessions/") return Promise.resolve({ data: SESSIONS });
    if (url === "/audit/") return Promise.resolve({ data: HISTORY });
    return Promise.reject(new Error(`unexpected ${url}`));
  });
});

afterEach(async () => {
  await i18n.changeLanguage("fr");
});

describe("Sécurité & sessions — sessions réelles", () => {
  it("liste les sessions renvoyées par le serveur et signale l'appareil courant", async () => {
    renderPage();
    expect(await screen.findByText("Chrome sur Android")).toBeInTheDocument();
    expect(screen.getByText("Chrome sur Windows")).toBeInTheDocument();
    expect(screen.getByText("Cet appareil")).toBeInTheDocument();
    // L'appareil courant ne propose pas de bouton « Déconnecter ».
    expect(screen.getAllByRole("button", { name: "Déconnecter" })).toHaveLength(1);
  });

  it("révoque via DELETE /auth/sessions/{id}/ puis confirme", async () => {
    mockDelete.mockResolvedValue({ data: { message: "Session révoquée" } });
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Déconnecter" }));
    await waitFor(() => expect(mockDelete).toHaveBeenCalledWith("/auth/sessions/sid-lost-phone/"));
    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: "Session déconnectée" })),
    );
  });

  it("n'annonce jamais un succès quand le serveur refuse la révocation", async () => {
    mockDelete.mockRejectedValue(new Error("503"));
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Déconnecter" }));
    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive" })),
    );
    expect(mockToast).not.toHaveBeenCalledWith(expect.objectContaining({ title: "Session déconnectée" }));
  });

  it("demande confirmation avant de déconnecter les autres appareils", async () => {
    mockDelete.mockResolvedValue({ data: {} });
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Déconnecter les autres appareils" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(mockDelete).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Déconnecter" }));
    await waitFor(() => expect(mockDelete).toHaveBeenCalledTimes(1));
    expect(mockDelete).toHaveBeenCalledWith("/auth/sessions/sid-lost-phone/");
  });

  it("affiche une erreur — pas « aucune session » — si le registre est indisponible", async () => {
    mockGet.mockImplementation((url: string) =>
      url === "/auth/sessions/" ? Promise.reject(new Error("503")) : Promise.resolve({ data: HISTORY }),
    );
    renderPage();
    expect(await screen.findByText(/Impossible de charger les sessions/)).toBeInTheDocument();
    expect(screen.queryByText("Aucune session active")).not.toBeInTheDocument();
  });
});

describe("Sécurité & sessions — historique serveur", () => {
  it("lit GET /audit/?resource_type=AUTH (tableau) et affiche les événements", async () => {
    renderPage();
    fireEvent.mouseDown(await screen.findByRole("tab", { name: "Historique des connexions" }));
    expect(await screen.findByText("directrice@ecole.gn")).toBeInTheDocument();
    expect(screen.getByText("comptable@ecole.gn")).toBeInTheDocument();
    expect(screen.getByText("Échec de connexion")).toBeInTheDocument();
    expect(mockGet).toHaveBeenCalledWith("/audit/", { params: { resource_type: "AUTH", page_size: 100 } });
  });

  it("explique un refus de permission au lieu d'un historique vide", async () => {
    mockGet.mockImplementation((url: string) =>
      url === "/audit/" ? Promise.reject(forbidden()) : Promise.resolve({ data: SESSIONS }),
    );
    renderPage();
    fireEvent.mouseDown(await screen.findByRole("tab", { name: "Historique des connexions" }));
    expect(await screen.findByText(/Votre rôle ne permet pas/)).toBeInTheDocument();
  });

  it("s'affiche en anglais", async () => {
    await i18n.changeLanguage("en");
    renderPage();
    expect(await screen.findByText("Security & sessions")).toBeInTheDocument();
    expect(await screen.findByText("This device")).toBeInTheDocument();
  });
});

describe("useLoginTracking — plus aucun résultat simulé", () => {
  it("getActiveSessions propage l'erreur du serveur", async () => {
    mockGet.mockRejectedValue(new Error("boom"));
    await expect(getActiveSessions()).rejects.toThrow("boom");
  });

  it("terminateSession rejette quand le serveur refuse", async () => {
    mockDelete.mockRejectedValue(new Error("404"));
    await expect(terminateSession("x")).rejects.toThrow("404");
  });

  it("toAuthEvent lit les détails JSON (objet ou chaîne)", () => {
    const ok = toAuthEvent(HISTORY[0]);
    expect(ok).toMatchObject({ success: true, failure: false, login: "directrice@ecole.gn", browser: "Chrome", os: "Windows" });
    const ko = toAuthEvent(HISTORY[1]);
    expect(ko).toMatchObject({ success: false, failure: true, login: "comptable@ecole.gn", browser: null });
  });
});
