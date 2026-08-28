import { Helmet } from "react-helmet-async";
import { useCustomNavLinks } from "@/hooks/usePublicPages";
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
  const tokens = resolveTheme(primaryBloomTokens, settings);
  const slug = tenant.slug;
  const currentYear = new Date().getFullYear();

  const customNavLinks: NavLink[] = useCustomNavLinks(slug);
  const navLinks: NavLink[] = [
    { label: "Accueil", href: `/ecole/${slug}` },
    { label: "Nos classes", href: `/ecole/${slug}#classes` },
    { label: "Infos parents", href: `/ecole/${slug}#annonces` },
    { label: "Contact", href: `/ecole/${slug}#contact` },
    ...customNavLinks,
  ];

  const statsItems: StatsItem[] = [];
  if (settings.show_stats && tenant.stats) {
    if (tenant.stats.student_count) statsItems.push({ value: `${tenant.stats.student_count}`, label: "élèves" });
    if (tenant.stats.teacher_count) statsItems.push({ value: `${tenant.stats.teacher_count}`, label: "enseignants" });
    if (tenant.programs && tenant.programs.length > 0) statsItems.push({ value: `${tenant.programs.length}`, label: "niveaux" });
    if (settings.founded_year) statsItems.push({ value: `${currentYear - settings.founded_year}`, label: "ans d'expérience" });
  }

  // Classes réelles du tenant uniquement — jamais de repli CP/CE1/CE2/
  // CM1/CM2 générique (voir la correction équivalente sur la version
  // legacy, PR #141).
  const classItems: ProgramItem[] = tenant.programs
    ? tenant.programs.map((p: unknown) => (typeof p === "string" ? { name: p } : (p as ProgramItem)))
    : [];

  // "La vie à l'école" — uniquement les activités réellement renseignées
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
          content={settings.description || settings.tagline || `${tenant.name} — Un environnement bienveillant pour l'épanouissement de votre enfant.`}
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
            subtitle: settings.tagline || settings.description || "Un environnement bienveillant pour l'épanouissement de chaque enfant.",
            settings: {
              cta_label: `Pré-inscription ${currentYear}/${currentYear + 1}`,
              cta_url: `/admissions/${slug}`,
              cta_label_2: "Espace parents",
              cta_url_2: `/${slug}/login`,
            },
          }}
          tokens={tokens}
          fallbackBackgroundImage={settings.banner_url}
        />

        {settings.description && (
          <Text section={{ type: "text", title: "Qui sommes-nous", content: `<p>${settings.description}</p>` }} tokens={tokens} />
        )}

        {statsItems.length > 0 && (
          <Stats section={{ type: "stats", title: "Notre école en chiffres", items: statsItems }} tokens={tokens} />
        )}

        {classItems.length > 0 && (
          <div id="classes">
            <ProgramsSection
              section={{ type: "programs", title: "Nos classes", subtitle: "Une progression adaptée à chaque étape de la scolarité", items: classItems }}
              tokens={tokens}
            />
          </div>
        )}

        {schoolLifeItems.length > 0 && (
          <SchoolLifeSection
            section={{ type: "school_life", title: "La vie à l'école", subtitle: "Des activités variées pour l'épanouissement de votre enfant", items: schoolLifeItems }}
            tokens={tokens}
          />
        )}

        {galleryItems.length > 0 && (
          <Gallery section={{ type: "gallery", title: "En images", items: galleryItems }} tokens={tokens} />
        )}

        {newsItems.length > 0 && (
          <div id="annonces">
            <NewsSection section={{ type: "news", title: "Infos pour les parents", items: newsItems }} tokens={tokens} />
          </div>
        )}

        <CTA
          section={{
            type: "cta",
            title: "Prêt à nous rejoindre ?",
            subtitle: `Rejoignez notre école pour l'année ${currentYear}/${currentYear + 1}.`,
            settings: { cta_label: "Faire une pré-inscription", cta_url: `/admissions/${slug}` },
          }}
          tokens={tokens}
        />

        <div id="contact">
          <ContactForm section={{ type: "contact_form", title: "Nous contacter" }} tokens={tokens} tenantSlug={slug} />
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
