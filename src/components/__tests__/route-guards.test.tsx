import React from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import { ProtectedRoute, getRedirectPathForRoles } from "@/components/ProtectedRoute";
import { TenantRoute } from "@/components/TenantRoute";

const mockNavigate = vi.fn();
const mockUseAuth = vi.fn();
const mockUseTenant = vi.fn();
const mockFetchTenantBySlug = vi.fn();

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
    mockFetchTenantBySlug.mockReset();
    mockUseTenant.mockReturnValue({
      tenant: { id: "tenant-1", slug: "lasource" },
      fetchTenantBySlug: mockFetchTenantBySlug,
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

  it("redirects unauthenticated users to /auth", async () => {
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
      expect(mockNavigate).toHaveBeenCalledWith("/auth", {
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
  });

  it("fetches tenant by slug when tenant is not loaded", () => {
    mockUseTenant.mockReturnValue({
      tenant: null,
      fetchTenantBySlug: mockFetchTenantBySlug,
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

    expect(mockFetchTenantBySlug).toHaveBeenCalledWith("isc-paris");
  });

  it("renders children when the tenant slug matches", () => {
    mockUseTenant.mockReturnValue({
      tenant: { id: "tenant-2", slug: "isc-paris" },
      fetchTenantBySlug: mockFetchTenantBySlug,
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

    expect(screen.getByText("Tenant content")).toBeInTheDocument();
  });
});
