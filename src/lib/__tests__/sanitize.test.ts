/**
 * Phase 3 security pass: XSS coverage for the `custom_html` public-page
 * widget (see CustomHTMLSection in src/pages/public/PublicPageView.tsx,
 * which pipes visitor/admin-authored section.content straight through
 * `sanitizeHtml()` before dangerouslySetInnerHTML). A tenant admin's
 * custom HTML block is rendered to every anonymous visitor of that page —
 * an unsanitized `<script>` or `onerror` there is a stored-XSS hole
 * against the school's own public site, not just the admin's own browser.
 */
import { describe, expect, it, beforeAll } from "vitest";
import { initSanitize, sanitizeHtml, sanitizeText, sanitizeUrl } from "../sanitize";

beforeAll(async () => {
  // Mirrors the real app: initSanitize() is awaited once at startup
  // (see src/main.tsx) so sanitizeHtml/sanitizeText can run synchronously
  // afterwards. Without this, tests would exercise the tag-stripping
  // fallback instead of the real DOMPurify path.
  await initSanitize();
});

describe("sanitizeHtml — custom_html XSS hardening", () => {
  it("strips <script> tags entirely", () => {
    const out = sanitizeHtml('<p>Bonjour</p><script>alert("xss")</script>');
    expect(out).not.toContain("<script");
    expect(out).not.toContain("alert");
    expect(out).toContain("Bonjour");
  });

  it("strips onerror/onclick and other event handler attributes", () => {
    const out = sanitizeHtml('<img src="x" onerror="alert(1)"><div onclick="alert(2)">clic</div>');
    expect(out).not.toContain("onerror");
    expect(out).not.toContain("onclick");
    expect(out).not.toContain("alert");
  });

  it("strips iframe tags (not in the allowed tag list)", () => {
    const out = sanitizeHtml('<iframe src="https://evil.example"></iframe><p>Texte</p>');
    expect(out).not.toContain("<iframe");
    expect(out).not.toContain("evil.example");
    expect(out).toContain("Texte");
  });

  it("strips javascript: URLs from href", () => {
    const out = sanitizeHtml('<a href="javascript:alert(1)">Cliquez</a>');
    expect(out.toLowerCase()).not.toContain("javascript:");
  });

  it("keeps safe, simple formatting HTML intact", () => {
    const out = sanitizeHtml(
      '<h2>Titre</h2><p>Un paragraphe avec <strong>gras</strong> et <a href="https://example.com">un lien</a>.</p>'
    );
    expect(out).toContain("<h2>Titre</h2>");
    expect(out).toContain("<strong>gras</strong>");
    expect(out).toContain('href="https://example.com"');
  });

  it("does not execute injected script when rendered into the DOM", () => {
    // Simulates what CustomHTMLSection does with dangerouslySetInnerHTML —
    // if sanitization failed, this would actually run the payload and set
    // window.__xss__.
    const container = document.createElement("div");
    const dirty = '<img src=x onerror="window.__xss__ = true"><script>window.__xss__ = true</script>';
    container.innerHTML = sanitizeHtml(dirty);
    document.body.appendChild(container);
    expect((window as unknown as { __xss__?: boolean }).__xss__).toBeUndefined();
    document.body.removeChild(container);
  });

  it("returns an empty string for empty/falsy input", () => {
    expect(sanitizeHtml("")).toBe("");
  });
});

describe("sanitizeText — plain-text fields", () => {
  it("strips all HTML, leaving only text", () => {
    expect(sanitizeText('<script>alert(1)</script>Bonjour<b>!</b>')).toBe("Bonjour!");
  });
});

describe("sanitizeUrl — link/href validation", () => {
  it("allows http(s), mailto and tel", () => {
    expect(sanitizeUrl("https://example.com")).toBe("https://example.com");
    expect(sanitizeUrl("http://example.com")).toBe("http://example.com");
    expect(sanitizeUrl("mailto:a@b.com")).toBe("mailto:a@b.com");
    expect(sanitizeUrl("tel:+224600000000")).toBe("tel:+224600000000");
  });

  it("rejects javascript: and data: URLs", () => {
    expect(sanitizeUrl('javascript:alert(1)')).toBe("#");
    expect(sanitizeUrl("data:text/html,<script>alert(1)</script>")).toBe("#");
  });
});
