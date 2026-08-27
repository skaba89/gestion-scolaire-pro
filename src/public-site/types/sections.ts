/**
 * Discriminated-union section types for the Website Builder premium
 * layer — built ON TOP of the existing, untyped `PublicPageSection`
 * (`src/hooks/usePublicPages.ts`), never replacing it. That type stays
 * exactly as-is and continues to back SectionsBuilder.tsx/PublicPageView.tsx
 * (the multi-page CMS) unmodified.
 *
 * `SiteSection` is consumed only by code under `src/public-site/` (site
 * templates' default section lists, and the shared section components in
 * `src/public-site/sections/`). Every variant keeps the same top-level
 * shape convention as `PublicPageSection`
 * ({ type, title?, subtitle?, content?, items?, settings? }) so nothing
 * here is a structural departure from what the rest of the app already
 * understands — just typed narrowing plus a few new `type`s.
 */
import type { PublicPageSection } from "@/hooks/usePublicPages";

export interface HeroSectionData {
  type: "hero";
  title?: string;
  subtitle?: string;
  content?: string;
  settings?: {
    background_image?: string;
    cta_label?: string;
    cta_url?: string;
    cta_label_2?: string;
    cta_url_2?: string;
  };
}

export interface TextSectionData {
  type: "text";
  title?: string;
  subtitle?: string;
  /** Rich HTML — must be passed through sanitizeHtml() at render time,
   * same as PublicPageView.tsx's TextSection does today. */
  content?: string;
  settings?: { label?: string };
}

export interface StatsItem {
  icon?: string;
  value: string;
  label: string;
}
export interface StatsSectionData {
  type: "stats";
  title?: string;
  subtitle?: string;
  items?: StatsItem[];
  settings?: { label?: string };
}

export interface ProgramItem {
  name: string;
  level?: string;
  description?: string;
  icon?: string;
}
export interface ProgramsSectionData {
  type: "programs";
  title?: string;
  subtitle?: string;
  items?: ProgramItem[];
  settings?: { label?: string };
}

export interface ResultItem {
  label: string;
  value: string;
  year?: string;
  icon?: string;
}
export interface ResultsSectionData {
  type: "results";
  title?: string;
  subtitle?: string;
  items?: ResultItem[];
  /** source_note exists so a real figure can be distinguished from a
   * placeholder in the editor UI — never fabricate stats, see project
   * conventions. */
  settings?: { label?: string; source_note?: string };
}

export interface SchoolLifeItem {
  icon?: string;
  title: string;
  description?: string;
  image_url?: string;
}
export interface SchoolLifeSectionData {
  type: "school_life";
  title?: string;
  subtitle?: string;
  items?: SchoolLifeItem[];
  settings?: { label?: string; columns?: number };
}

export interface EventItem {
  title: string;
  date: string;
  location?: string;
  description?: string;
  image_url?: string;
}
export interface EventsSectionData {
  type: "events";
  title?: string;
  subtitle?: string;
  items?: EventItem[];
  settings?: { label?: string };
}

export interface NewsItem {
  title: string;
  date: string;
  excerpt?: string;
  image_url?: string;
  link_url?: string;
}
export interface NewsSectionData {
  type: "news";
  title?: string;
  subtitle?: string;
  items?: NewsItem[];
  settings?: { label?: string };
}

export interface GalleryItem {
  url: string;
  caption?: string;
}
export interface GallerySectionData {
  type: "gallery";
  title?: string;
  subtitle?: string;
  items?: GalleryItem[];
  settings?: { label?: string };
}

export interface CTASectionData {
  type: "cta";
  title?: string;
  subtitle?: string;
  content?: string;
  settings?: {
    cta_label?: string;
    cta_url?: string;
    cta_label_2?: string;
    cta_url_2?: string;
  };
}

export interface TestimonialItem {
  name: string;
  role?: string;
  content: string;
  avatar_url?: string;
}
export interface TestimonialsSectionData {
  type: "testimonials";
  title?: string;
  subtitle?: string;
  items?: TestimonialItem[];
  settings?: { label?: string };
}

export interface FAQItem {
  question: string;
  answer: string;
}
export interface FAQSectionData {
  type: "faq";
  title?: string;
  subtitle?: string;
  items?: FAQItem[];
  settings?: { label?: string };
}

export interface ContactFormSectionData {
  type: "contact_form";
  title?: string;
  subtitle?: string;
  settings?: { label?: string };
}

export type SiteSection =
  | HeroSectionData
  | TextSectionData
  | StatsSectionData
  | ProgramsSectionData
  | ResultsSectionData
  | SchoolLifeSectionData
  | EventsSectionData
  | NewsSectionData
  | GallerySectionData
  | CTASectionData
  | TestimonialsSectionData
  | FAQSectionData
  | ContactFormSectionData;

const KNOWN_TYPES = new Set<SiteSection["type"]>([
  "hero",
  "text",
  "stats",
  "programs",
  "results",
  "school_life",
  "events",
  "news",
  "gallery",
  "cta",
  "testimonials",
  "faq",
  "contact_form",
]);

/** Boundary function: narrows an untyped PublicPageSection[] (or any raw
 * JSON array coming back from the API) into SiteSection[], dropping
 * anything with an unrecognized `type` rather than crashing — same
 * defensive spirit as PublicPagePublicResponse's coerce_legacy_content
 * on the backend. Never mutates the input. */
export function normalizeSections(
  raw: PublicPageSection[] | SiteSection[] | null | undefined,
): SiteSection[] {
  if (!raw) return [];
  return raw.filter((s): s is SiteSection => KNOWN_TYPES.has(s.type as SiteSection["type"]));
}
