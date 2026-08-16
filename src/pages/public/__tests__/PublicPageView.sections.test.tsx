/**
 * Phase 2 (hardening pass): confirms the two public-facing section
 * components that render visitor/tenant-authored HTML — TextSection and
 * CustomHTMLSection — actually route through sanitizeHtml(), not just that
 * sanitizeHtml() itself is safe in isolation (already covered by
 * src/lib/__tests__/sanitize.test.ts). A future edit that swaps
 * `dangerouslySetInnerHTML={{ __html: sanitizeHtml(x) }}` for
 * `dangerouslySetInnerHTML={{ __html: x }}` inside either component would
 * pass the pure-function tests untouched but reopen the XSS hole this
 * covers — see app/workers/tasks.py's twin (test_public_form_email_escaping.py)
 * for the same "test the call site, not just the helper" discipline on the
 * backend side.
 */
import { render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it } from "vitest";

import { CustomHTMLSection, TextSection } from "@/pages/public/PublicPageView";
import type { PublicPageSection } from "@/hooks/usePublicPages";
import { initSanitize } from "@/lib/sanitize";

beforeAll(async () => {
  // Mirrors src/main.tsx and src/lib/__tests__/sanitize.test.ts: without
  // this, sanitizeHtml() runs its weaker tag-stripping fallback (which
  // strips tags but leaves a <script>'s text content behind as plain
  // text) instead of the real DOMPurify path these tests mean to exercise.
  await initSanitize();
});

// NOTE: sanitizeHtml's ALLOWED_ATTR (src/lib/sanitize.ts) doesn't include
// data-testid, so it — like onerror/onclick — gets stripped along with the
// attack payload. Assertions below query by surviving text content instead.
const XSS_PAYLOAD = "<script>window.__xss_fired = true;</script><p>ok</p>";

describe("TextSection — routes section.content through sanitizeHtml", () => {
  it("does not execute an injected <script>, keeps the safe markup around it", () => {
    const section: PublicPageSection = { type: "text", content: XSS_PAYLOAD };
    render(<TextSection section={section} primaryColor="#2f6690" />);

    expect((window as unknown as { __xss_fired?: boolean }).__xss_fired).toBeUndefined();
    expect(screen.getByText("ok")).toBeInTheDocument();
    expect(document.querySelector("script")).toBeNull();
  });

  it("strips an onerror handler — via the tag itself, img isn't in the allowlist", () => {
    // TextSection's ALLOWED_TAGS (src/lib/sanitize.ts) doesn't include
    // "img" at all, so DOMPurify removes the whole element, not just the
    // onerror attribute — an even stronger guarantee than attribute
    // stripping alone. Assert on both: no img survives, and the handler
    // string is nowhere in the output even as inert text.
    const section: PublicPageSection = {
      type: "text",
      content: '<img src="x" onerror="window.__xss_fired = true"><p>ok</p>',
    };
    const { container } = render(<TextSection section={section} primaryColor="#2f6690" />);

    expect(document.querySelector("img")).toBeNull();
    expect(container.innerHTML).not.toContain("onerror");
    expect(screen.getByText("ok")).toBeInTheDocument();
  });
});

describe("CustomHTMLSection — routes section.content through sanitizeHtml", () => {
  it("does not execute an injected <script>, keeps the safe markup around it", () => {
    const section: PublicPageSection = { type: "custom_html", content: XSS_PAYLOAD };
    render(<CustomHTMLSection section={section} />);

    expect((window as unknown as { __xss_fired?: boolean }).__xss_fired).toBeUndefined();
    expect(screen.getByText("ok")).toBeInTheDocument();
    expect(document.querySelector("script")).toBeNull();
  });

  it("strips an iframe (not in the allowed tag list)", () => {
    const section: PublicPageSection = {
      type: "custom_html",
      content: '<iframe src="https://evil.example"></iframe><p>ok</p>',
    };
    render(<CustomHTMLSection section={section} />);

    expect(document.querySelector("iframe")).toBeNull();
    expect(screen.getByText("ok")).toBeInTheDocument();
  });

  it("renders nothing unsafe for an empty/missing content field", () => {
    const section: PublicPageSection = { type: "custom_html" };
    render(<CustomHTMLSection section={section} />);
    expect(document.querySelector("script")).toBeNull();
  });
});
