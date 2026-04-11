import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import {
  GraduationCap,
  Users,
  BookOpen,
  LogIn,
  UserPlus,
  MapPin,
  Mail,
  Phone,
  Globe,
  Menu,
  X,
  Award,
  Bell,
  Pin,
  Facebook,
  Instagram,
  Twitter,
  Youtube,
  ChevronRight,
  Calendar,
  ArrowRight,
  Clock,
  Star,
  Linkedin,
} from 'lucide-react';
import type { TenantPublicResponse, TenantLandingSettings } from '@/types/tenant';
import { resolveUploadUrl } from "@/utils/url";

interface LandingTemplateProps {
  tenant: TenantPublicResponse;
  settings: TenantLandingSettings;
}

export const DefaultLandingTemplate = ({ tenant, settings }: LandingTemplateProps) => {
  const [mobileOpen, setMobileOpen] = useState(false);
  const slug = tenant.slug;

  const primaryColor = settings.primary_color || '#1e3a5f';
  const secondaryColor = settings.secondary_color || '#4a90d9';

  const pinnedAnnouncements = settings.announcements.filter((a) => a.is_pinned);
  const unpinnedAnnouncements = settings.announcements.filter((a) => !a.is_pinned);
  const allAnnouncements = [...pinnedAnnouncements, ...unpinnedAnnouncements];

  const navLinks = [
    { label: 'Accueil', href: `/ecole/${slug}` },
    { label: 'Programmes', href: `/ecole/${slug}#programmes` },
    { label: 'Annonces', href: `/ecole/${slug}#annonces` },
    { label: 'Contact', href: `/ecole/${slug}#contact` },
  ];

  const loginUrl = `/${slug}/login`;

  return (
    <>
      <Helmet>
        <title>{tenant.name} — SchoolFlow Pro</title>
        <meta
          name="description"
          content={
            settings.description ||
            settings.tagline ||
            `Bienvenue sur la page officielle de ${tenant.name}.`
          }
        />
        <meta property="og:title" content={tenant.name} />
        <meta
          property="og:description"
          content={settings.description || settings.tagline || ''}
        />
        {settings.logo_url && <meta property="og:image" content={settings.logo_url} />}
        <meta name="theme-color" content={primaryColor} />
      </Helmet>

      <div className="min-h-screen bg-gray-50">
        {/* ─── NAVBAR ─────────────────────────────────────────────── */}
        <nav
          className="sticky top-0 z-50 bg-white shadow-sm border-b"
          style={{ borderBottomColor: `${primaryColor}22` }}
        >
          <div className="container mx-auto px-4">
            <div className="flex items-center justify-between h-16">
              {/* Logo + Name */}
              <Link to={`/ecole/${slug}`} className="flex items-center gap-3 min-w-0">
                {settings.logo_url ? (
                  <img
                    src={resolveUploadUrl(settings.logo_url)}
                    alt={tenant.name}
                    className="h-10 w-10 rounded-lg object-contain flex-shrink-0"
                  />
                ) : (
                  <div
                    className="h-10 w-10 rounded-lg flex items-center justify-center flex-shrink-0 text-white font-bold text-lg"
                    style={{ backgroundColor: primaryColor }}
                  >
                    {tenant.name.charAt(0).toUpperCase()}
                  </div>
                )}
                <span
                  className="font-bold text-lg hidden sm:block truncate"
                  style={{ color: primaryColor }}
                >
                  {tenant.name}
                </span>
              </Link>

              {/* Desktop nav links */}
              <div className="hidden lg:flex items-center gap-1">
                {navLinks.map((link) => (
                  <a
                    key={link.label}
                    href={link.href}
                    className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-colors"
                  >
                    {link.label}
                  </a>
                ))}
                <a
                  href={loginUrl}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-colors"
                >
                  Espace connexion
                </a>
              </div>

              {/* CTA buttons */}
              <div className="hidden sm:flex items-center gap-2">
                <Link
                  to={`/admissions/${slug}`}
                  className="px-4 py-2 rounded-lg text-sm font-semibold text-white transition-opacity hover:opacity-90"
                  style={{ backgroundColor: primaryColor }}
                >
                  Pré-inscription
                </Link>
                <a
                  href={loginUrl}
                  className="px-4 py-2 rounded-lg text-sm font-medium border transition-colors hover:bg-gray-50"
                  style={{ color: primaryColor, borderColor: primaryColor }}
                >
                  <LogIn className="w-4 h-4 inline mr-1" />
                  Connexion
                </a>
              </div>

              {/* Mobile hamburger */}
              <button
                className="lg:hidden p-2 rounded-lg hover:bg-gray-100 transition-colors"
                onClick={() => setMobileOpen(!mobileOpen)}
                aria-label="Menu"
              >
                {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>
            </div>

            {/* Mobile menu */}
            {mobileOpen && (
              <div className="lg:hidden py-4 border-t border-gray-100 space-y-1">
                {navLinks.map((link) => (
                  <a
                    key={link.label}
                    href={link.href}
                    className="block px-4 py-3 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-100"
                    onClick={() => setMobileOpen(false)}
                  >
                    {link.label}
                  </a>
                ))}
                <a
                  href={loginUrl}
                  className="block px-4 py-3 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-100"
                  onClick={() => setMobileOpen(false)}
                >
                  Espace connexion
                </a>
                <div className="pt-3 border-t border-gray-100 flex flex-col gap-2">
                  <Link
                    to={`/admissions/${slug}`}
                    className="block px-4 py-3 rounded-lg text-sm font-semibold text-white text-center"
                    style={{ backgroundColor: primaryColor }}
                    onClick={() => setMobileOpen(false)}
                  >
                    Pré-inscription
                  </Link>
                  <a
                    href={loginUrl}
                    className="block px-4 py-3 rounded-lg text-sm font-medium text-center border"
                    style={{ color: primaryColor, borderColor: primaryColor }}
                    onClick={() => setMobileOpen(false)}
                  >
                    Se connecter
                  </a>
                </div>
              </div>
            )}
          </div>
        </nav>

        {/* ─── HERO ────────────────────────────────────────────────── */}
        <header
          className="relative min-h-[520px] flex items-center overflow-hidden"
          style={{
            background: settings.banner_url
              ? undefined
              : `linear-gradient(135deg, ${primaryColor} 0%, ${secondaryColor} 100%)`,
          }}
        >
          {settings.banner_url && (
            <>
              <img
                src={settings.banner_url}
                alt={`${tenant.name} banner`}
                className="absolute inset-0 w-full h-full object-cover"
              />
              <div
                className="absolute inset-0"
                style={{ backgroundColor: `${primaryColor}cc` }}
              />
            </>
          )}

          {/* Decorative circles */}
          <div className="absolute top-10 right-10 w-64 h-64 rounded-full bg-white/5 hidden lg:block" />
          <div className="absolute -bottom-16 -right-16 w-96 h-96 rounded-full bg-white/5 hidden lg:block" />

          <div className="container mx-auto px-4 py-24 relative z-10 text-center">
            {/* Logo / initials */}
            {settings.logo_url ? (
              <img
                src={resolveUploadUrl(settings.logo_url)}
                alt={tenant.name}
                className="w-24 h-24 rounded-2xl object-contain mx-auto mb-6 bg-white/20 shadow-xl p-2"
              />
            ) : (
              <div className="w-24 h-24 rounded-2xl bg-white/20 flex items-center justify-center mx-auto mb-6 shadow-xl backdrop-blur-sm">
                <span className="text-4xl font-bold text-white">
                  {tenant.name.slice(0, 2).toUpperCase()}
                </span>
              </div>
            )}

            {settings.accreditation && (
              <div className="inline-flex items-center gap-2 mb-4 px-4 py-1.5 rounded-full bg-white/20 text-white/90 text-xs font-semibold backdrop-blur-sm">
                <Award className="w-3 h-3" />
                {settings.accreditation}
              </div>
            )}

            <h1 className="text-3xl md:text-5xl lg:text-6xl font-bold text-white mb-4 drop-shadow-lg">
              {tenant.name}
            </h1>

            {settings.tagline && (
              <p className="text-lg md:text-xl text-white/90 mb-6 max-w-2xl mx-auto leading-relaxed">
                {settings.tagline}
              </p>
            )}

            {settings.school_motto && (
              <p className="text-white/70 italic text-sm mb-6">
                "{settings.school_motto}"
              </p>
            )}

            {tenant.address && (
              <div className="flex items-center justify-center gap-2 text-white/70 mb-8">
                <MapPin className="w-4 h-4 flex-shrink-0" />
                <span className="text-sm">{tenant.address}</span>
              </div>
            )}

            <div className="flex flex-wrap justify-center gap-4">
              <Link
                to={`/admissions/${slug}`}
                className="inline-flex items-center gap-2 px-8 py-3.5 rounded-xl font-semibold text-white bg-white/20 hover:bg-white/30 backdrop-blur-sm border border-white/30 transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5"
              >
                <UserPlus className="w-5 h-5" />
                Pré-inscription
              </Link>
              <a
                href={loginUrl}
                className="inline-flex items-center gap-2 px-8 py-3.5 rounded-xl font-semibold bg-white hover:bg-gray-50 transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5"
                style={{ color: primaryColor }}
              >
                <LogIn className="w-5 h-5" />
                Se connecter
              </a>
            </div>

            {/* Floating stats card */}
            {settings.show_stats && tenant.stats && (
              <div className="absolute bottom-6 right-6 hidden xl:block">
                <div className="bg-white/15 backdrop-blur-md rounded-2xl border border-white/20 p-4 text-white text-left shadow-xl">
                  <p className="text-xs text-white/70 font-medium mb-2 uppercase tracking-wider">
                    En chiffres
                  </p>
                  <div className="flex gap-6">
                    <div>
                      <p className="text-2xl font-bold">{tenant.stats.student_count}+</p>
                      <p className="text-xs text-white/70">Élèves</p>
                    </div>
                    <div>
                      <p className="text-2xl font-bold">{tenant.stats.teacher_count}</p>
                      <p className="text-xs text-white/70">Enseignants</p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </header>

        {/* ─── STATS BAR ───────────────────────────────────────────── */}
        {settings.show_stats && tenant.stats && (
          <section className="container mx-auto px-4 -mt-10 relative z-10">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                {
                  icon: <Users className="w-6 h-6" />,
                  value: `${tenant.stats.student_count}+`,
                  label: 'Étudiants',
                  color: primaryColor,
                },
                {
                  icon: <Award className="w-6 h-6" />,
                  value: `${tenant.stats.teacher_count}`,
                  label: 'Enseignants',
                  color: secondaryColor,
                },
                {
                  icon: <BookOpen className="w-6 h-6" />,
                  value: `${(tenant.programs ?? []).length}`,
                  label: 'Programmes',
                  color: '#10b981',
                },
                {
                  icon: <Calendar className="w-6 h-6" />,
                  value: settings.founded_year ? `${settings.founded_year}` : '2020',
                  label: 'Fondé en',
                  color: '#f59e0b',
                },
              ].map((stat, i) => (
                <div
                  key={i}
                  className="bg-white rounded-2xl shadow-lg p-6 flex items-center gap-4 border border-gray-100 hover:shadow-xl transition-shadow"
                >
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: `${stat.color}18`, color: stat.color }}
                  >
                    {stat.icon}
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
                    <p className="text-sm text-gray-500">{stat.label}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        <main className="container mx-auto px-4 py-16 space-y-20">
          {/* ─── DESCRIPTION ─────────────────────────────────────────── */}
          {settings.description && (
            <section className="max-w-3xl mx-auto text-center">
              <p
                className="text-sm font-semibold uppercase tracking-wider mb-3"
                style={{ color: primaryColor }}
              >
                À propos
              </p>
              <h2 className="text-3xl font-bold text-gray-900 mb-6">Notre établissement</h2>
              <p className="text-gray-600 text-lg leading-relaxed">{settings.description}</p>
            </section>
          )}

          {/* ─── PROGRAMMES ──────────────────────────────────────────── */}
          {settings.show_programs && tenant.programs && tenant.programs.length > 0 && (
            <section id="programmes">
              <div className="flex items-end justify-between mb-10">
                <div>
                  <p
                    className="text-sm font-semibold uppercase tracking-wider mb-1"
                    style={{ color: primaryColor }}
                  >
                    Formation
                  </p>
                  <h2 className="text-3xl font-bold text-gray-900">Nos Programmes</h2>
                </div>
                <Link
                  to={`/admissions/${slug}`}
                  className="hidden sm:flex items-center gap-1 text-sm font-medium hover:underline"
                  style={{ color: primaryColor }}
                >
                  Postuler <ChevronRight className="w-4 h-4" />
                </Link>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {(tenant.programs || []).map((program: any, idx) => (
                  <div
                    key={idx}
                    className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm hover:shadow-md transition-shadow group cursor-default"
                  >
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center mb-4 text-xl"
                      style={{ backgroundColor: `${primaryColor}15` }}
                    >
                      📖
                    </div>
                    <h3
                      className="font-semibold text-gray-900 mb-2 group-hover:transition-colors"
                      style={{ color: undefined }}
                    >
                      {typeof program === 'string' ? program : program.name}
                    </h3>
                    <span
                      className="inline-block text-xs font-medium px-2.5 py-1 rounded-full"
                      style={{ backgroundColor: `${primaryColor}12`, color: primaryColor }}
                    >
                      Programme
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* ─── ANNONCES ────────────────────────────────────────────── */}
          {allAnnouncements.length > 0 && (
            <section id="annonces">
              <div className="mb-10">
                <p
                  className="text-sm font-semibold uppercase tracking-wider mb-1"
                  style={{ color: primaryColor }}
                >
                  Informations
                </p>
                <h2 className="text-3xl font-bold text-gray-900">Annonces</h2>
              </div>

              <div className="space-y-4">
                {allAnnouncements.slice(0, 5).map((ann, i) => (
                  <div
                    key={ann.id ?? i}
                    className={`bg-white rounded-2xl p-6 border shadow-sm flex gap-4 transition-shadow hover:shadow-md ${
                      ann.is_pinned
                        ? 'border-yellow-200 bg-yellow-50/50'
                        : 'border-gray-100'
                    }`}
                  >
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5"
                      style={{
                        backgroundColor: ann.is_pinned ? '#fef3c7' : `${primaryColor}18`,
                        color: ann.is_pinned ? '#d97706' : primaryColor,
                      }}
                    >
                      {ann.is_pinned ? (
                        <Pin className="w-5 h-5" />
                      ) : (
                        <Bell className="w-5 h-5" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2 flex-wrap mb-2">
                        <h3 className="font-semibold text-gray-900">{ann.title}</h3>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {ann.is_pinned && (
                            <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full font-medium">
                              Épinglé
                            </span>
                          )}
                          {ann.category && (
                            <span
                              className="text-xs px-2 py-0.5 rounded-full font-medium"
                              style={{
                                backgroundColor: `${primaryColor}18`,
                                color: primaryColor,
                              }}
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
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* ─── GALERIE ─────────────────────────────────────────────── */}
          {settings.show_gallery && settings.gallery.length > 0 && (
            <section>
              <div className="mb-10">
                <p
                  className="text-sm font-semibold uppercase tracking-wider mb-1"
                  style={{ color: primaryColor }}
                >
                  Photos
                </p>
                <h2 className="text-3xl font-bold text-gray-900">Notre Galerie</h2>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {settings.gallery.map((url, i) => (
                  <div
                    key={i}
                    className="rounded-2xl overflow-hidden bg-gray-100 group"
                    style={{ aspectRatio: '16/9' }}
                  >
                    <img
                      src={url}
                      alt={`${tenant.name} photo ${i + 1}`}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
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
              <p
                className="text-sm font-semibold uppercase tracking-wider mb-1"
                style={{ color: primaryColor }}
              >
                Nous trouver
              </p>
              <h2 className="text-3xl font-bold text-gray-900">Contact</h2>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
              {/* Contact info card */}
              <div className="bg-white rounded-2xl p-8 border border-gray-100 shadow-sm space-y-5">
                {tenant.address && (
                  <div className="flex items-start gap-4">
                    <div
                      className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: `${primaryColor}18`, color: primaryColor }}
                    >
                      <MapPin className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-400 mb-0.5">Adresse</p>
                      <p className="text-gray-800">{tenant.address}</p>
                    </div>
                  </div>
                )}
                {(tenant.phone || settings.contact_phone) && (
                  <div className="flex items-start gap-4">
                    <div
                      className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: `${primaryColor}18`, color: primaryColor }}
                    >
                      <Phone className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-400 mb-0.5">Téléphone</p>
                      <a
                        href={`tel:${tenant.phone || settings.contact_phone}`}
                        className="hover:underline font-medium"
                        style={{ color: primaryColor }}
                      >
                        {tenant.phone || settings.contact_phone}
                      </a>
                    </div>
                  </div>
                )}
                {(tenant.email || settings.contact_email) && (
                  <div className="flex items-start gap-4">
                    <div
                      className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: `${primaryColor}18`, color: primaryColor }}
                    >
                      <Mail className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-400 mb-0.5">Email</p>
                      <a
                        href={`mailto:${tenant.email || settings.contact_email}`}
                        className="hover:underline font-medium"
                        style={{ color: primaryColor }}
                      >
                        {tenant.email || settings.contact_email}
                      </a>
                    </div>
                  </div>
                )}
                {tenant.website && (
                  <div className="flex items-start gap-4">
                    <div
                      className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: `${primaryColor}18`, color: primaryColor }}
                    >
                      <Globe className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-400 mb-0.5">Site web</p>
                      <a
                        href={tenant.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:underline font-medium"
                        style={{ color: primaryColor }}
                      >
                        {tenant.website.replace(/^https?:\/\//, '')}
                      </a>
                    </div>
                  </div>
                )}
                {settings.opening_hours && (
                  <div className="flex items-start gap-4">
                    <div
                      className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: `${primaryColor}18`, color: primaryColor }}
                    >
                      <Clock className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-400 mb-0.5">Horaires</p>
                      <p className="text-gray-800 whitespace-pre-line text-sm">
                        {settings.opening_hours}
                      </p>
                    </div>
                  </div>
                )}

                {/* Social links */}
                {(settings.facebook ||
                  settings.facebook_url ||
                  settings.instagram ||
                  settings.twitter ||
                  settings.twitter_url ||
                  settings.youtube ||
                  settings.linkedin_url) && (
                  <div className="pt-4 border-t border-gray-100">
                    <p className="text-sm font-medium text-gray-400 mb-3">Réseaux sociaux</p>
                    <div className="flex gap-3 flex-wrap">
                      {(settings.facebook || settings.facebook_url) && (
                        <a
                          href={settings.facebook || settings.facebook_url || '#'}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="w-10 h-10 rounded-xl flex items-center justify-center bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors"
                          aria-label="Facebook"
                        >
                          <Facebook className="w-5 h-5" />
                        </a>
                      )}
                      {settings.instagram && (
                        <a
                          href={settings.instagram}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="w-10 h-10 rounded-xl flex items-center justify-center bg-pink-50 text-pink-600 hover:bg-pink-100 transition-colors"
                          aria-label="Instagram"
                        >
                          <Instagram className="w-5 h-5" />
                        </a>
                      )}
                      {(settings.twitter || settings.twitter_url) && (
                        <a
                          href={settings.twitter || settings.twitter_url || '#'}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="w-10 h-10 rounded-xl flex items-center justify-center bg-sky-50 text-sky-500 hover:bg-sky-100 transition-colors"
                          aria-label="Twitter / X"
                        >
                          <Twitter className="w-5 h-5" />
                        </a>
                      )}
                      {settings.youtube && (
                        <a
                          href={settings.youtube}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="w-10 h-10 rounded-xl flex items-center justify-center bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
                          aria-label="YouTube"
                        >
                          <Youtube className="w-5 h-5" />
                        </a>
                      )}
                      {settings.linkedin_url && (
                        <a
                          href={settings.linkedin_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="w-10 h-10 rounded-xl flex items-center justify-center bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors"
                          aria-label="LinkedIn"
                        >
                          <Linkedin className="w-5 h-5" />
                        </a>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* CTA card */}
              <div className="space-y-6">
                <div
                  className="rounded-2xl p-8 text-white"
                  style={{
                    background: `linear-gradient(135deg, ${primaryColor} 0%, ${secondaryColor} 100%)`,
                  }}
                >
                  <Star className="w-8 h-8 text-white/60 mb-4" />
                  <h3 className="text-2xl font-bold mb-2">Rejoindre {tenant.name}</h3>
                  <p className="text-white/80 text-sm mb-6 leading-relaxed">
                    Commencez votre parcours académique en déposant votre candidature en ligne.
                    Notre équipe vous accompagne à chaque étape.
                  </p>
                  <Link
                    to={`/admissions/${slug}`}
                    className="inline-flex items-center gap-2 px-6 py-3 bg-white rounded-xl font-semibold hover:bg-gray-50 transition-colors shadow-sm"
                    style={{ color: primaryColor }}
                  >
                    Faire une demande d'admission
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                </div>

                {settings.features && settings.features.length > 0 && (
                  <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
                    <h3 className="font-semibold text-gray-900 mb-4">Nos atouts</h3>
                    <ul className="space-y-3">
                      {settings.features.slice(0, 5).map((feat, i) => (
                        <li key={i} className="flex items-center gap-3 text-sm text-gray-700">
                          <div
                            className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0"
                            style={{ backgroundColor: `${primaryColor}20`, color: primaryColor }}
                          >
                            <ChevronRight className="w-3 h-3" />
                          </div>
                          {feat}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          </section>
        </main>

        {/* ─── FOOTER ──────────────────────────────────────────────── */}
        <footer style={{ backgroundColor: primaryColor }} className="text-white mt-20">
          <div className="container mx-auto px-4 py-12">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-10">
              {/* Brand */}
              <div>
                <div className="flex items-center gap-3 mb-4">
                  {settings.logo_url ? (
                    <img
                      src={resolveUploadUrl(settings.logo_url)}
                      alt={tenant.name}
                      className="h-10 w-10 rounded-lg object-contain bg-white/20 p-1"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-lg bg-white/20 flex items-center justify-center font-bold text-lg">
                      {tenant.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <span className="font-bold text-lg">{tenant.name}</span>
                </div>
                {settings.school_motto && (
                  <p className="text-white/70 text-sm italic mb-3">"{settings.school_motto}"</p>
                )}
                {settings.accreditation && (
                  <p className="text-white/50 text-xs">{settings.accreditation}</p>
                )}
              </div>

              {/* Quick links */}
              <div>
                <h4 className="font-semibold mb-4 text-white/90">Liens rapides</h4>
                <ul className="space-y-2">
                  {navLinks.map((link) => (
                    <li key={link.label}>
                      <Link
                        to={link.href}
                        className="text-white/70 hover:text-white text-sm transition-colors"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                  <li>
                    <Link
                      to={`/admissions/${slug}`}
                      className="text-white/70 hover:text-white text-sm transition-colors"
                    >
                      Pré-inscription
                    </Link>
                  </li>
                </ul>
              </div>

              {/* Legal */}
              <div>
                <h4 className="font-semibold mb-4 text-white/90">Informations légales</h4>
                <ul className="space-y-2">
                  <li>
                    <Link
                      to="/terms"
                      className="text-white/70 hover:text-white text-sm transition-colors"
                    >
                      Conditions générales d'utilisation
                    </Link>
                  </li>
                  <li>
                    <Link
                      to="/privacy"
                      className="text-white/70 hover:text-white text-sm transition-colors"
                    >
                      Politique de confidentialité
                    </Link>
                  </li>
                </ul>
              </div>
            </div>

            <div className="border-t border-white/10 pt-8 flex flex-col sm:flex-row items-center justify-between gap-4">
              <p className="text-white/60 text-sm">
                © {new Date().getFullYear()} {tenant.name}. Tous droits réservés.
              </p>
              <p className="text-white/40 text-xs">Propulsé par SchoolFlow Pro</p>
            </div>
          </div>
        </footer>
      </div>
    </>
  );
};
