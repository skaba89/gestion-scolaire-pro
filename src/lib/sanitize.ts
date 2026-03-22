/**
 * XSS-safe HTML sanitization helpers for SchoolFlow Pro.
 *
 * Uses DOMPurify when available (install `dompurify`).
 * Falls back to a basic tag-stripping approach if not installed.
 *
 * Call `initSanitize()` once at app startup for synchronous usage.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PurifyInstance = { sanitize: (dirty: string, config?: Record<string, any>) => string };

let purify: PurifyInstance | null = null;

/** Pre-load DOMPurify so `sanitizeHtml` can be used synchronously. */
export async function initSanitize(): Promise<void> {
  try {
    const mod = await import("dompurify");
    purify = mod.default as unknown as PurifyInstance;
  } catch {
    // dompurify not installed — fallback mode active
    if (import.meta.env.DEV) {
      console.warn(
        "[sanitize] dompurify not installed. " +
          "Run `npm i dompurify @types/dompurify` for full XSS protection."
      );
    }
  }
}

// Allowed HTML tags for rich text content (announcements, descriptions)
const RICH_TEXT_TAGS = [
  "p", "br", "strong", "b", "em", "i", "u", "s",
  "h1", "h2", "h3", "h4", "h5", "h6",
  "ul", "ol", "li", "a", "blockquote", "code", "pre",
  "span", "div", "table", "thead", "tbody", "tr", "th", "td",
];
const RICH_TEXT_ATTRS = ["href", "target", "rel", "class", "style"];

/**
 * Sanitize HTML from user-generated content.
 * Removes XSS vectors; keeps safe formatting tags.
 *
 * @example
 *   dangerouslySetInnerHTML={{ __html: sanitizeHtml(announcement.content) }}
 */
export function sanitizeHtml(dirty: string): string {
  if (!dirty) return "";

  if (purify) {
    return purify.sanitize(dirty, {
      ALLOWED_TAGS: RICH_TEXT_TAGS,
      ALLOWED_ATTR: RICH_TEXT_ATTRS,
      FORBID_SCRIPT: true,
    });
  }

  // Fallback: strip all HTML tags
  return dirty.replace(/<[^>]*>/g, "").replace(/&(?!amp;|lt;|gt;|quot;|#)[^;]+;/g, " ");
}

/**
 * Strip all HTML — returns plain text.
 * Use for display names, titles, and any content shown as text.
 */
export function sanitizeText(dirty: string): string {
  if (!dirty) return "";

  if (purify) {
    return purify.sanitize(dirty, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
  }

  return dirty.replace(/<[^>]*>/g, "");
}

/**
 * Validate and sanitize a URL.
 * Only allows `http://`, `https://`, `mailto:`, and `tel:` protocols.
 *
 * @returns The original URL if safe, `"#"` otherwise.
 */
export function sanitizeUrl(url: string): string {
  if (!url) return "";
  const safe = /^(https?:\/\/|mailto:|tel:)/i;
  if (safe.test(url.trim())) return url.trim();
  return "#";
}
