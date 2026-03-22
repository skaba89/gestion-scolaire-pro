import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import {
  Building2,
  LogIn,
  Menu,
  X,
  UserPlus,
  BookOpen,
  GraduationCap,
  Users,
  MapPin,
  Mail,
  Phone,
  Globe,
  Bell,
  Pin,
  ChevronRight,
  Facebook,
  Instagram,
  Twitter,
  Youtube,
  Award,
  Shield,
  TrendingUp,
  Clock,
  ArrowRight,
  Calendar,
  Linkedin,
} from 'lucide-react';
import type { TenantPublicResponse, TenantLandingSettings } from '@/types/tenant';

interface LandingTemplateProps {
  tenant: TenantPublicResponse;
  settings: TenantLandingSettings;
}

export const HighSchoolTemplate = ({ tenant, settings }: LandingTemplateProps) => {
  const [mobileOpen, setMobileOpen] = useState(false);
  const slug = tenant.slug;

  // Deep navy blue theme with gold accents
  const navyColor = '#1e3a5f';
  const goldColor = '#c9a227';
  const accentColor = settings.secondary_color || '#3b82f6';

  const pinnedAnnouncements = settings.announcements.filter((a) => a.is_pinned);
  const unpinnedAnnouncements = settings.announcements.filter((a) => !a.is_pinned);
  const allAnnouncements = [...pinnedAnnouncements, ...unpinnedAnnouncements];

  const navLinks = [
    { label: "L'Établissement", href: `/ecole/${slug}` },
    { label: 'Filières', href: `/ecole/${slug}#programmes` },
    { label: 'Admissions', href: `/admissions/${slug}` },
    { label: 'Actualités', href: `/ecole/${slug}#annonces` },
    { label: 'Contact', href: `/ecole/${slug}#contact` },
  ];

  const currentYear = new Date().getFullYear();

  return (
    <>
      <Helmet>
        <title>{tenant.name} — Lycée / Collège</title>
        <meta
          name="description"
          content={
            settings.description ||
            settings.tagline ||
            `${tenant.name} — Excellence académique, formation complète.`
          }
        />
        <meta property="og:title" content={tenant.name} />
        <meta name="theme-color" content={navyColor} />
      </Helmet>

      <div className="min-h-screen bg-gray-50">
        {/* ─── TOP INFO BAR ────────────────────────────────────────── */}
        <div style={{ backgroundColor: navyColor }} className="text-white/70 text-xs py-2 hidden sm:block">
          <div className="container mx-auto px-4 flex items-center justify-between">
            <div className="flex items-center gap-6">
              {(tenant.email || settings.contact_email) && (
                <a
                  href={`mailto:${tenant.email || settings.contact_email}`}
                  className="flex items-center gap-1.5 hover:text-white transition-colors"
                >
                  <Mail className="w-3 h-3" />
                  {tenant.email || settings.contact_email}
                </a>
              )}
              {(tenant.phone || settings.contact_phone) && (
                <a
                  href={`tel:${tenant.phone || settings.contact_phone}`}
                  className="flex items-center gap-1.5 hover:text-white transition-colors"
                >
                  <Phone className="w-3 h-3" />
                  {tenant.phone || settings.contact_phone}
                </a>
              )}
              {settings.opening_hours && (
                <span className="flex items-center gap-1.5">
                  <Clock className="w-3 h-3" />
                  {settings.opening_hours.split('\n')[0]}
                </span>
              )}
            </div>
            {settings.accreditation && (
              <span className="text-white/50 italic">{settings.accreditation}</span>
            )}
          </div>
        </div>

        {/* ─── NAVBAR ─────────────────────────────────────────────── */}
        <nav className="sticky top-0 z-50 bg-white shadow-md border-b-4" style={{ borderBottomColor: goldColor }}>
          <div className="container mx-auto px-4">
            <div className="flex items-center justify-between py-3">
              {/* Logo */}
              <Link to={`/ecole/${slug}`} className="flex items-center gap-3">
                {settings.logo_url ? (
                  <img
                    src={settings.logo_url}
                    alt={tenant.name}
                    className="h-12 w-auto object-contain"
                  />
                ) : (
                  <div
                    className="h-12 w-12 rounded-lg flex items-center justify-center text-white font-bold text-xl"
                    style={{ backgroundColor: navyColor }}
                  >
                    {tenant.name.charAt(0).toUpperCase()}
                  </div>
                )}
                <div>
                  <p className="font-bold text-base leading-tight" style={{ color: navyColor }}>
                    {tenant.name}
                  </p>
                  {settings.founded_year && (
                    <p className="text-gray-400 text-xs">Fondé en {settings.founded_year}</p>
                  )}
                </div>
              </Link>

              {/* Desktop nav */}
              <div className="hidden lg:flex items-center gap-1">
                {navLinks.map((link) => (
                  <a
                    key={link.label}
                    href={link.href}
                    className="px-3 py-2 rounded text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-colors"
                  >
                    {link.label}
                  </a>
                ))}
              </div>

              {/* CTA */}
              <div className="hidden sm:flex items-center gap-2">
                <Link
                  to={`/admissions/${slug}`}
                  className="px-4 py-2 rounded-lg text-sm font-semibold text-white transition-opacity hover:opacity-90 shadow-sm"
                  style={{ backgroundColor: goldColor }}
                >
                  <UserPlus className="w-4 h-4 inline mr-1" />
                  Pré-inscription
                </Link>
                <Link
                  to={`/${slug}/student`}
                  className="px-4 py-2 rounded-lg text-sm font-medium border-2 hover:bg-gray-50 transition-colors"
                  style={{ color: navyColor, borderColor: navyColor }}
                >
                  <LogIn className="w-4 h-4 inline mr-1" />
                  Connexion
                </Link>
              </div>

              {/* Mobile hamburger */}
              <button
                className="lg:hidden p-2 rounded hover:bg-gray-100 transition-colors"
                onClick={() => setMobileOpen(!mobileOpen)}
                aria-label="Menu"
              >
                {mobileOpen ? (
                  <X className="w-5 h-5" style={{ color: navyColor }} />
                ) : (
                  <Menu className="w-5 h-5" style={{ color: navyColor }} />
                )}
              </button>
            </div>

            {/* Mobile menu */}
            {mobileOpen && (
              <div className="lg:hidden py-4 border-t border-gray-100 space-y-1">
                {navLinks.map((link) => (
                  <a
                    key={link.label}
                    href={link.href}
                    className="block px-4 py-3 rounded text-sm text-gray-700 hover:bg-gray-100"
                    onClick={() => setMobileOpen(false)}
                  >
                    {link.label}
                  </a>
                ))}
                <div className="pt-3 border-t border-gray-100 space-y-2">
                  <Link
                    to={`/admissions/${slug}`}
                    className="block px-4 py-3 rounded-lg text-sm font-semibold text-white text-center"
                    style={{ backgroundColor: goldColor }}
                    onClick={() => setMobileOpen(false)}
                  >
                    Pré-inscription
                  </Link>
                  <Link
                    to={`/${slug}/student`}
                    className="block px-4 py-3 rounded-lg text-sm font-medium text-center border-2"
                    style={{ color: navyColor, borderColor: navyColor }}
                    onClick={() => setMobileOpen(false)}
                  >
                    Se connecter
                  </Link>
                </div>
              </div>
            )}
          </div>
        </nav>

        {/* ─── HERO ────────────────────────────────────────────────── */}
        <header
          className="relative overflow-hidden"
          style={{ backgroundColor: navyColor, minHeight: '520px' }}
        >
          {settings.banner_url && (
            <>
              <img
                src={settings.banner_url}
                alt={tenant.name}
                className="absolute inset-0 w-full h-full object-cover opacity-25"
              />
              <div className="absolute inset-0 bg-gradient-to-r from-gray-900/90 to-gray-900/40" />
            </>
          )}

          {/* Decorative diagonal accent */}
          <div
            className="absolute right-0 top-0 bottom-0 w-1/3 hidden xl:block opacity-60"
            style={{
              backgroundColor: goldColor,
              clipPath: 'polygon(25% 0, 100% 0, 100% 100%, 0% 100%)',
            }}
          />

          {/* Gold top border */}
          <div className="absolute top-0 left-0 right-0 h-1" style={{ backgroundColor: goldColor }} />

          <div className="container mx-auto px-4 py-24 md:py-32 relative z-10">
            <div className="max-w-3xl">
              {settings.accreditation && (
                <div
                  className="inline-flex items-center gap-2 mb-6 px-3 py-1.5 rounded-full border text-xs font-semibold"
                  style={{ borderColor: `${goldColor}60`, color: goldColor }}
                >
                  <Shield className="w-3 h-3" />
                  {settings.accreditation}
                </div>
              )}

              <h1 className="text-4xl md:text-6xl font-bold text-white mb-4 leading-tight">
                {tenant.name}
              </h1>

              <p className="text-lg md:text-xl text-white/80 mb-6 max-w-xl leading-relaxed">
                {settings.tagline ||
                  'Excellence académique et formation complète pour préparer votre avenir.'}
              </p>

              {settings.school_motto && (
                <p
                  className="text-white/60 italic text-sm mb-8 border-l-4 pl-4"
                  style={{ borderColor: goldColor }}
                >
                  "{settings.school_motto}"
                </p>
              )}

              <div className="flex flex-wrap gap-4 mb-8">
                <Link
                  to={`/admissions/${slug}`}
                  className="inline-flex items-center gap-2 px-8 py-3.5 rounded-lg font-semibold text-white transition-opacity hover:opacity-90 shadow-lg"
                  style={{ backgroundColor: goldColor }}
                >
                  <UserPlus className="w-5 h-5" />
                  Pré-inscription {currentYear}/{currentYear + 1}
                </Link>
                <Link
                  to={`/${slug}/student`}
                  className="inline-flex items-center gap-2 px-8 py-3.5 rounded-lg font-semibold text-white border-2 border-white/30 hover:bg-white/10 transition-colors"
                >
                  <LogIn className="w-5 h-5" />
                  Espace élève
                </Link>
              </div>

              {tenant.address && (
                <div className="flex items-center gap-2 text-white/50 text-sm">
                  <MapPin className="w-4 h-4 flex-shrink-0" />
                  {tenant.address}
                </div>
              )}
            </div>
          </div>
        </header>

        {/* ─── QUICK ACCESS CARDS ───────────────────────────────────── */}
        <section className="container mx-auto px-4 -mt-8 relative z-10">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              {
                icon: <GraduationCap className="w-7 h-7" />,
                label: 'Espace Élèves',
                desc: 'Notes, emplois du temps, résultats',
                href: `/${slug}/student`,
                color: navyColor,
                bg: '#eef2ff',
              },
              {
                icon: <Users className="w-7 h-7" />,
                label: 'Espace Parents',
                desc: 'Suivi de la scolarité de votre enfant',
                href: `/${slug}/student`,
                color: '#059669',
                bg: '#ecfdf5',
              },
              {
                icon: <UserPlus className="w-7 h-7" />,
                label: 'Dossier Inscription',
                desc: `Candidature ${currentYear}/${currentYear + 1}`,
                href: `/admissions/${slug}`,
                color: goldColor,
                bg: '#fffbeb',
              },
            ].map((card, i) => (
              <Link
                key={i}
                to={card.href}
                className="group bg-white rounded-2xl p-6 shadow-lg border border-gray-100 hover:shadow-xl hover:-translate-y-1 transition-all flex items-center gap-4"
              >
                <div
                  className="w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: card.bg, color: card.color }}
                >
                  {card.icon}
                </div>
                <div>
                  <p className="font-bold text-gray-900 group-hover:text-gray-700">{card.label}</p>
                  <p className="text-sm text-gray-500 mt-0.5">{card.desc}</p>
                </div>
                <ChevronRight
                  className="w-5 h-5 text-gray-300 ml-auto group-hover:text-gray-500 group-hover:translate-x-0.5 transition-all"
                />
              </Link>
            ))}
          </div>
        </section>

        <main className="container mx-auto px-4 py-16 space-y-20">
          {/* ─── CHIFFRES CLES ────────────────────────────────────────── */}
          {settings.show_stats && tenant.stats && (
            <section
              className="rounded-3xl overflow-hidden text-white py-16 px-8"
              style={{ backgroundColor: navyColor }}
            >
              <div className="text-center mb-12">
                <TrendingUp className="w-10 h-10 mx-auto mb-3" style={{ color: goldColor }} />
                <h2 className="text-3xl font-bold">Chiffres clés</h2>
                <p className="text-white/60 mt-2">Notre engagement en quelques données</p>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
                {[
                  {
                    value: `${tenant.stats.student_count}+`,
                    label: 'Élèves inscrits',
                    color: '#60a5fa',
                  },
                  {
                    value: `${tenant.stats.teacher_count}`,
                    label: 'Enseignants qualifiés',
                    color: '#34d399',
                  },
                  {
                    value: `${(tenant.programs ?? []).length}`,
                    label: 'Filières proposées',
                    color: goldColor,
                  },
                  {
                    value: settings.founded_year
                      ? `${currentYear - settings.founded_year} ans`
                      : '—',
                    label: "D'expérience",
                    color: '#f87171',
                  },
                ].map((item, i) => (
                  <div key={i}>
                    <p className="text-4xl md:text-5xl font-bold mb-2" style={{ color: item.color }}>
                      {item.value}
                    </p>
                    <p className="text-white/60 text-sm">{item.label}</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* ─── INFORMATIONS ADMISSION ───────────────────────────────── */}
          <section>
            <div className="mb-8">
              <div
                className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-widest px-3 py-1 rounded-full mb-3"
                style={{ backgroundColor: `${navyColor}12`, color: navyColor }}
              >
                <Award className="w-3 h-3" />
                Inscriptions
              </div>
              <h2 className="text-3xl font-bold text-gray-900">Informations Admission</h2>
              <p className="text-gray-500 mt-2">
                Rejoignez notre établissement pour l'année scolaire {currentYear}/{currentYear + 1}
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {[
                {
                  icon: <Calendar className="w-5 h-5" />,
                  title: "Période d'inscription",
                  desc: `Dépôt des dossiers ouvert pour l'année ${currentYear}/${currentYear + 1}. Candidatez en ligne dès maintenant.`,
                  color: navyColor,
                },
                {
                  icon: <BookOpen className="w-5 h-5" />,
                  title: "Pièces requises",
                  desc: "Bulletins scolaires des 2 dernières années, acte de naissance, photo d'identité.",
                  color: accentColor,
                },
                {
                  icon: <Users className="w-5 h-5" />,
                  title: "Entretien d'admission",
                  desc: "Un entretien avec l'équipe pédagogique peut être organisé selon les filières.",
                  color: '#10b981',
                },
                {
                  icon: <Shield className="w-5 h-5" />,
                  title: 'Résultats & Notifications',
                  desc: "Les résultats d'admission sont communiqués par email dans un délai de 15 jours.",
                  color: goldColor,
                },
              ].map((item, i) => (
                <div
                  key={i}
                  className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm flex gap-4 hover:shadow-md transition-shadow"
                >
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5"
                    style={{ backgroundColor: `${item.color}18`, color: item.color }}
                  >
                    {item.icon}
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-900 mb-1">{item.title}</h3>
                    <p className="text-sm text-gray-600 leading-relaxed">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-6 flex justify-center">
              <Link
                to={`/admissions/${slug}`}
                className="inline-flex items-center gap-2 px-8 py-3.5 rounded-xl font-semibold text-white shadow-lg hover:opacity-90 transition-opacity"
                style={{ backgroundColor: navyColor }}
              >
                Déposer ma candidature
                <ArrowRight className="w-5 h-5" />
              </Link>
            </div>
          </section>

          {/* ─── PROGRAMMES ──────────────────────────────────────────── */}
          {settings.show_programs && tenant.programs && tenant.programs.length > 0 && (
            <section id="programmes">
              <div className="flex items-end justify-between mb-10">
                <div>
                  <div
                    className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-widest px-3 py-1 rounded-full mb-3"
                    style={{ backgroundColor: `${navyColor}12`, color: navyColor }}
                  >
                    <BookOpen className="w-3 h-3" />
                    Académique
                  </div>
                  <h2 className="text-3xl font-bold text-gray-900">Nos Filières</h2>
                  <p className="text-gray-500 mt-1">Des formations adaptées à chaque projet d'avenir</p>
                </div>
                <Link
                  to={`/admissions/${slug}`}
                  className="hidden sm:flex items-center gap-1 text-sm font-medium"
                  style={{ color: accentColor }}
                >
                  Candidater <ArrowRight className="w-4 h-4" />
                </Link>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {(tenant.programs || []).map((program: any, idx) => (
                  <div
                    key={idx}
                    className="bg-white rounded-2xl overflow-hidden border border-gray-100 shadow-sm hover:shadow-lg transition-shadow group"
                  >
                    <div className="h-1.5 w-full" style={{ backgroundColor: navyColor }} />
                    <div className="p-6">
                      <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center mb-4"
                        style={{ backgroundColor: `${navyColor}12`, color: navyColor }}
                      >
                        <GraduationCap className="w-5 h-5" />
                      </div>
                      <h3 className="font-bold text-gray-900 mb-3 group-hover:text-blue-700 transition-colors">
                        {typeof program === 'string' ? program : program.name}
                      </h3>
                      <Link
                        to={`/admissions/${slug}`}
                        className="text-sm font-medium flex items-center gap-1 hover:gap-2 transition-all"
                        style={{ color: accentColor }}
                      >
                        En savoir plus <ChevronRight className="w-4 h-4" />
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* ─── AGENDA / ANNONCES ────────────────────────────────────── */}
          {allAnnouncements.length > 0 && (
            <section id="annonces">
              <div className="mb-10">
                <div
                  className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-widest px-3 py-1 rounded-full mb-3"
                  style={{ backgroundColor: `${navyColor}12`, color: navyColor }}
                >
                  <Bell className="w-3 h-3" />
                  Actualités
                </div>
                <h2 className="text-3xl font-bold text-gray-900">Agenda & Annonces</h2>
              </div>

              <div className="space-y-4">
                {allAnnouncements.slice(0, 6).map((ann, i) => (
                  <article
                    key={ann.id ?? i}
                    className={`bg-white rounded-2xl p-6 border shadow-sm flex gap-4 hover:shadow-md transition-shadow ${
                      ann.is_pinned ? 'border-blue-200 bg-blue-50/30' : 'border-gray-100'
                    }`}
                  >
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{
                        backgroundColor: ann.is_pinned ? '#dbeafe' : `${navyColor}12`,
                        color: ann.is_pinned ? accentColor : navyColor,
                      }}
                    >
                      {ann.is_pinned ? (
                        <Pin className="w-5 h-5" />
                      ) : (
                        <Bell className="w-5 h-5" />
                      )}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-start justify-between gap-2 flex-wrap mb-2">
                        <h3 className="font-bold text-gray-900">{ann.title}</h3>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {ann.is_pinned && (
                            <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">
                              Important
                            </span>
                          )}
                          {ann.category && (
                            <span
                              className="text-xs px-2 py-0.5 rounded-full font-medium"
                              style={{ backgroundColor: `${navyColor}12`, color: navyColor }}
                            >
                              {ann.category}
                            </span>
                          )}
                          {ann.date && (
                            <time className="text-xs text-gray-400">
                              {new Date(ann.date).toLocaleDateString('fr-FR', {
                                day: 'numeric',
                                month: 'long',
                                year: 'numeric',
                              })}
                            </time>
                          )}
                        </div>
                      </div>
                      <p className="text-sm text-gray-600 leading-relaxed">{ann.body}</p>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )}

          {/* ─── GALERIE ─────────────────────────────────────────────── */}
          {settings.show_gallery && settings.gallery.length > 0 && (
            <section>
              <div className="mb-10">
                <div
                  className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-widest px-3 py-1 rounded-full mb-3"
                  style={{ backgroundColor: `${navyColor}12`, color: navyColor }}
                >
                  Vie scolaire
                </div>
                <h2 className="text-3xl font-bold text-gray-900">Galerie Photos</h2>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {settings.gallery.map((url, i) => (
                  <div
                    key={i}
                    className="rounded-2xl overflow-hidden bg-gray-200 group"
                    style={{ aspectRatio: '16/9' }}
                  >
                    <img
                      src={url}
                      alt={`${tenant.name} ${i + 1}`}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      loading="lazy"
                    />
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* ─── CONTACT ─────────────────────────────────────────────── */}
          <section id="contact">
            <div className="mb-10">
              <div
                className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-widest px-3 py-1 rounded-full mb-3"
                style={{ backgroundColor: `${navyColor}12`, color: navyColor }}
              >
                Nous joindre
              </div>
              <h2 className="text-3xl font-bold text-gray-900">Contact & Horaires</h2>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Contact details */}
              <div className="lg:col-span-2 bg-white rounded-2xl p-8 border border-gray-100 shadow-sm space-y-5">
                {[
                  tenant.address && {
                    icon: <MapPin className="w-5 h-5" />,
                    label: 'Adresse',
                    content: tenant.address,
                    href: undefined as string | undefined,
                  },
                  (tenant.email || settings.contact_email) && {
                    icon: <Mail className="w-5 h-5" />,
                    label: 'Email',
                    content: tenant.email || settings.contact_email || '',
                    href: `mailto:${tenant.email || settings.contact_email}`,
                  },
                  (tenant.phone || settings.contact_phone) && {
                    icon: <Phone className="w-5 h-5" />,
                    label: 'Téléphone',
                    content: tenant.phone || settings.contact_phone || '',
                    href: `tel:${tenant.phone || settings.contact_phone}`,
                  },
                  tenant.website && {
                    icon: <Globe className="w-5 h-5" />,
                    label: 'Site web',
                    content: tenant.website.replace(/^https?:\/\//, ''),
                    href: tenant.website,
                  },
                ]
                  .filter(Boolean)
                  .map((item: any, i) => (
                    <div key={i} className="flex items-start gap-4">
                      <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                        style={{ backgroundColor: `${navyColor}12`, color: navyColor }}
                      >
                        {item.icon}
                      </div>
                      <div>
                        <p className="text-xs text-gray-400 font-medium mb-0.5">{item.label}</p>
                        {item.href ? (
                          <a
                            href={item.href}
                            className="text-gray-800 hover:underline font-medium"
                            {...(item.href.startsWith('http')
                              ? { target: '_blank', rel: 'noopener noreferrer' }
                              : {})}
                          >
                            {item.content}
                          </a>
                        ) : (
                          <p className="text-gray-800 font-medium">{item.content}</p>
                        )}
                      </div>
                    </div>
                  ))}

                {/* Social links */}
                {(settings.facebook ||
                  settings.instagram ||
                  settings.twitter ||
                  settings.youtube ||
                  settings.linkedin_url) && (
                  <div className="pt-4 border-t border-gray-100">
                    <p className="text-xs text-gray-400 font-medium mb-3">Réseaux sociaux</p>
                    <div className="flex gap-3 flex-wrap">
                      {settings.facebook && (
                        <a
                          href={settings.facebook}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="w-9 h-9 rounded-lg flex items-center justify-center bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors"
                        >
                          <Facebook className="w-4 h-4" />
                        </a>
                      )}
                      {settings.instagram && (
                        <a
                          href={settings.instagram}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="w-9 h-9 rounded-lg flex items-center justify-center bg-pink-50 text-pink-600 hover:bg-pink-100 transition-colors"
                        >
                          <Instagram className="w-4 h-4" />
                        </a>
                      )}
                      {settings.twitter && (
                        <a
                          href={settings.twitter}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="w-9 h-9 rounded-lg flex items-center justify-center bg-sky-50 text-sky-600 hover:bg-sky-100 transition-colors"
                        >
                          <Twitter className="w-4 h-4" />
                        </a>
                      )}
                      {settings.youtube && (
                        <a
                          href={settings.youtube}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="w-9 h-9 rounded-lg flex items-center justify-center bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
                        >
                          <Youtube className="w-4 h-4" />
                        </a>
                      )}
                      {settings.linkedin_url && (
                        <a
                          href={settings.linkedin_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="w-9 h-9 rounded-lg flex items-center justify-center bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors"
                        >
                          <Linkedin className="w-4 h-4" />
                        </a>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Horaires + CTA */}
              <div className="space-y-5">
                {settings.opening_hours && (
                  <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
                    <div className="flex items-center gap-2 mb-4">
                      <Clock className="w-5 h-5" style={{ color: navyColor }} />
                      <h3 className="font-semibold text-gray-900">Horaires d'ouverture</h3>
                    </div>
                    <p className="text-sm text-gray-600 whitespace-pre-line leading-relaxed">
                      {settings.opening_hours}
                    </p>
                  </div>
                )}

                <div
                  className="rounded-2xl p-6 text-white"
                  style={{ backgroundColor: navyColor }}
                >
                  <Shield className="w-8 h-8 mb-3" style={{ color: goldColor }} />
                  <h3 className="font-bold text-lg mb-2">Candidater maintenant</h3>
                  <p className="text-white/70 text-sm mb-5 leading-relaxed">
                    Rejoignez notre établissement et bénéficiez d'une formation académique
                    d'excellence.
                  </p>
                  <Link
                    to={`/admissions/${slug}`}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg font-semibold text-sm transition-opacity hover:opacity-90"
                    style={{ backgroundColor: goldColor }}
                  >
                    Déposer ma candidature
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                </div>

                {/* Map placeholder */}
                <div
                  className="rounded-2xl overflow-hidden border border-gray-200 shadow-sm"
                  style={{ height: '200px' }}
                >
                  <div
                    className="w-full h-full flex flex-col items-center justify-center gap-2"
                    style={{ backgroundColor: `${navyColor}08` }}
                  >
                    <MapPin className="w-8 h-8 text-gray-300" />
                    <p className="text-sm text-gray-400">
                      {tenant.address || 'Voir sur la carte'}
                    </p>
                    {tenant.address && (
                      <a
                        href={`https://maps.google.com/?q=${encodeURIComponent(tenant.address)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-medium underline"
                        style={{ color: navyColor }}
                      >
                        Ouvrir dans Google Maps
                      </a>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </section>
        </main>

        {/* ─── FOOTER ──────────────────────────────────────────────── */}
        <footer style={{ backgroundColor: navyColor }} className="text-white mt-20">
          {/* Gold top strip */}
          <div className="h-1" style={{ backgroundColor: goldColor }} />
          <div className="container mx-auto px-4 py-12">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
              {/* Brand */}
              <div className="md:col-span-2">
                <div className="flex items-center gap-3 mb-4">
                  {settings.logo_url ? (
                    <img
                      src={settings.logo_url}
                      alt={tenant.name}
                      className="h-12 w-auto object-contain"
                    />
                  ) : (
                    <div
                      className="h-12 w-12 rounded-lg flex items-center justify-center text-white font-bold text-xl"
                      style={{ backgroundColor: `${goldColor}30` }}
                    >
                      {tenant.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div>
                    <p className="font-bold text-lg">{tenant.name}</p>
                    {settings.founded_year && (
                      <p className="text-white/50 text-xs">Fondé en {settings.founded_year}</p>
                    )}
                  </div>
                </div>
                {settings.school_motto && (
                  <p className="text-white/50 text-sm italic max-w-sm">"{settings.school_motto}"</p>
                )}
              </div>

              {/* Navigation */}
              <div>
                <h4
                  className="font-semibold mb-4 text-sm uppercase tracking-wider"
                  style={{ color: goldColor }}
                >
                  Navigation
                </h4>
                <ul className="space-y-2">
                  {navLinks.map((link) => (
                    <li key={link.label}>
                      <Link
                        to={link.href}
                        className="text-white/60 hover:text-white text-sm transition-colors"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Legal */}
              <div>
                <h4
                  className="font-semibold mb-4 text-sm uppercase tracking-wider"
                  style={{ color: goldColor }}
                >
                  Légal
                </h4>
                <ul className="space-y-2">
                  <li>
                    <Link
                      to="/terms"
                      className="text-white/60 hover:text-white text-sm transition-colors"
                    >
                      CGU
                    </Link>
                  </li>
                  <li>
                    <Link
                      to="/privacy"
                      className="text-white/60 hover:text-white text-sm transition-colors"
                    >
                      Politique de confidentialité
                    </Link>
                  </li>
                </ul>
              </div>
            </div>

            <div className="border-t border-white/10 pt-8 flex flex-col sm:flex-row items-center justify-between gap-3">
              <p className="text-white/40 text-sm">
                © {new Date().getFullYear()} {tenant.name}. Tous droits réservés.
              </p>
              <p className="text-white/30 text-xs">Propulsé par SchoolFlow Pro</p>
            </div>
          </div>
        </footer>
      </div>
    </>
  );
};
