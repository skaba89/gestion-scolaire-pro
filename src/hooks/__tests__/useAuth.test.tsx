import type { ReactNode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AuthProvider, useAuth } from "@/contexts/AuthContext";

const { mockApiGet, mockApiPost } = vi.hoisted(() => ({
  mockApiGet: vi.fn(),
  mockApiPost: vi.fn(),
}));

vi.mock("@/api/client", () => ({
  TOKEN_STORAGE_KEY: "schoolflow_access_token",
  apiClient: {
    get: mockApiGet,
    post: mockApiPost,
  },
}));

const profileData = {
  user: {
    id: "user-123",
    email: "test@example.com",
    created_at: "2026-01-01T00:00:00Z",
  },
  profile: {
    first_name: "Ada",
    last_name: "Lovelace",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  },
  roles: ["TEACHER"],
  tenant: {
    id: "tenant-123",
    slug: "academy",
  },
};

function wrapper({ children }: { children: ReactNode }) {
  return (
    <MemoryRouter>
      <AuthProvider>{children}</AuthProvider>
    </MemoryRouter>
  );
}

describe("useAuth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
  });

  it("initializes an anonymous session", async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.user).toBeNull();
    expect(mockApiGet).not.toHaveBeenCalled();
  });

  it("signs in through the API and applies the returned profile", async () => {
    mockApiPost.mockResolvedValueOnce({ data: { access_token: "access-token" } });
    mockApiGet.mockResolvedValueOnce({ data: profileData });
    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      const response = await result.current.signIn("test@example.com", "password");
      expect(response).toEqual({ error: null, profileData });
    });

    const loginBody = mockApiPost.mock.calls[0][1] as URLSearchParams;
    expect(mockApiPost).toHaveBeenCalledWith(
      "/auth/login/",
      expect.any(URLSearchParams),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } },
    );
    expect(loginBody.get("username")).toBe("test@example.com");
    expect(loginBody.get("password")).toBe("password");
    expect(mockApiGet).toHaveBeenCalledWith("/users/me/", undefined);
    expect(localStorage.setItem).toHaveBeenCalledWith(
      "schoolflow_access_token",
      "access-token",
    );
    expect(result.current.user?.id).toBe("user-123");
    expect(result.current.roles).toEqual(["TEACHER"]);
    expect(result.current.tenant?.slug).toBe("academy");
  });

  it("returns the backend authentication error and clears local auth", async () => {
    const apiError = Object.assign(new Error("Request failed"), {
      response: {
        status: 401,
        data: { detail: "Invalid credentials" },
      },
      config: { url: "/auth/login/" },
    });
    mockApiPost.mockRejectedValueOnce(apiError);
    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    localStorage.setItem("schoolflow_access_token", "stale-token");

    await act(async () => {
      const response = await result.current.signIn("test@example.com", "wrong-password");
      expect(response.error?.message).toBe(
        "Invalid credentials (HTTP 401 on /auth/login/)",
      );
    });

    expect(localStorage.removeItem).toHaveBeenCalledWith("schoolflow_access_token");
    expect(result.current.user).toBeNull();
  });

  it("passes the tenant context to login and profile requests", async () => {
    mockApiPost.mockResolvedValueOnce({ data: { access_token: "tenant-token" } });
    mockApiGet.mockResolvedValueOnce({ data: profileData });
    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      const response = await result.current.signIn(
        "test@example.com",
        "password",
        "tenant-123",
      );
      expect(response.error).toBeNull();
    });

    expect(mockApiPost).toHaveBeenCalledWith(
      "/auth/login/",
      expect.any(URLSearchParams),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "X-Tenant-ID": "tenant-123",
        },
      },
    );
    expect(mockApiGet).toHaveBeenCalledWith("/users/me/", {
      headers: { "X-Tenant-ID": "tenant-123" },
    });
    expect(localStorage.setItem).toHaveBeenCalledWith("last_tenant_id", "tenant-123");
  });
});
