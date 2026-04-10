import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import {
  GraduationCap,
  LogIn,
  Menu,
  X,
  UserPlus,
  BookOpen,
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
  ArrowRight,
  Calendar,
  Star,
  Linkedin,
  Lightbulb,
  Trophy,
  Search,
  Globe2,
  Building,
  Clock,
} from 'lucide-react';
import type { TenantPublicResponse, TenantLandingSettings } from '@/types/tenant';
import { resolveUploadUrl } from "@/utils/url";

interface LandingTemplateProps {
  tenant: TenantPublicResponse;
  settings: TenantLandingSettings;
}

export const UniversityTemplate = ({ tenant, settings }: LandingTemplateProps) => {
  const [mobileOpen, setMobileOpen] = useState(false);
  const slug = tenant.slug;

  // Deep purple/prestigious university palette
  const deepColor = settings.primary_color || '#2d1b69';
  const accentColor = settings.secondary_color || '#7c3aed';
  const goldColor = '#f59e0b';

  const pinnedAnnouncements = settings.announcements.filter((a) => a.is_pinned);
  const unpinnedAnnouncements = settings.announcements.filter((a) => !a.is_pinned);
  const allAnnouncements = [...pinnedAnnouncements, ...unpinnedAnnouncements];

  const programs = tenant.programs || [];
  const departments = (tenant as any).departments || [];

  const navLinks = [
    { label: 'Formations', href: `#programmes` },
    { label: 'Recherche', href: `#recherche` },
    { label: 'Campus', href: `#contact` },
    { label: 'International', href: `#` },
    { label: 'Vie étudiante', href: `#` },
  ];

  const currentYear = new Date().getFullYear();

  return (
    <>
      <Helmet>
        <title>{tenant.name} — Université / Enseignement supérieur</title>
        <meta
          name="description"
          content={
            settings.description ||
            settings.tagline ||
            `${tenant.name} — Excellence académique, recherche et innovation.`
          }
        />
        <meta property="og:title" content={tenant.name} />
        {settings.logo_url && <meta property="og:image" content={settings.logo_url} />}
        <meta name="theme-color" content={deepColor} />
      </Helmet>

      <div className="min-h-screen bg-gray-50">
        {/* ─── TOP CONTACT BAR ─────────────────────────────────────── */}
        <div className="bg-gray-900 text-gray-400 text-xs py-2 hidden sm:block">
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
              {tenant.address && (
                <span className="flex items-center gap-1.5">
                  <MapPin className="w-3 h-3" />
                  {tenant.address}
                </span>
              )}
            </div>
            <div className="flex items-center gap-4">
              {settings.accreditation && (
                <span className="text-gray-500 italic">{settings.accreditation}</span>
              )}
              <span className="text-gray-500">
                Année académique {currentYear}/{currentYear + 1}
              </span>
            </div>
          </div>
        </div>

        {/* ─── STICKY NAVBAR ───────────────────────────────────────── */}
        <nav className="sticky top-0 z-50 bg-white shadow-md border-b border-gray-100">
          <div className="container mx-auto px-4">
            <div className="flex items-center justify-between h-20">
              {/* Logo + Name */}
              <Link to={`/ecole/${slug}`} className="flex items-center gap-4">
                {settings.logo_url ? (
                  <img
                    src={resolveUploadUrl(settings.logo_url)}
                    alt={tenant.name}
                    className="h-14 w-auto object-contain"
                  />
                ) : (
                  <div
                    className="h-14 w-14 rounded-xl flex items-center justify-center text-white"
                    style={{ backgroundColor: deepColor }}
                  >
                    <GraduationCap className="w-8 h-8" />
                  </div>
                )}
                <div className="hidden md:block">
                  <p className="font-bold text-lg leading-tight" style={{ color: deepColor }}>
                    {tenant.name}
                  </p>
                  {settings.founded_year && (
                    <p className="text-xs text-gray-400">
                      Fondée en {settings.founded_year} — Excellence & Innovation
                    </p>
                  )}
                </div>
              </Link>

              {/* Desktop nav */}
              <div className="hidden xl:flex items-center gap-1">
                {navLinks.map((link) => (
                  <a
                    key={link.label}
                    href={link.href}
                    className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-colors"
                  >
                    {link.label}
                  </a>
                ))}
              </div>

              {/* CTA */}
              <div className="hidden sm:flex items-center gap-3">
                <Link
                  to={`/admissions/${slug}`}
                  className="px-5 py-2.5 rounded-lg text-sm font-semibold text-white transition-opacity hover:opacity-90 shadow-sm"
                  style={{ backgroundColor: deepColor }}
                >
                  <UserPlus className="w-4 h-4 inline mr-1.5" />
                  Candidater
                </Link>
                <Link
                  to={`/${slug}/student`}
                  className="px-5 py-2.5 rounded-lg text-sm font-medium border-2 hover:bg-gray-50 transition-colors"
                  style={{ color: deepColor, borderColor: deepColor }}
                >
                  <LogIn className="w-4 h-4 inline mr-1" />
                  Espace étudiant
                </Link>
              </div>

              {/* Mobile hamburger */}
              <button
                className="xl:hidden p-2 rounded-lg hover:bg-gray-100 transition-colors"
                onClick={() => setMobileOpen(!mobileOpen)}
              >
                {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>
            </div>

            {/* Mobile menu */}
            {mobileOpen && (
              <div className="xl:hidden py-4 border-t border-gray-100 space-y-1">
                {navLinks.map((link) => (
                  <a
                    key={link.label}
                    href={link.href}
                    className="block px-4 py-3 rounded-lg text-sm text-gray-700 hover:bg-gray-100"
                    onClick={() => setMobileOpen(false)}
                  >
                    {link.label}
                  </a>
                ))}
                <div className="pt-3 border-t border-gray-100 space-y-2">
                  <Link
                    to={`/admissions/${slug}`}
                    className="block px-4 py-3 rounded-lg text-sm font-semibold text-white text-center"
                    style={{ backgroundColor: deepColor }}
                    onClick={() => setMobileOpen(false)}
                  >
                    Candidater
                  </Link>
                  <Link
                    to={`/${slug}/student`}
                    className="block px-4 py-3 rounded-lg text-sm font-medium text-center border-2"
                    style={{ color: deepColor, borderColor: deepColor }}
                    onClick={() => setMobileOpen(false)}
                  >
                    Espace étudiant
                  </Link>
                </div>
              </div>
            )}
          </div>
        </nav>

        {/* ─── HERO ────────────────────────────────────────────────── */}
        <header
          className="relative min-h-[600px] flex items-center overflow-hidden"
          style={{
            background: settings.banner_url
              ? undefined
              : `linear-gradient(135deg, ${deepColor} 0%, ${accentColor} 60%, #1d1b8a 100%)`,
          }}
        >
          {settings.banner_url && (
            <>
              <img
                src={settings.banner_url}
                alt={tenant.name}
                className="absolute inset-0 w-full h-full object-cover"
              />
              <div
                className="absolute inset-0"
                style={{
                  background: `linear-gradient(135deg, ${deepColor}e0 0%, ${accentColor}90 100%)`,
                }}
              />
            </>
          )}

          {/* Decorative pattern */}
          <div className="absolute inset-0 opacity-5">
            <div
              className="absolute inset-0"
              style={{
                backgroundImage:
                  'radial-gradient(circle at 2px 2px, white 1px, transparent 0)',
                backgroundSize: '40px 40px',
              }}
            />
          </div>

          {/* Decorative circles */}
          <div className="absolute -top-24 -right-24 w-96 h-96 rounded-full border border-white/10 hidden lg:block" />
          <div className="absolute top-12 -right-12 w-64 h-64 rounded-full border border-white/10 hidden lg:block" />

          <div className="container mx-auto px-4 py-28 md:py-40 relative z-10">
            <div className="max-w-4xl">
              {settings.accreditation && (
                <div className="inline-flex items-center gap-2 mb-6 px-4 py-1.5 rounded-full border border-white/20 text-white/80 text-xs font-semibold backdrop-blur-sm">
                  <Award className="w-3 h-3" />
                  {settings.accreditation}
                </div>
              )}

              <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold text-white mb-6 leading-tight">
                {tenant.name}
              </h1>

              {settings.tagline && (
                <p className="text-xl md:text-2xl text-white/85 mb-6 max-w-2xl leading-relaxed">
                  {settings.tagline}
                </p>
              )}

              {settings.school_motto && (
                <p className="text-white/60 italic text-base mb-10 border-l-4 pl-5 max-w-lg" style={{ borderColor: goldColor }}>
                  "{settings.school_motto}"
                </p>
              )}

              <div className="flex flex-wrap gap-4">
                <Link
                  to={`/admissions/${slug}`}
                  className="inline-flex items-center gap-2 px-10 py-4 rounded-xl font-semibold text-white bg-white/20 hover:bg-white/30 backdrop-blur-sm border border-white/30 transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5"
                >
                  <UserPlus className="w-5 h-5" />
                  Candidater {currentYear}/{currentYear + 1}
                </Link>
                <Link
                  to={`/${slug}/student`}
                  className="inline-flex items-center gap-2 px-10 py-4 rounded-xl font-semibold bg-white hover:bg-gray-50 transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5"
                  style={{ color: deepColor }}
                >
                  <LogIn className="w-5 h-5" />
                  Espace étudiant
                </Link>
              </div>
            </div>
          </div>
        </header>

        {/* ─── MISSION STATEMENT ───────────────────────────────────── */}
        <section className="py-20 bg-white">
          <div className="container mx-auto px-4">
            <div className="max-w-3xl mx-auto text-center mb-16">
              <p className="text-sm font-semibold uppercase tracking-widest mb-3" style={{ color: accentColor }}>
                Notre Mission
              </p>
              {settings.description ? (
                <blockquote className="text-2xl md:text-3xl font-light text-gray-700 leading-relaxed italic">
                  "{settings.description}"
                </blockquote>
              ) : (
                <blockquote className="text-2xl md:text-3xl font-light text-gray-700 leading-relaxed italic">
                  "Former les esprits de demain, cultiver l'excellence académique et contribuer à l'avancement du savoir."
                </blockquote>
              )}
            </div>

            {/* 3 Pillars */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {[
                {
                  icon: <Trophy className="w-8 h-8" />,
                  title: 'Excellence',
                  desc: 'Un enseignement de haut niveau dispensé par des professeurs reconnus dans leurs domaines respectifs.',
                  color: goldColor,
                },
                {
                  icon: <Lightbulb className="w-8 h-8" />,
                  title: 'Innovation',
                  desc: 'Des laboratoires de recherche et des programmes innovants pour préparer les étudiants aux défis de demain.',
                  color: accentColor,
                },
                {
                  icon: <Globe2 className="w-8 h-8" />,
                  title: 'Diversité',
                  desc: 'Un campus ouvert sur le monde, favorisant l\'échange interculturel et les partenariats internationaux.',
                  color: '#10b981',
                },
              ].map((pillar, i) => (
                <div
                  key={i}
                  className="text-center p-8 rounded-2xl border border-gray-100 hover:shadow-lg transition-shadow"
                >
                  <div
                    className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-5"
                    style={{ backgroundColor: `${pillar.color}15`, color: pillar.color }}
                  >
                    {pillar.icon}
                  </div>
                  <h3 className="text-xl font-bold text-gray-900 mb-3">{pillar.title}</h3>
                  <p className="text-gray-500 leading-relaxed text-sm">{pillar.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ─── FORMATIONS / PROGRAMMES ─────────────────────────────── */}
        {settings.show_programs && tenant.programs && tenant.programs.length > 0 && (
          <section id="programmes" className="py-20 bg-gray-50">
            <div className="container mx-auto px-4">
              <div className="flex items-end justify-between mb-12">
                <div>
                  <p
                    className="text-sm font-semibold uppercase tracking-widest mb-3"
                    style={{ color: accentColor }}
                  >
                    Formations & Cycles
                  </p>
                  <h2 className="text-4xl font-bold text-gray-900">Nos Programmes</h2>
                  <p className="text-gray-500 mt-2">
                    Découvrez nos filières et cycles de formation
                  </p>
                </div>
                <Link
                  to={`/admissions/${slug}`}
                  className="hidden sm:flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold text-white transition-opacity hover:opacity-90"
                  style={{ backgroundColor: deepColor }}
                >
                  Candidater <ArrowRight className="w-4 h-4" />
                </Link>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {programs.map((program: any, idx) => (
                  <div
                    key={idx}
                    className="bg-white rounded-2xl overflow-hidden border border-gray-100 shadow-sm hover:shadow-xl transition-shadow group"
                  >
                    {/* Color strip */}
                    <div className="h-2 w-full" style={{ backgroundColor: deepColor }} />
                    <div className="p-6">
                      {/* Level badge */}
                      <div className="flex items-center justify-between mb-4">
                        <span
                          className="text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-full"
                          style={{ backgroundColor: `${accentColor}15`, color: accentColor }}
                        >
                          Cycle académique
                        </span>
                        <div
                          className="w-8 h-8 rounded-lg flex items-center justify-center"
                          style={{ backgroundColor: `${deepColor}10`, color: deepColor }}
                        >
                          <BookOpen className="w-4 h-4" />
                        </div>
                      </div>

                      <h3 className="font-bold text-gray-900 text-lg mb-3 group-hover:text-purple-700 transition-colors">
                        {typeof program === 'string' ? program : program.name}
                      </h3>

                      <p className="text-sm text-gray-500 mb-5 leading-relaxed">
                        Programme complet conçu pour répondre aux exigences du marché du travail
                        et préparer les étudiants à l'excellence professionnelle.
                      </p>

                      <Link
                        to={`/admissions/${slug}`}
                        className="flex items-center gap-2 text-sm font-semibold group-hover:gap-3 transition-all"
                        style={{ color: accentColor }}
                      >
                        En savoir plus <ChevronRight className="w-4 h-4" />
                      </Link>
                    </div>
                  </div>
                ))}
              </div>

              {/* Departments Section (Filiaires) */}
              {departments.length > 0 && (
                <div className="mt-20">
                  <div className="mb-10 text-center">
                    <h3 className="text-3xl font-bold text-gray-900 mb-4">Départements et Filières</h3>
                    <p className="text-gray-500 max-w-2xl mx-auto">
                      Notre structure académique est organisée en départements spécialisés pour offrir une expertise approfondie.
                    </p>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {departments.map((dept: any) => (
                      <div key={dept.id} className="bg-white p-8 rounded-3xl border border-gray-100 shadow-sm">
                        <div className="flex items-center gap-4 mb-6">
                          <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-gray-50 text-gray-400">
                            <Building className="w-6 h-6" />
                          </div>
                          <div>
                            <h4 className="text-xl font-bold text-gray-900">{dept.name}</h4>
                            <p className="text-sm text-gray-500">{dept.description || 'Pôle d\'excellence académique'}</p>
                          </div>
                        </div>
                        <div className="space-y-3">
                          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Filières disponibles</p>
                          <div className="flex flex-wrap gap-2">
                            {dept.subjects && dept.subjects.length > 0 ? (
                              dept.subjects.map((sub: any) => (
                                <span key={sub.id} className="px-3 py-1.5 rounded-lg bg-gray-50 text-gray-700 text-sm border border-gray-100 italic">
                                  {sub.name}
                                </span>
                              ))
                            ) : (
                              <span className="text-sm text-gray-400 italic">Consultez le guide des formations pour plus de détails.</span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {/* ─── STATISTICS ──────────────────────────────────────────── */}
        {settings.show_stats && tenant.stats && (
          <section
            className="py-20 text-white relative overflow-hidden"
            style={{ background: `linear-gradient(135deg, ${deepColor} 0%, ${accentColor} 100%)` }}
          >
            {/* Pattern */}
            <div className="absolute inset-0 opacity-5">
              <div
                className="absolute inset-0"
                style={{
                  backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)',
                  backgroundSize: '30px 30px',
                }}
              />
            </div>

            <div className="container mx-auto px-4 relative z-10">
              <div className="text-center mb-16">
                <p className="text-white/60 text-sm font-semibold uppercase tracking-widest mb-3">
                  Notre université en chiffres
                </p>
                <h2 className="text-4xl font-bold">L'Excellence en Données</h2>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
                {[
                  {
                    icon: <Users className="w-8 h-8" />,
                    value: `${tenant.stats.student_count}+`,
                    label: 'Étudiants inscrits',
                    color: '#60a5fa',
                  },
                  {
                    icon: <Award className="w-8 h-8" />,
                    value: `${tenant.stats.teacher_count}`,
                    label: 'Enseignants-chercheurs',
                    color: '#34d399',
                  },
                  {
                    icon: <BookOpen className="w-8 h-8" />,
                    value: `${(tenant.programs ?? []).length}`,
                    label: 'Programmes de formation',
                    color: goldColor,
                  },
                  {
                    icon: <Calendar className="w-8 h-8" />,
                    value: settings.founded_year
                      ? `${currentYear - settings.founded_year}`
                      : '—',
                    label: "Années d'excellence",
                    color: '#f87171',
                  },
                ].map((stat, i) => (
                  <div key={i} className="group">
                    <div
                      className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 transition-transform group-hover:scale-110"
                      style={{ backgroundColor: `${stat.color}20`, color: stat.color }}
                    >
                      {stat.icon}
                    </div>
                    <p className="text-4xl md:text-5xl font-bold mb-2" style={{ color: stat.color }}>
                      {stat.value}
                    </p>
                    <p className="text-white/60 text-sm">{stat.label}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* ─── ACTUALITES / ANNONCES ────────────────────────────────── */}
        {allAnnouncements.length > 0 && (
          <section className="py-20 bg-white">
            <div className="container mx-auto px-4">
              <div className="mb-12">
                <p
                  className="text-sm font-semibold uppercase tracking-widest mb-3"
                  style={{ color: accentColor }}
                >
                  Vie universitaire
                </p>
                <h2 className="text-4xl font-bold text-gray-900">Actualités & Annonces</h2>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {allAnnouncements.slice(0, 6).map((ann, i) => (
                  <article
                    key={ann.id ?? i}
                    className={`rounded-2xl border overflow-hidden shadow-sm hover:shadow-lg transition-shadow group ${
                      ann.is_pinned ? 'border-purple-200' : 'border-gray-100'
                    }`}
                  >
                    {/* Top color strip */}
                    <div
                      className="h-1.5 w-full"
                      style={{ backgroundColor: ann.is_pinned ? accentColor : deepColor }}
                    />
                    <div className="p-6 bg-white">
                      <div className="flex items-center gap-2 mb-3 flex-wrap">
                        {ann.is_pinned && (
                          <span
                            className="text-xs font-bold px-2.5 py-1 rounded-full flex items-center gap-1"
                            style={{ backgroundColor: `${accentColor}15`, color: accentColor }}
                          >
                            <Pin className="w-3 h-3" />
                            À la une
                          </span>
                        )}
                        {ann.category && (
                          <span className="text-xs font-medium bg-gray-100 text-gray-600 px-2.5 py-1 rounded-full">
                            {ann.category}
                          </span>
                        )}
                        {ann.date && (
                          <time className="text-xs text-gray-400 ml-auto">
                            {new Date(ann.date).toLocaleDateString('fr-FR', {
                              day: 'numeric',
                              month: 'short',
                              year: 'numeric',
                            })}
                          </time>
                        )}
                      </div>
                      <h3 className="font-bold text-gray-900 mb-2 group-hover:text-purple-700 transition-colors line-clamp-2">
                        {ann.title}
                      </h3>
                      <p className="text-sm text-gray-500 leading-relaxed line-clamp-3">
                        {ann.body}
                      </p>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* ─── CAMPUS GALLERY ──────────────────────────────────────── */}
        {settings.show_gallery && settings.gallery.length > 0 && (
          <section className="py-20 bg-gray-50">
            <div className="container mx-auto px-4">
              <div className="mb-12 text-center">
                <p
                  className="text-sm font-semibold uppercase tracking-widest mb-3"
                  style={{ color: accentColor }}
                >
                  Notre campus
                </p>
                <h2 className="text-4xl font-bold text-gray-900">Galerie Campus</h2>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {settings.gallery.map((url, i) => (
                  <div
                    key={i}
                    className={`rounded-2xl overflow-hidden bg-gray-200 group ${
                      i === 0 ? 'col-span-2 row-span-2' : ''
                    }`}
                    style={{ aspectRatio: i === 0 ? '4/3' : '16/9' }}
                  >
                    <img
                      src={url}
                      alt={`${tenant.name} campus ${i + 1}`}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      loading="lazy"
                    />
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* ─── CONTACT & CAMPUS ─────────────────────────────────────── */}
        <section id="contact" className="py-20 bg-white">
          <div className="container mx-auto px-4">
            <div className="mb-12">
              <p
                className="text-sm font-semibold uppercase tracking-widest mb-3"
                style={{ color: accentColor }}
              >
                Nous contacter
              </p>
              <h2 className="text-4xl font-bold text-gray-900">Contact & Campus</h2>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
              {/* Contact information */}
              <div className="space-y-6">
                <div className="bg-gray-50 rounded-2xl p-8 space-y-5">
                  {tenant.address && (
                    <div className="flex items-start gap-4">
                      <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                        style={{ backgroundColor: `${deepColor}15`, color: deepColor }}
                      >
                        <MapPin className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider mb-0.5">
                          Adresse principale
                        </p>
                        <p className="text-gray-800 font-medium">{tenant.address}</p>
                      </div>
                    </div>
                  )}
                  {(tenant.email || settings.contact_email) && (
                    <div className="flex items-start gap-4">
                      <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                        style={{ backgroundColor: `${deepColor}15`, color: deepColor }}
                      >
                        <Mail className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider mb-0.5">
                          Email
                        </p>
                        <a
                          href={`mailto:${tenant.email || settings.contact_email}`}
                          className="font-medium hover:underline"
                          style={{ color: deepColor }}
                        >
                          {tenant.email || settings.contact_email}
                        </a>
                      </div>
                    </div>
                  )}
                  {(tenant.phone || settings.contact_phone) && (
                    <div className="flex items-start gap-4">
                      <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                        style={{ backgroundColor: `${deepColor}15`, color: deepColor }}
                      >
                        <Phone className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider mb-0.5">
                          Téléphone
                        </p>
                        <a
                          href={`tel:${tenant.phone || settings.contact_phone}`}
                          className="font-medium hover:underline"
                          style={{ color: deepColor }}
                        >
                          {tenant.phone || settings.contact_phone}
                        </a>
                      </div>
                    </div>
                  )}
                  {tenant.website && (
                    <div className="flex items-start gap-4">
                      <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                        style={{ backgroundColor: `${deepColor}15`, color: deepColor }}
                      >
                        <Globe className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider mb-0.5">
                          Site officiel
                        </p>
                        <a
                          href={tenant.website}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-medium hover:underline"
                          style={{ color: deepColor }}
                        >
                          {tenant.website.replace(/^https?:\/\//, '')}
                        </a>
                      </div>
                    </div>
                  )}
                  {settings.opening_hours && (
                    <div className="flex items-start gap-4">
                      <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                        style={{ backgroundColor: `${deepColor}15`, color: deepColor }}
                      >
                        <Clock className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider mb-0.5">
                          Horaires d'ouverture
                        </p>
                        <p className="text-gray-700 text-sm whitespace-pre-line leading-relaxed">
                          {settings.opening_hours}
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Social media */}
                {(settings.facebook ||
                  settings.instagram ||
                  settings.twitter ||
                  settings.youtube ||
                  settings.linkedin_url) && (
                  <div>
                    <p className="text-sm font-semibold text-gray-500 mb-4">Réseaux sociaux</p>
                    <div className="flex gap-3 flex-wrap">
                      {settings.facebook && (
                        <a
                          href={settings.facebook}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="w-10 h-10 rounded-xl flex items-center justify-center bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors"
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
                        >
                          <Instagram className="w-5 h-5" />
                        </a>
                      )}
                      {settings.twitter && (
                        <a
                          href={settings.twitter}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="w-10 h-10 rounded-xl flex items-center justify-center bg-sky-50 text-sky-500 hover:bg-sky-100 transition-colors"
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
                        >
                          <Linkedin className="w-5 h-5" />
                        </a>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* CTA + Campus card */}
              <div className="space-y-6">
                <div
                  className="rounded-2xl p-8 text-white"
                  style={{
                    background: `linear-gradient(135deg, ${deepColor} 0%, ${accentColor} 100%)`,
                  }}
                >
                  <Star className="w-10 h-10 mb-4" style={{ color: goldColor }} />
                  <h3 className="text-2xl font-bold mb-3">Intégrez {tenant.name}</h3>
                  <p className="text-white/80 text-sm mb-6 leading-relaxed">
                    Rejoignez une communauté d'excellence. Candidatez dès maintenant pour
                    l'année académique {currentYear}/{currentYear + 1} et construisez votre
                    avenir avec nous.
                  </p>
                  <div className="flex flex-col sm:flex-row gap-3">
                    <Link
                      to={`/admissions/${slug}`}
                      className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-white rounded-xl font-semibold hover:bg-gray-50 transition-colors shadow-sm"
                      style={{ color: deepColor }}
                    >
                      Déposer une candidature
                      <ArrowRight className="w-4 h-4" />
                    </Link>
                    <Link
                      to={`/${slug}/student`}
                      className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-semibold border-2 border-white/30 text-white hover:bg-white/10 transition-colors"
                    >
                      <LogIn className="w-4 h-4" />
                      Espace étudiant
                    </Link>
                  </div>
                </div>

                {/* Map placeholder */}
                <div
                  className="rounded-2xl border border-gray-200 overflow-hidden"
                  style={{ height: '220px' }}
                >
                  <div
                    className="w-full h-full flex flex-col items-center justify-center gap-3"
                    style={{ backgroundColor: `${deepColor}06` }}
                  >
                    <Building className="w-10 h-10 text-gray-300" />
                    <div className="text-center">
                      <p className="text-sm font-medium text-gray-500">Campus principal</p>
                      <p className="text-xs text-gray-400 mt-1">
                        {tenant.address || 'Voir sur la carte'}
                      </p>
                    </div>
                    {tenant.address && (
                      <a
                        href={`https://maps.google.com/?q=${encodeURIComponent(tenant.address)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-semibold underline"
                        style={{ color: accentColor }}
                      >
                        Itinéraire Google Maps
                      </a>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ─── FOOTER ──────────────────────────────────────────────── */}
        <footer style={{ backgroundColor: deepColor }} className="text-white">
          <div className="container mx-auto px-4 py-16">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-10 mb-12">
              {/* Brand */}
              <div className="md:col-span-2">
                <div className="flex items-center gap-3 mb-5">
                  {settings.logo_url ? (
                    <img
                      src={resolveUploadUrl(settings.logo_url)}
                      alt={tenant.name}
                      className="h-14 w-auto object-contain"
                    />
                  ) : (
                    <div className="h-14 w-14 rounded-xl bg-white/15 flex items-center justify-center">
                      <GraduationCap className="w-8 h-8" />
                    </div>
                  )}
                  <div>
                    <p className="font-bold text-xl">{tenant.name}</p>
                    {settings.founded_year && (
                      <p className="text-white/50 text-xs">
                        Fondée en {settings.founded_year}
                      </p>
                    )}
                  </div>
                </div>
                {settings.school_motto && (
                  <p className="text-white/50 italic text-sm max-w-sm leading-relaxed">
                    "{settings.school_motto}"
                  </p>
                )}
                {settings.accreditation && (
                  <p className="text-white/40 text-xs mt-3">{settings.accreditation}</p>
                )}
              </div>

              {/* Formations */}
              <div>
                <h4 className="font-semibold text-sm uppercase tracking-wider mb-5" style={{ color: goldColor }}>
                  Formation
                </h4>
                <ul className="space-y-3">
                  <li>
                    <Link
                      to={`/ecole/${slug}#programmes`}
                      className="text-white/60 hover:text-white text-sm transition-colors"
                    >
                      Nos programmes
                    </Link>
                  </li>
                  <li>
                    <Link
                      to={`/admissions/${slug}`}
                      className="text-white/60 hover:text-white text-sm transition-colors"
                    >
                      Candidatures
                    </Link>
                  </li>
                  <li>
                    <Link
                      to={`/${slug}/student`}
                      className="text-white/60 hover:text-white text-sm transition-colors"
                    >
                      Espace étudiant
                    </Link>
                  </li>
                </ul>
              </div>

              {/* Legal */}
              <div>
                <h4 className="font-semibold text-sm uppercase tracking-wider mb-5" style={{ color: goldColor }}>
                  Informations
                </h4>
                <ul className="space-y-3">
                  <li>
                    <Link
                      to="/terms"
                      className="text-white/60 hover:text-white text-sm transition-colors"
                    >
                      Conditions d'utilisation
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
                  {tenant.email && (
                    <li>
                      <a
                        href={`mailto:${tenant.email}`}
                        className="text-white/60 hover:text-white text-sm transition-colors"
                      >
                        Contact
                      </a>
                    </li>
                  )}
                </ul>
              </div>
            </div>

            <div className="border-t border-white/10 pt-8 flex flex-col sm:flex-row items-center justify-between gap-4">
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
