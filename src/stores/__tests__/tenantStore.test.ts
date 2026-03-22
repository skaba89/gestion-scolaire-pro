/**
 * Tests for Tenant Store (Zustand)
 */

import { describe, it, expect, beforeEach } from "vitest";
import { useTenantStore, isTenantStale, type Tenant } from "@/stores/tenantStore";

describe("Tenant Store", () => {
  const mockTenant: Tenant = {
    id: "tenant-1",
    name: "Example School",
    slug: "example-school",
    type: "SCHOOL",
    is_active: true,
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
  };

  beforeEach(() => {
    // Reset store
    useTenantStore.setState({
      currentTenant: null,
      tenants: [],
      isLoading: false,
      error: undefined,
      lastUpdated: undefined,
    });
  });

  describe("setCurrentTenant", () => {
    it("should set current tenant", () => {
      useTenantStore.getState().setCurrentTenant(mockTenant);
      const { currentTenant } = useTenantStore.getState();

      expect(currentTenant).toEqual(mockTenant);
      expect(currentTenant?.name).toBe("Example School");
    });

    it("should update lastUpdated timestamp", () => {
      const before = Date.now();
      useTenantStore.getState().setCurrentTenant(mockTenant);
      const after = Date.now();
      const { lastUpdated } = useTenantStore.getState();

      expect(lastUpdated).toBeDefined();
      expect(lastUpdated! >= before && lastUpdated! <= after).toBe(true);
    });
  });

  describe("setTenants", () => {
    it("should set list of tenants", () => {
      const tenants = [mockTenant, { ...mockTenant, id: "tenant-2", name: "Another School" }];
      useTenantStore.getState().setTenants(tenants);
      const { tenants: stored } = useTenantStore.getState();

      expect(stored.length).toBe(2);
      expect(stored[0].id).toBe("tenant-1");
      expect(stored[1].id).toBe("tenant-2");
    });
  });

  describe("switchTenant", () => {
    it("should switch to existing tenant", () => {
      useTenantStore.getState().setTenants([mockTenant]);
      const success = useTenantStore.getState().switchTenant("tenant-1");

      expect(success).toBe(true);
      expect(useTenantStore.getState().currentTenant?.id).toBe("tenant-1");
    });

    it("should return false for non-existent tenant", () => {
      useTenantStore.getState().setTenants([mockTenant]);
      const success = useTenantStore.getState().switchTenant("non-existent");

      expect(success).toBe(false);
    });
  });

  describe("addTenant", () => {
    it("should add new tenant to list", () => {
      useTenantStore.getState().addTenant(mockTenant);
      const { tenants } = useTenantStore.getState();

      expect(tenants.length).toBe(1);
      expect(tenants[0].id).toBe("tenant-1");
    });

    it("should not duplicate existing tenant", () => {
      useTenantStore.getState().addTenant(mockTenant);
      useTenantStore.getState().addTenant(mockTenant);
      const { tenants } = useTenantStore.getState();

      expect(tenants.length).toBe(1);
    });
  });

  describe("updateTenant", () => {
    it("should update tenant data", () => {
      useTenantStore.getState().setTenants([mockTenant]);
      useTenantStore.getState().updateTenant("tenant-1", { name: "Updated School" });
      const { tenants } = useTenantStore.getState();

      expect(tenants[0].name).toBe("Updated School");
    });

    it("should update currentTenant if it matches", () => {
      useTenantStore.getState().setCurrentTenant(mockTenant);
      useTenantStore.getState().updateTenant("tenant-1", { name: "Updated School" });
      const { currentTenant } = useTenantStore.getState();

      expect(currentTenant?.name).toBe("Updated School");
    });
  });

  describe("removeTenant", () => {
    it("should remove tenant from list", () => {
      const tenant2 = { ...mockTenant, id: "tenant-2" };
      useTenantStore.getState().setTenants([mockTenant, tenant2]);
      useTenantStore.getState().removeTenant("tenant-1");
      const { tenants } = useTenantStore.getState();

      expect(tenants.length).toBe(1);
      expect(tenants[0].id).toBe("tenant-2");
    });

    it("should switch to first tenant if current is removed", () => {
      const tenant2 = { ...mockTenant, id: "tenant-2" };
      useTenantStore.getState().setTenants([mockTenant, tenant2]);
      useTenantStore.getState().setCurrentTenant(mockTenant);
      useTenantStore.getState().removeTenant("tenant-1");
      const { currentTenant } = useTenantStore.getState();

      expect(currentTenant?.id).toBe("tenant-2");
    });
  });

  describe("updateSettings", () => {
    it("should update tenant settings", () => {
      useTenantStore.getState().setCurrentTenant(mockTenant);
      useTenantStore.getState().updateSettings("tenant-1", {
        primary_color: "#FF0000",
        language: "fr",
      });

      const { currentTenant } = useTenantStore.getState();

      expect(currentTenant?.settings?.primary_color).toBe("#FF0000");
      expect(currentTenant?.settings?.language).toBe("fr");
    });
  });

  describe("getSetting", () => {
    it("should return specific setting value", () => {
      const tenantWithSettings = {
        ...mockTenant,
        settings: { primary_color: "#FF0000", language: "fr" },
      };
      useTenantStore.getState().setCurrentTenant(tenantWithSettings);
      const color = useTenantStore.getState().getSetting("primary_color");

      expect(color).toBe("#FF0000");
    });

    it("should return undefined for non-existent setting", () => {
      useTenantStore.getState().setCurrentTenant(mockTenant);
      const setting = useTenantStore.getState().getSetting("non_existent");

      expect(setting).toBeUndefined();
    });
  });

  describe("getTenantBySlug", () => {
    it("should find tenant by slug", () => {
      useTenantStore.getState().setTenants([mockTenant]);
      const tenant = useTenantStore.getState().getTenantBySlug("example-school");

      expect(tenant?.id).toBe("tenant-1");
    });

    it("should return undefined for non-existent slug", () => {
      useTenantStore.getState().setTenants([mockTenant]);
      const tenant = useTenantStore.getState().getTenantBySlug("non-existent");

      expect(tenant).toBeUndefined();
    });
  });

  describe("isTenantStale", () => {
    it("should return true if no lastUpdated", () => {
      useTenantStore.setState({ lastUpdated: undefined });
      const stale = isTenantStale();

      expect(stale).toBe(true);
    });

    it("should return false if recently updated", () => {
      useTenantStore.setState({ lastUpdated: Date.now() });
      const stale = isTenantStale();

      expect(stale).toBe(false);
    });

    it("should return true if cache older than 5 minutes", () => {
      const fiveMinutesAgo = Date.now() - 5 * 60 * 1000 - 1000; // 5min + 1sec
      useTenantStore.setState({ lastUpdated: fiveMinutesAgo });
      const stale = isTenantStale();

      expect(stale).toBe(true);
    });
  });

  describe("error handling", () => {
    it("should set and clear errors", () => {
      useTenantStore.getState().setError("Tenant load failed");
      expect(useTenantStore.getState().error).toBe("Tenant load failed");

      useTenantStore.getState().setError(undefined);
      expect(useTenantStore.getState().error).toBeUndefined();
    });
  });
});
