/**
 * PUBLIC-DOMAIN-01 (production, 2026-11-25) : sur academy-guineenne.org, « /ecole/uls » doit
 * charger l'établissement par son identifiant, jamais par le nom d'hôte de la plateforme.
 */
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { bySlug, byDomain } = vi.hoisted(() => ({
  bySlug: vi.fn(() => ({ data: undefined, isLoading: false, isError: true, error: { response: { status: 404 } } })),
  byDomain: vi.fn(() => ({ data: undefined, isLoading: false, isError: true, error: { response: { status: 404 } } })),
}));
vi.mock("@/hooks/usePublicTenant", () => ({ usePublicTenant: bySlug, useTenantByDomain: byDomain }));
vi.mock("@/hooks/usePublicPages", () => ({ usePublicPages: () => ({ data: [], isLoading: false }) }));

import TenantLanding from "../TenantLanding";

const originalLocation = window.location;

function onHost(hostname: string) {
  Object.defineProperty(window, "location", { configurable: true, value: { ...originalLocation, hostname } });
}

describe("TenantLanding — résolution de l'établissement", () => {
  beforeEach(() => { bySlug.mockClear(); byDomain.mockClear(); });
  afterEach(() => { Object.defineProperty(window, "location", { configurable: true, value: originalLocation }); });

  it("hôte de la plateforme non listé : l'identifiant de l'URL est utilisé, pas le domaine", () => {
    onHost("academy-guineenne.org");
    render(
      <MemoryRouter initialEntries={["/ecole/uls"]}>
        <Routes><Route path="/ecole/:tenantSlug" element={<TenantLanding />} /></Routes>
      </MemoryRouter>,
    );
    expect(bySlug).toHaveBeenCalledWith("uls");
    expect(byDomain).toHaveBeenCalledWith(undefined);
    expect(screen.getByText(/Établissement introuvable/)).toBeInTheDocument();
  });
});
