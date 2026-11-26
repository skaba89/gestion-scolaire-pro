import { Helmet } from "react-helmet-async";
import { useTranslation } from "react-i18next";
import { useCustomNavLinks } from "@/hooks/usePublicPages";
import { publicOfferNavLink } from "@/lib/publicOffer";
import { resolveUploadUrl } from "@/utils/url";
import { resolveTheme } from "../../theme/themeResolver";
import {
  Hero,
  Text,
  Stats,
  ProgramsSection,
  NewsSection,
  Gallery,
  CTA,
  ContactForm,
  PremiumNavbar,
  PremiumFooter,
  type NavLink,
} from "../../sections";
import type { StatsItem } from "../../types/sections";
import type { NewsItem } from "../../types/sections";
import type { SiteTemplateRenderProps } from "../../registry/types";
import { schoolExcellenceTokens } from "./tokens";

/**
 * School Excellence — premium site template for lycée/collège tenants.
 * Composed from the shared, token-styled sections in src/public-site/sections/
 * (not from PublicPageView.tsx's CMS renderers, and not template-owned
 * duplicates — see the plan's reasoning in src/public-site/README.md).
 *
 * Renders only sections backed by real tenant/settings data — never
 * fabricated stats/testimonials/results (see project conventions).
 */
export function SchoolExcellenceTemplate({ tenant, settings }: SiteTemplateRenderProps) {
  const { t } = useTranslation();

  const tokens = resolveTheme(schoolExcellenceTokens, settings);
  const slug = tenant.slug;
  const currentYear = new Date().getFullYear();

  // Custom pages created via "Pages publiques" (admin) with "Afficher
  // dans le menu" checked — same pattern as the legacy templates
  // (see HighSchoolTemplate.tsx for the full incident rationale).
  const customNavLinks: NavLink[] = useCustomNavLinks(slug);
  const navLinks: NavLink[] = [
    { label: t("siteTemplates.excellence.navSchool"), href: `/ecole/${slug}#presentation` },
    { label: t("siteTemplates.excellence.navTracks"), href: `/ecole/${slug}#filieres` },
    { label: t("siteTemplates.common.admissions"), href: `/admissions/${slug}` },
    publicOfferNavLink(slug),
    { label: t("siteTemplates.common.news"), href: `/ecole/${slug}#actualites` },
    { label: t("siteTemplates.common.contact"), href: `/ecole/${slug}#contact` },
    ...customNavLinks,
  ];

  const statsItems: StatsItem[] = [];
  if (settings.show_stats && tenant.stats) {
    if (tenant.stats.student_count) statsItems.push({ value: `${tenant.stats.student_count}+`, label: t("siteTemplates.excellence.statStudents") });
    if (tenant.stats.teacher_count) statsItems.push({ value: `${tenant.stats.teacher_count}`, label: t("siteTemplates.excellence.statTeachers") });
    if (tenant.programs && tenant.programs.length > 0) statsItems.push({ value: `${tenant.programs.length}`, label: t("siteTemplates.excellence.statTracks") });
  }

  const programItems = settings.show_programs && tenant.programs
    ? tenant.programs.map((p: unknown) => (typeof p === "string" ? { name: p } : (p as { name: string; level?: string; description?: string })))
    : [];

  const newsItems: NewsItem[] = (settings.announcements || []).map((a) => ({
    title: a.title,
    date: a.date,
    excerpt: a.body,
  }));

  const galleryItems = settings.show_gallery !== false ? (settings.gallery || []).map((url) => ({ url })) : [];

  return (
    <>
      <Helmet>
        <title>{tenant.name} — Excellence académique</title>
        <meta
          name="description"
          content={settings.description || settings.tagline || t("siteTemplates.excellence.defaultDescription", { name: tenant.name })}
        />
        <meta property="og:title" content={tenant.name} />
        {settings.description && <meta property="og:description" content={settings.description} />}
        {settings.logo_url && <meta property="og:image" content={resolveUploadUrl(settings.logo_url)} />}
        <meta name="theme-color" content={tokens.primaryColor} />
      </Helmet>

      <div className="min-h-screen bg-white" style={{ fontFamily: tokens.fontBody }}>
        <PremiumNavbar tenantName={tenant.name} slug={slug} logoUrl={settings.logo_url} navLinks={navLinks} tokens={tokens} />

        <Hero
          section={{
            type: "hero",
            title: tenant.name,
            subtitle: settings.tagline || settings.description || t("siteTemplates.excellence.heroTitle"),
            settings: {
              cta_label: t("siteTemplates.common.preEnrollment", { years: `${currentYear}/${currentYear + 1}` }),
              cta_url: `/admissions/${slug}`,
              cta_label_2: t("siteTemplates.excellence.studentSpace"),
              cta_url_2: `/${slug}/login`,
            },
          }}
          tokens={tokens}
          fallbackBackgroundImage={settings.banner_url}
          images={settings.show_gallery !== false ? settings.gallery : []}
        />

        {settings.description && (
          <div id="presentation">
            <Text section={{ type: "text", title: t("siteTemplates.common.about"), content: `<p>${settings.description}</p>` }} tokens={tokens} />
          </div>
        )}

        {statsItems.length > 0 && (
          <Stats section={{ type: "stats", title: t("siteTemplates.common.keyFigures"), items: statsItems }} tokens={tokens} />
        )}

        {programItems.length > 0 && (
          <div id="filieres">
            <ProgramsSection
              section={{ type: "programs", title: t("siteTemplates.excellence.tracksTitle"), subtitle: t("siteTemplates.excellence.tracksSubtitle"), items: programItems }}
              tokens={tokens}
            />
          </div>
        )}

        {newsItems.length > 0 && (
          <div id="actualites">
            <NewsSection section={{ type: "news", title: t("siteTemplates.common.news"), items: newsItems }} tokens={tokens} />
          </div>
        )}

        {galleryItems.length > 0 && (
          <Gallery section={{ type: "gallery", title: t("siteTemplates.excellence.lifeTitle"), items: galleryItems }} tokens={tokens} />
        )}

        <CTA
          section={{
            type: "cta",
            title: t("siteTemplates.common.ready"),
            subtitle: t("siteTemplates.excellence.ctaSubtitle", { years: `${currentYear}/${currentYear + 1}` }),
            settings: { cta_label: t("siteTemplates.excellence.apply"), cta_url: `/admissions/${slug}` },
          }}
          tokens={tokens}
        />

        <div id="contact">
          <ContactForm section={{ type: "contact_form", title: t("siteTemplates.common.contactUs") }} tokens={tokens} tenantSlug={slug} />
        </div>

        <PremiumFooter
          tenantName={tenant.name}
          logoUrl={settings.logo_url}
          navLinks={navLinks}
          facebookUrl={settings.facebook_url || settings.facebook}
          twitterUrl={settings.twitter_url || settings.twitter}
          linkedinUrl={settings.linkedin_url}
          tokens={tokens}
        />
      </div>
    </>
  );
}
