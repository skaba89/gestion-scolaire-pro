/**
 * Tests for User Store (Zustand)
 */

import { describe, it, expect, beforeEach } from "vitest";
import { useUserStore, type UserProfile } from "@/stores/userStore";

describe("User Store", () => {
  beforeEach(() => {
    // Reset store before each test
    useUserStore.setState({
      user: null,
      roles: [],
      isAuthenticated: false,
      isLoading: false,
      error: undefined,
    });
  });

  describe("setUser", () => {
    it("should set user profile", () => {
      const mockUser: UserProfile = {
        id: "user-123",
        email: "john@example.com",
        first_name: "John",
        last_name: "Doe",
        tenant_id: "tenant-1",
        is_active: true,
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
      };

      useUserStore.setState({ user: mockUser });
      const { user } = useUserStore.getState();

      expect(user).toEqual(mockUser);
      expect(user?.email).toBe("john@example.com");
    });

    it("should clear user when set to null", () => {
      useUserStore.setState({
        user: {
          id: "user-123",
          email: "john@example.com",
          first_name: "John",
          last_name: "Doe",
          tenant_id: "tenant-1",
          is_active: true,
          created_at: "2024-01-01T00:00:00Z",
          updated_at: "2024-01-01T00:00:00Z",
        },
      });

      useUserStore.getState().setUser(null);
      const { user } = useUserStore.getState();

      expect(user).toBeNull();
    });
  });

  describe("setRoles", () => {
    it("should set user roles", () => {
      useUserStore.getState().setRoles(["TEACHER", "DIRECTOR"]);
      const { roles } = useUserStore.getState();

      expect(roles).toEqual(["TEACHER", "DIRECTOR"]);
      expect(roles.length).toBe(2);
    });

    it("should allow empty roles array", () => {
      useUserStore.getState().setRoles([]);
      const { roles } = useUserStore.getState();

      expect(roles).toEqual([]);
    });
  });

  describe("hasRole", () => {
    it("should return true if user has role", () => {
      useUserStore.getState().setRoles(["TEACHER", "DIRECTOR"]);
      const hasTeacher = useUserStore.getState().hasRole("TEACHER");

      expect(hasTeacher).toBe(true);
    });

    it("should return false if user does not have role", () => {
      useUserStore.getState().setRoles(["TEACHER"]);
      const hasAdmin = useUserStore.getState().hasRole("SUPER_ADMIN");

      expect(hasAdmin).toBe(false);
    });
  });

  describe("isAdmin", () => {
    it("should return true for SUPER_ADMIN", () => {
      useUserStore.getState().setRoles(["SUPER_ADMIN"]);
      const isAdmin = useUserStore.getState().isAdmin();

      expect(isAdmin).toBe(true);
    });

    it("should return true for TENANT_ADMIN", () => {
      useUserStore.getState().setRoles(["TENANT_ADMIN"]);
      const isAdmin = useUserStore.getState().isAdmin();

      expect(isAdmin).toBe(true);
    });

    it("should return false for non-admin roles", () => {
      useUserStore.getState().setRoles(["TEACHER"]);
      const isAdmin = useUserStore.getState().isAdmin();

      expect(isAdmin).toBe(false);
    });
  });

  describe("getFullName", () => {
    it("should return full name when user exists", () => {
      useUserStore.setState({
        user: {
          id: "user-123",
          email: "john@example.com",
          first_name: "John",
          last_name: "Doe",
          tenant_id: "tenant-1",
          is_active: true,
          created_at: "2024-01-01T00:00:00Z",
          updated_at: "2024-01-01T00:00:00Z",
        },
      });

      const fullName = useUserStore.getState().getFullName();

      expect(fullName).toBe("John Doe");
    });

    it("should return empty string when user is null", () => {
      useUserStore.setState({ user: null });
      const fullName = useUserStore.getState().getFullName();

      expect(fullName).toBe("");
    });
  });

  describe("updateProfile", () => {
    it("should update user profile fields", () => {
      useUserStore.setState({
        user: {
          id: "user-123",
          email: "john@example.com",
          first_name: "John",
          last_name: "Doe",
          tenant_id: "tenant-1",
          is_active: true,
          created_at: "2024-01-01T00:00:00Z",
          updated_at: "2024-01-01T00:00:00Z",
        },
      });

      useUserStore.getState().updateProfile({
        first_name: "Johnny",
        phone: "555-1234",
      });

      const { user } = useUserStore.getState();

      expect(user?.first_name).toBe("Johnny");
      expect(user?.phone).toBe("555-1234");
      expect(user?.email).toBe("john@example.com"); // Unchanged
    });
  });

  describe("logout", () => {
    it("should clear all user data on logout", () => {
      useUserStore.setState({
        user: {
          id: "user-123",
          email: "john@example.com",
          first_name: "John",
          last_name: "Doe",
          tenant_id: "tenant-1",
          is_active: true,
          created_at: "2024-01-01T00:00:00Z",
          updated_at: "2024-01-01T00:00:00Z",
        },
        roles: ["TEACHER"],
        isAuthenticated: true,
      });

      useUserStore.getState().logout();
      const state = useUserStore.getState();

      expect(state.user).toBeNull();
      expect(state.roles).toEqual([]);
      expect(state.isAuthenticated).toBe(false);
      expect(state.error).toBeUndefined();
    });
  });

  describe("setIsAuthenticated", () => {
    it("should set authentication status", () => {
      useUserStore.getState().setIsAuthenticated(true);
      const { isAuthenticated } = useUserStore.getState();

      expect(isAuthenticated).toBe(true);
    });
  });

  describe("setIsLoading", () => {
    it("should set loading state", () => {
      useUserStore.getState().setIsLoading(true);
      const { isLoading } = useUserStore.getState();

      expect(isLoading).toBe(true);
    });
  });

  describe("setError", () => {
    it("should set error message", () => {
      useUserStore.getState().setError("Authentication failed");
      const { error } = useUserStore.getState();

      expect(error).toBe("Authentication failed");
    });

    it("should clear error when undefined", () => {
      useUserStore.getState().setError("Some error");
      useUserStore.getState().setError(undefined);
      const { error } = useUserStore.getState();

      expect(error).toBeUndefined();
    });
  });
});
