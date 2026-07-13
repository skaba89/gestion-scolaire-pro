import React from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import { ProtectedRoute, getRedirectPathForRoles } from "@/components/ProtectedRoute";
import { TenantRoute } from "@/components/TenantRoute";

const mockNavigate = vi.fn();
const mockUseAuth = vi.fn();
const mockUseTenant = vi.fn();
const mockUsePublicTenant = vi.fn();
const mockSetCurrentTenant = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock("@/contexts/TenantContext", () => ({
  useTenant: () => mockUseTenant(),
}));

vi.mock("@/hooks/usePublicTenant", () => ({
  usePublicTenant: (slug: string | undefined) => mockUsePublicTenant(slug),
}));

vi.mock("@/components/auth/TwoFactorChallenge", () => ({
  TwoFactorChallenge: ({ onSuccess }: { onSuccess: () => void }) => (
    <button onClick={onSuccess}>2FA Challenge</button>
  ),
}));

vi.mock("@/components/ui/skeleton", () => ({
  Skeleton: ({ className }: { className?: string }) => <div data-testid="skeleton" className={className} />,
}));

describe("getRedirectPathForRoles", () => {
  it("returns tenant-aware admin path for admin roles", () => {
    expect(getRedirectPathForRoles(["TENANT_ADMIN"], "lasource")).toBe("/lasource/admin");
  });

  it("returns teacher path for teacher roles", () => {
    expect(getRedirectPathForRoles(["TEACHER"], "isc-paris")).toBe("/isc-paris/teacher");
  });

  it("falls back to root when no business role is found", () => {
    expect(getRedirectPathForRoles([])).toBe("/");
  });
});

describe("ProtectedRoute", () => {
  beforeEach(() => {
    mockNavigate.mockReset();
    mockUseTenant.mockReturnValue({
      tenant: { id: "tenant-1", slug: "lasource" },
      setCurrentTenant: mockSetCurrentTenant,
      isLoading: false,
    });
  });

  it("renders children for an allowed role", () => {
    mockUseAuth.mockReturnValue({
      user: { id: "user-1" },
      isLoading: false,
      roles: ["TEACHER"],
      hasRole: (role: string) => role === "TEACHER",
      mustChangePassword: false,
      tenant: { id: "tenant-1", slug: "lasource" },
      isMfaVerified: true,
    });

    render(
      <MemoryRouter initialEntries={["/lasource/teacher"]}>
        <Routes>
          <Route
            path="/:tenantSlug/teacher"
            element={
              <ProtectedRoute allowedRoles={["TEACHER"]}>
                <div>Teacher dashboard</div>
              </ProtectedRoute>
            }
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText("Teacher dashboard")).toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("redirects unauthenticated users to the tenant auth route", async () => {
    mockUseAuth.mockReturnValue({
      user: null,
      isLoading: false,
      roles: [],
      hasRole: () => false,
      mustChangePassword: false,
      tenant: null,
      isMfaVerified: true,
    });

    render(
      <MemoryRouter initialEntries={["/lasource/admin?tab=overview"]}>
        <Routes>
          <Route
            path="/:tenantSlug/admin"
            element={
              <ProtectedRoute allowedRoles={["TENANT_ADMIN"]}>
                <div>Admin dashboard</div>
              </ProtectedRoute>
            }
          />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith("/lasource/auth", {
        state: { from: "/lasource/admin?tab=overview" },
        replace: true,
      });
    });
  });

  it("renders the MFA challenge when verification is missing", () => {
    mockUseAuth.mockReturnValue({
      user: { id: "user-1" },
      isLoading: false,
      roles: ["TEACHER"],
      hasRole: (role: string) => role === "TEACHER",
      mustChangePassword: false,
      tenant: { id: "tenant-1", slug: "lasource" },
      isMfaVerified: false,
    });

    render(
      <MemoryRouter initialEntries={["/lasource/teacher"]}>
        <Routes>
          <Route
            path="/:tenantSlug/teacher"
            element={
              <ProtectedRoute allowedRoles={["TEACHER"]}>
                <div>Teacher dashboard</div>
              </ProtectedRoute>
            }
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText("2FA Challenge")).toBeInTheDocument();
  });
});

describe("TenantRoute", () => {
  beforeEach(() => {
    mockNavigate.mockReset();
    mockUsePublicTenant.mockReset();
    mockUsePublicTenant.mockReturnValue({ data: undefined, isLoading: false });
    mockSetCurrentTenant.mockReset();
  });

  it("resolves the public tenant by slug and syncs the tenant context", async () => {
    const publicTenant = { id: "tenant-2", slug: "isc-paris" };
    mockUseTenant.mockReturnValue({
      tenant: null,
      setCurrentTenant: mockSetCurrentTenant,
      isLoading: false,
    });
    mockUsePublicTenant.mockReturnValue({ data: publicTenant, isLoading: false });

    render(
      <MemoryRouter initialEntries={["/isc-paris/admin"]}>
        <Routes>
          <Route
            path="/:tenantSlug/admin"
            element={
              <TenantRoute>
                <div>Tenant content</div>
              </TenantRoute>
            }
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(mockUsePublicTenant).toHaveBeenCalledWith("isc-paris");
    await waitFor(() => {
      expect(mockSetCurrentTenant).toHaveBeenCalledWith(publicTenant);
    });
  });

  it("renders children when the tenant slug matches", async () => {
    mockUseTenant.mockReturnValue({
      tenant: { id: "tenant-2", slug: "isc-paris" },
      setCurrentTenant: mockSetCurrentTenant,
      isLoading: false,
    });

    render(
      <MemoryRouter initialEntries={["/isc-paris/admin"]}>
        <Routes>
          <Route
            path="/:tenantSlug/admin"
            element={
              <TenantRoute>
                <div>Tenant content</div>
              </TenantRoute>
            }
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText("Tenant content")).toBeInTheDocument();
  });
});
