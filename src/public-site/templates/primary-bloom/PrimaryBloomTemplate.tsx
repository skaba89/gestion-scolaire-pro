import { Helmet } from "react-helmet-async";
import { useTranslation } from "react-i18next";
import { useCustomNavLinks } from "@/hooks/usePublicPages";
import { publicOfferNavLink } from "@/lib/publicOffer";
import { sortAnnouncementsPinnedFirst } from "@/lib/landingAnnouncements";
import { resolveUploadUrl } from "@/utils/url";
import { resolveTheme } from "../../theme/themeResolver";
import {
  Hero,
  Text,
  Stats,
  ProgramsSection,
  SchoolLifeSection,
  NewsSection,
  Gallery,
  CTA,
  ContactForm,
  PremiumNavbar,
  PremiumFooter,
  type NavLink,
} from "../../sections";
import type { StatsItem, ProgramItem, SchoolLifeItem, NewsItem } from "../../types/sections";
import type { SiteTemplateRenderProps } from "../../registry/types";
import { primaryBloomTokens } from "./tokens";

/**
 * Primary Bloom — premium site template for école primaire tenants.
 * Composed from the shared, token-styled sections in src/public-site/sections/
 * — same architecture as SchoolExcellenceTemplate.tsx and
 * CampusPrestigeTemplate.tsx, only the tokens and the section
 * composition/labels differ (see README.md).
 *
 * Renders only sections backed by real tenant/settings data — never
 * fabricated classes/activities/stats (see project conventions; this is
 * exactly the bug PR #141 fixed on the legacy PrimarySchoolTemplate.tsx —
 * this template is built correctly from the start).
 */
export function PrimaryBloomTemplate({ tenant, settings }: SiteTemplateRenderProps) {
  const { t } = useTranslation();

  const tokens = resolveTheme(primaryBloomTokens, settings);
  const slug = tenant.slug;
  const currentYear = new Date().getFullYear();

  const customNavLinks: NavLink[] = useCustomNavLinks(slug);
  const navLinks: NavLink[] = [
    { label: t("siteTemplates.bloom.navHome"), href: `/ecole/${slug}` },
    { label: t("siteTemplates.bloom.navClasses"), href: `/ecole/${slug}#classes` },
    publicOfferNavLink(slug),
    { label: t("siteTemplates.bloom.navParents"), href: `/ecole/${slug}#annonces` },
    { label: t("siteTemplates.common.contact"), href: `/ecole/${slug}#contact` },
    ...customNavLinks,
  ];

  const statsItems: StatsItem[] = [];
  if (settings.show_stats && tenant.stats) {
    if (tenant.stats.student_count) statsItems.push({ value: `${tenant.stats.student_count}`, label: t("siteTemplates.bloom.statStudents") });
    if (tenant.stats.teacher_count) statsItems.push({ value: `${tenant.stats.teacher_count}`, label: t("siteTemplates.bloom.statTeachers") });
    if (tenant.programs && tenant.programs.length > 0) statsItems.push({ value: `${tenant.programs.length}`, label: t("siteTemplates.bloom.statLevels") });
    if (settings.founded_year) statsItems.push({ value: `${currentYear - settings.founded_year}`, label: t("siteTemplates.bloom.statYears") });
  }

  // Classes réelles du tenant uniquement — jamais de repli CP/CE1/CE2/
  // CM1/CM2 générique (voir la correction équivalente sur la version
  // legacy, PR #141).
  const classItems: ProgramItem[] = tenant.programs
    ? tenant.programs.map((p: unknown) => (typeof p === "string" ? { name: p } : (p as ProgramItem)))
    : [];

  // t("siteTemplates.bloom.lifeTitle") — uniquement les activités réellement renseignées
  // (settings.features), jamais les 4 cartes fixes (Sport & EPS, Art &
  // Créativité...) que la version legacy affichait avant PR #141.
  const schoolLifeItems: SchoolLifeItem[] = (settings.features || []).map((feat) => ({ title: feat }));

  const newsItems: NewsItem[] = sortAnnouncementsPinnedFirst(settings.announcements || []).map((a) => ({
    title: a.title,
    date: a.date || "",
    excerpt: a.body,
  }));

  const galleryItems = settings.show_gallery !== false ? (settings.gallery || []).map((url) => ({ url })) : [];

  return (
    <>
      <Helmet>
        <title>{tenant.name} — École primaire</title>
        <meta
          name="description"
          content={settings.description || settings.tagline || t("siteTemplates.bloom.defaultDescription", { name: tenant.name })}
        />
        <meta property="og:title" content={tenant.name} />
        {settings.description && <meta property="og:description" content={settings.description} />}
        {settings.logo_url && <meta property="og:image" content={resolveUploadUrl(settings.logo_url)} />}
        <meta name="theme-color" content={tokens.primaryColor} />
      </Helmet>

      <div className="min-h-screen" style={{ backgroundColor: tokens.backgroundColor, fontFamily: tokens.fontBody }}>
        <PremiumNavbar tenantName={tenant.name} slug={slug} logoUrl={settings.logo_url} navLinks={navLinks} tokens={tokens} />

        <Hero
          section={{
            type: "hero",
            title: tenant.name,
            subtitle: settings.tagline || settings.description || t("siteTemplates.bloom.heroTitle"),
            settings: {
              cta_label: t("siteTemplates.common.preEnrollment", { years: `${currentYear}/${currentYear + 1}` }),
              cta_url: `/admissions/${slug}`,
              cta_label_2: t("siteTemplates.bloom.parentSpace"),
              cta_url_2: `/${slug}/login`,
            },
          }}
          tokens={tokens}
          fallbackBackgroundImage={settings.banner_url}
          images={settings.show_gallery !== false ? settings.gallery : []}
        />

        {settings.description && (
          <Text section={{ type: "text", title: t("siteTemplates.common.about"), content: `<p>${settings.description}</p>` }} tokens={tokens} />
        )}

        {statsItems.length > 0 && (
          <Stats section={{ type: "stats", title: t("siteTemplates.bloom.figuresTitle"), items: statsItems }} tokens={tokens} />
        )}

        {classItems.length > 0 && (
          <div id="classes">
            <ProgramsSection
              section={{ type: "programs", title: t("siteTemplates.bloom.navClasses"), subtitle: t("siteTemplates.bloom.classesSubtitle"), items: classItems }}
              tokens={tokens}
            />
          </div>
        )}

        {schoolLifeItems.length > 0 && (
          <SchoolLifeSection
            section={{ type: "school_life", title: t("siteTemplates.bloom.lifeTitle"), subtitle: t("siteTemplates.bloom.lifeSubtitle"), items: schoolLifeItems }}
            tokens={tokens}
          />
        )}

        {galleryItems.length > 0 && (
          <Gallery section={{ type: "gallery", title: t("siteTemplates.bloom.gallery"), items: galleryItems }} tokens={tokens} />
        )}

        {newsItems.length > 0 && (
          <div id="annonces">
            <NewsSection section={{ type: "news", title: t("siteTemplates.bloom.parentsInfo"), items: newsItems }} tokens={tokens} />
          </div>
        )}

        <CTA
          section={{
            type: "cta",
            title: t("siteTemplates.common.ready"),
            subtitle: t("siteTemplates.bloom.ctaSubtitle", { years: `${currentYear}/${currentYear + 1}` }),
            settings: { cta_label: t("siteTemplates.bloom.apply"), cta_url: `/admissions/${slug}` },
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
