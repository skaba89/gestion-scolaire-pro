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
import type { StatsItem, NewsItem, ProgramItem } from "../../types/sections";
import type { SiteTemplateRenderProps } from "../../registry/types";
import { campusPrestigeTokens } from "./tokens";

interface DepartmentLike {
  id?: string;
  name: string;
  description?: string;
}

/**
 * Campus Prestige — premium site template for université / enseignement
 * supérieur tenants. Composed from the exact same shared, token-styled
 * sections as School Excellence (see src/public-site/sections/) — the
 * distinct "grande université internationale" identity comes entirely
 * from campus-prestige/tokens.ts, not from separate components.
 *
 * Only renders sections backed by real tenant/settings data — the
 * legacy UniversityTemplate.tsx already learned this lesson the hard
 * way (dead nav anchors for "Recherche"/"International"/"Vie étudiante"
 * that never had real content behind them, removed there); this
 * template starts from that same discipline rather than repeating it.
 */
export function CampusPrestigeTemplate({ tenant, settings }: SiteTemplateRenderProps) {
  const { t } = useTranslation();

  const tokens = resolveTheme(campusPrestigeTokens, settings);
  const slug = tenant.slug;
  const currentYear = new Date().getFullYear();

  const customNavLinks: NavLink[] = useCustomNavLinks(slug);
  const navLinks: NavLink[] = [
    { label: t("siteTemplates.campus.navUniversity"), href: `/ecole/${slug}#presentation` },
    { label: t("siteTemplates.campus.navPrograms"), href: `/ecole/${slug}#formations` },
    { label: t("siteTemplates.common.admissions"), href: `/admissions/${slug}` },
    publicOfferNavLink(slug),
    { label: t("siteTemplates.common.news"), href: `/ecole/${slug}#actualites` },
    { label: t("siteTemplates.common.contact"), href: `/ecole/${slug}#contact` },
    ...customNavLinks,
  ];

  const departments = ((tenant as { departments?: DepartmentLike[] }).departments || []).filter((d) => d?.name);

  const statsItems: StatsItem[] = [];
  if (settings.show_stats && tenant.stats) {
    if (tenant.stats.student_count) statsItems.push({ value: `${tenant.stats.student_count}+`, label: t("siteTemplates.campus.statStudents") });
    if (tenant.stats.teacher_count) statsItems.push({ value: `${tenant.stats.teacher_count}`, label: t("siteTemplates.campus.statResearchers") });
    if (tenant.programs && tenant.programs.length > 0) statsItems.push({ value: `${tenant.programs.length}`, label: t("siteTemplates.campus.statPrograms") });
    if (departments.length > 0) statsItems.push({ value: `${departments.length}`, label: t("siteTemplates.campus.statFaculties") });
  }

  const programItems: ProgramItem[] = settings.show_programs && tenant.programs
    ? tenant.programs.map((p: unknown) => (typeof p === "string" ? { name: p } : (p as ProgramItem)))
    : [];

  const departmentItems: ProgramItem[] = departments.map((d) => ({ name: d.name, description: d.description }));

  const newsItems: NewsItem[] = (settings.announcements || []).map((a) => ({
    title: a.title,
    date: a.date,
    excerpt: a.body,
  }));

  const galleryItems = settings.show_gallery !== false ? (settings.gallery || []).map((url) => ({ url })) : [];

  return (
    <>
      <Helmet>
        <title>{tenant.name} — Enseignement supérieur</title>
        <meta
          name="description"
          content={settings.description || settings.tagline || t("siteTemplates.campus.defaultDescription", { name: tenant.name })}
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
            subtitle: settings.tagline || settings.description || t("siteTemplates.campus.heroTitle"),
            settings: {
              cta_label: t("siteTemplates.campus.heroCta", { years: `${currentYear}/${currentYear + 1}` }),
              cta_url: `/admissions/${slug}`,
              cta_label_2: t("siteTemplates.campus.studentSpace"),
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
          <div id="formations">
            <ProgramsSection
              section={{ type: "programs", title: t("siteTemplates.campus.programsTitle"), subtitle: t("siteTemplates.campus.programsSubtitle"), items: programItems }}
              tokens={tokens}
            />
          </div>
        )}

        {departmentItems.length > 0 && (
          <ProgramsSection
            section={{ type: "programs", title: t("siteTemplates.campus.facultiesTitle"), items: departmentItems }}
            tokens={tokens}
          />
        )}

        {galleryItems.length > 0 && (
          <Gallery section={{ type: "gallery", title: t("siteTemplates.campus.campus"), items: galleryItems }} tokens={tokens} />
        )}

        {newsItems.length > 0 && (
          <div id="actualites">
            <NewsSection section={{ type: "news", title: t("siteTemplates.common.news"), items: newsItems }} tokens={tokens} />
          </div>
        )}

        <CTA
          section={{
            type: "cta",
            title: t("siteTemplates.common.ready"),
            subtitle: t("siteTemplates.campus.ctaSubtitle", { years: `${currentYear}/${currentYear + 1}` }),
            settings: { cta_label: t("siteTemplates.campus.apply"), cta_url: `/admissions/${slug}` },
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
