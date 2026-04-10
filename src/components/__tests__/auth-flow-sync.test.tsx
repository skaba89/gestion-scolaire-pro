import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import Auth from "@/pages/Auth";
import { AuthSyncProvider } from "@/components/providers/AuthSyncProvider";

const mockNavigate = vi.fn();
const mockToast = vi.fn();
const mockSignIn = vi.fn();
const mockUseAuth = vi.fn();
const mockUseTenant = vi.fn();
const mockSyncAuth = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: mockToast }),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock("@/contexts/TenantContext", () => ({
  useTenant: () => mockUseTenant(),
}));

vi.mock("@/components/LanguageSwitcher", () => ({
  LanguageSwitcher: () => <div>LanguageSwitcher</div>,
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
}));

vi.mock("lucide-react", () => ({
  GraduationCap: () => <span>GraduationCap</span>,
  Shield: () => <span>Shield</span>,
}));

vi.mock("@/stores", () => ({
  useAppStore: () => ({
    syncAuth: mockSyncAuth,
  }),
}));

describe("Auth page tenant-aware redirects", () => {
  beforeEach(() => {
    mockNavigate.mockReset();
    mockToast.mockReset();
    mockSignIn.mockReset();
    sessionStorage.clear();
  });

  it("redirige un utilisateur authentifié vers le chemin demandé", async () => {
    mockUseAuth.mockReturnValue({
      signIn: mockSignIn,
      user: { id: "user-1", email: "admin@example.com" },
      roles: ["TENANT_ADMIN"],
      isLoading: false,
    });
    mockUseTenant.mockReturnValue({
      tenant: { id: "tenant-1", slug: "lasource" },
      isLoading: false,
    });

    render(
      <MemoryRouter initialEntries={[{ pathname: "/auth", state: { from: "/lasource/admin?tab=dashboard" } }]}>
        <Auth />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith("/lasource/admin?tab=dashboard", { replace: true });
    });
  });

  it("préserve le chemin demandé avant de lancer la connexion", async () => {
    mockUseAuth.mockReturnValue({
      signIn: mockSignIn.mockResolvedValue({ error: null }),
      user: null,
      roles: [],
      isLoading: false,
    });
    mockUseTenant.mockReturnValue({
      tenant: null,
      isLoading: false,
    });

    render(
      <MemoryRouter initialEntries={[{ pathname: "/auth", state: { from: "/isc-paris/teacher" } }]}>
        <Auth />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: /Connexion Institutionnelle/i }));

    await waitFor(() => {
      expect(sessionStorage.getItem("schoolflow:return_to")).toBe("/isc-paris/teacher");
      expect(mockSignIn).toHaveBeenCalled();
    });
  });
});

describe("AuthSyncProvider", () => {
  beforeEach(() => {
    mockSyncAuth.mockReset();
  });

  it("synchronise le store avec les bons champs utilisateur et permissions", async () => {
    mockUseAuth.mockReturnValue({
      user: { id: "user-1", email: "teacher@example.com" },
      profile: {
        id: "profile-1",
        tenant_id: "tenant-1",
        email: "teacher@example.com",
        first_name: "Ada",
        last_name: "Lovelace",
        avatar_url: "https://example.com/avatar.png",
        is_current: true,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
      },
      tenant: {
        id: "tenant-1",
        name: "La Source",
        slug: "lasource",
        logo_url: "https://example.com/logo.png",
        type: "SCHOOL",
        is_active: true,
        settings: {},
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
      },
      isLoading: false,
      roles: ["TEACHER", "STAFF"],
    });

    render(
      <AuthSyncProvider>
        <div>Contenu</div>
      </AuthSyncProvider>,
    );

    await waitFor(() => {
      expect(mockSyncAuth).toHaveBeenCalledWith(
        expect.objectContaining({
          user: expect.objectContaining({
            first_name: "Ada",
            last_name: "Lovelace",
            avatar_url: "https://example.com/avatar.png",
          }),
          currentTenant: expect.objectContaining({
            slug: "lasource",
            logo_url: "https://example.com/logo.png",
          }),
          isAuthenticated: true,
          isLoading: false,
          permissions: expect.arrayContaining([
            expect.objectContaining({ role: "TEACHER", tenant_id: "tenant-1", user_id: "user-1" }),
            expect.objectContaining({ role: "STAFF", tenant_id: "tenant-1", user_id: "user-1" }),
          ]),
        }),
      );
    });
  });
});
