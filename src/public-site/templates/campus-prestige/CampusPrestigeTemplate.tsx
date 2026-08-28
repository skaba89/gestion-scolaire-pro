import { Helmet } from "react-helmet-async";
import { useCustomNavLinks } from "@/hooks/usePublicPages";
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
  const tokens = resolveTheme(campusPrestigeTokens, settings);
  const slug = tenant.slug;
  const currentYear = new Date().getFullYear();

  const customNavLinks: NavLink[] = useCustomNavLinks(slug);
  const navLinks: NavLink[] = [
    { label: "L'Université", href: `/ecole/${slug}#presentation` },
    { label: "Formations", href: `/ecole/${slug}#formations` },
    { label: "Admissions", href: `/admissions/${slug}` },
    { label: "Actualités", href: `/ecole/${slug}#actualites` },
    { label: "Contact", href: `/ecole/${slug}#contact` },
    ...customNavLinks,
  ];

  const departments = ((tenant as { departments?: DepartmentLike[] }).departments || []).filter((d) => d?.name);

  const statsItems: StatsItem[] = [];
  if (settings.show_stats && tenant.stats) {
    if (tenant.stats.student_count) statsItems.push({ value: `${tenant.stats.student_count}+`, label: "Étudiants" });
    if (tenant.stats.teacher_count) statsItems.push({ value: `${tenant.stats.teacher_count}`, label: "Enseignants-chercheurs" });
    if (tenant.programs && tenant.programs.length > 0) statsItems.push({ value: `${tenant.programs.length}`, label: "Formations proposées" });
    if (departments.length > 0) statsItems.push({ value: `${departments.length}`, label: "Facultés & départements" });
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
          content={settings.description || settings.tagline || `${tenant.name} — Une formation d'excellence, une ouverture sur le monde.`}
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
            subtitle: settings.tagline || settings.description || "Une formation d'excellence, une ouverture sur le monde.",
            settings: {
              cta_label: `Candidature ${currentYear}/${currentYear + 1}`,
              cta_url: `/admissions/${slug}`,
              cta_label_2: "Espace étudiant",
              cta_url_2: `/${slug}/login`,
            },
          }}
          tokens={tokens}
          fallbackBackgroundImage={settings.banner_url}
        />

        {settings.description && (
          <div id="presentation">
            <Text section={{ type: "text", title: "Qui sommes-nous", content: `<p>${settings.description}</p>` }} tokens={tokens} />
          </div>
        )}

        {statsItems.length > 0 && (
          <Stats section={{ type: "stats", title: "Chiffres clés", items: statsItems }} tokens={tokens} />
        )}

        {programItems.length > 0 && (
          <div id="formations">
            <ProgramsSection
              section={{ type: "programs", title: "Nos formations", subtitle: "Des parcours reconnus pour construire votre avenir", items: programItems }}
              tokens={tokens}
            />
          </div>
        )}

        {departmentItems.length > 0 && (
          <ProgramsSection
            section={{ type: "programs", title: "Facultés & Départements", items: departmentItems }}
            tokens={tokens}
          />
        )}

        {galleryItems.length > 0 && (
          <Gallery section={{ type: "gallery", title: "Le campus", items: galleryItems }} tokens={tokens} />
        )}

        {newsItems.length > 0 && (
          <div id="actualites">
            <NewsSection section={{ type: "news", title: "Actualités", items: newsItems }} tokens={tokens} />
          </div>
        )}

        <CTA
          section={{
            type: "cta",
            title: "Prêt à nous rejoindre ?",
            subtitle: `Déposez votre candidature pour la rentrée ${currentYear}/${currentYear + 1}.`,
            settings: { cta_label: "Déposer ma candidature", cta_url: `/admissions/${slug}` },
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
