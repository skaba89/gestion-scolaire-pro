/**
 * Tests for Auth Store (Zustand)
 */

import { describe, it, expect, beforeEach } from "vitest";
import { useAuthStore, type AuthToken, type JWTPayload } from "@/stores/authStore";

describe("Auth Store", () => {
  const mockToken: AuthToken = {
    access_token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyLTEyMyIsInRlbmFudF9pZCI6InRlbmFudC0xIiwiaWF0IjoxNjcwMDAwMDAwLCJleHAiOjE2NzAwMDM2MDB9.test",
    refresh_token: "refresh-token-123",
    expires_in: 3600,
    token_type: "Bearer",
  };

  const mockJWTPayload: JWTPayload = {
    sub: "user-123",
    tenant_id: "tenant-1",
    iat: 1670000000,
    exp: 1670003600,
  };

  beforeEach(() => {
    // Reset store
    useAuthStore.setState({
      session: null,
      authToken: null,
      jwtPayload: null,
      isInitialized: false,
      isLoading: true,
      error: undefined,
    });
  });

  describe("setAuthToken", () => {
    it("should set auth token", () => {
      useAuthStore.getState().setAuthToken(mockToken);
      const { authToken } = useAuthStore.getState();

      expect(authToken?.access_token).toBe(mockToken.access_token);
      expect(authToken?.token_type).toBe("Bearer");
    });

    it("should clear error when setting token", () => {
      useAuthStore.setState({ error: "Previous error" });
      useAuthStore.getState().setAuthToken(mockToken);
      const { error } = useAuthStore.getState();

      expect(error).toBeUndefined();
    });
  });

  describe("setJWTPayload", () => {
    it("should set JWT payload", () => {
      useAuthStore.getState().setJWTPayload(mockJWTPayload);
      const { jwtPayload } = useAuthStore.getState();

      expect(jwtPayload?.sub).toBe("user-123");
      expect(jwtPayload?.tenant_id).toBe("tenant-1");
    });
  });

  describe("getTenantIdFromToken", () => {
    it("should extract tenant_id from token", () => {
      useAuthStore.getState().setJWTPayload(mockJWTPayload);
      const tenantId = useAuthStore.getState().getTenantIdFromToken();

      expect(tenantId).toBe("tenant-1");
    });

    it("should return null if no token", () => {
      useAuthStore.setState({ jwtPayload: null });
      const tenantId = useAuthStore.getState().getTenantIdFromToken();

      expect(tenantId).toBeNull();
    });
  });

  describe("getUserIdFromToken", () => {
    it("should extract user_id from token", () => {
      useAuthStore.getState().setJWTPayload(mockJWTPayload);
      const userId = useAuthStore.getState().getUserIdFromToken();

      expect(userId).toBe("user-123");
    });

    it("should return null if no token", () => {
      useAuthStore.setState({ jwtPayload: null });
      const userId = useAuthStore.getState().getUserIdFromToken();

      expect(userId).toBeNull();
    });
  });

  describe("getTokenExpiryTime", () => {
    it("should return expiry time in milliseconds", () => {
      useAuthStore.getState().setJWTPayload(mockJWTPayload);
      const expiryTime = useAuthStore.getState().getTokenExpiryTime();

      expect(expiryTime).toBe(1670003600 * 1000);
    });

    it("should return null if no expiry", () => {
      useAuthStore.getState().setJWTPayload({ sub: "user-123" });
      const expiryTime = useAuthStore.getState().getTokenExpiryTime();

      expect(expiryTime).toBeNull();
    });
  });

  describe("isTokenExpired", () => {
    it("should return false for valid token", () => {
      // Set expiry to 1 hour in the future
      const futureExp = Math.floor(Date.now() / 1000) + 3600;
      useAuthStore.getState().setJWTPayload({
        sub: "user-123",
        exp: futureExp,
      });

      const isExpired = useAuthStore.getState().isTokenExpired();

      expect(isExpired).toBe(false);
    });

    it("should return true for expired token", () => {
      // Set expiry to 1 hour in the past
      const pastExp = Math.floor(Date.now() / 1000) - 3600;
      useAuthStore.getState().setJWTPayload({
        sub: "user-123",
        exp: pastExp,
      });

      const isExpired = useAuthStore.getState().isTokenExpired();

      expect(isExpired).toBe(true);
    });

    it("should return true if no expiry set", () => {
      useAuthStore.getState().setJWTPayload({ sub: "user-123" });
      const isExpired = useAuthStore.getState().isTokenExpired();

      expect(isExpired).toBe(true);
    });
  });

  describe("setIsInitialized", () => {
    it("should set initialization status", () => {
      useAuthStore.getState().setIsInitialized(true);
      const { isInitialized } = useAuthStore.getState();

      expect(isInitialized).toBe(true);
    });
  });

  describe("setIsLoading", () => {
    it("should set loading state", () => {
      useAuthStore.getState().setIsLoading(false);
      const { isLoading } = useAuthStore.getState();

      expect(isLoading).toBe(false);
    });
  });

  describe("setError", () => {
    it("should set error message", () => {
      useAuthStore.getState().setError("Authentication failed");
      const { error } = useAuthStore.getState();

      expect(error).toBe("Authentication failed");
    });

    it("should clear error when undefined", () => {
      useAuthStore.getState().setError("Some error");
      useAuthStore.getState().setError(undefined);
      const { error } = useAuthStore.getState();

      expect(error).toBeUndefined();
    });
  });

  describe("clearAuth", () => {
    it("should clear all auth data", () => {
      useAuthStore.setState({
        session: { user: { id: "user-1" } } as any,
        authToken: mockToken,
        jwtPayload: mockJWTPayload,
        isInitialized: true,
        error: "Some error",
      });

      useAuthStore.getState().clearAuth();
      const state = useAuthStore.getState();

      expect(state.session).toBeNull();
      expect(state.authToken).toBeNull();
      expect(state.jwtPayload).toBeNull();
      expect(state.error).toBeUndefined();
    });
  });
});
