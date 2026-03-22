import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import {
  Menu,
  X,
  UserPlus,
  MapPin,
  Mail,
  Phone,
  Bell,
  Pin,
  Clock,
  ChevronRight,
  Star,
  ArrowRight,
  Facebook,
  Instagram,
  Youtube,
} from 'lucide-react';
import type { TenantPublicResponse, TenantLandingSettings } from '@/types/tenant';

interface LandingTemplateProps {
  tenant: TenantPublicResponse;
  settings: TenantLandingSettings;
}

// Bright, joyful class level colors
const CLASS_COLORS = [
  { bg: '#fee2e2', text: '#dc2626', border: '#fca5a5', emoji: '🌱' },
  { bg: '#fef3c7', text: '#d97706', border: '#fcd34d', emoji: '🌟' },
  { bg: '#d1fae5', text: '#059669', border: '#6ee7b7', emoji: '🌿' },
  { bg: '#dbeafe', text: '#2563eb', border: '#93c5fd', emoji: '💫' },
  { bg: '#ede9fe', text: '#7c3aed', border: '#c4b5fd', emoji: '🚀' },
];

const DEFAULT_CLASS_LEVELS = ['CP', 'CE1', 'CE2', 'CM1', 'CM2'];

const ACTIVITY_CARDS = [
  { emoji: '⚽', title: 'Sport & EPS', desc: 'Activités sportives et développement physique', bg: '#fef3c7', text: '#d97706' },
  { emoji: '🎨', title: 'Art & Créativité', desc: 'Dessin, peinture, travaux manuels', bg: '#fce7f3', text: '#be185d' },
  { emoji: '🔬', title: 'Sciences & Découvertes', desc: 'Expériences et exploration du monde', bg: '#d1fae5', text: '#059669' },
  { emoji: '🎵', title: 'Musique & Chant', desc: 'Éveil musical et activités rythmiques', bg: '#ede9fe', text: '#7c3aed' },
];

export const PrimarySchoolTemplate = ({ tenant, settings }: LandingTemplateProps) => {
  const [mobileOpen, setMobileOpen] = useState(false);
  const slug = tenant.slug;

  const primaryColor = settings.primary_color || '#f97316';
  const secondaryColor = settings.secondary_color || '#3b82f6';

  const pinnedAnnouncements = settings.announcements.filter((a) => a.is_pinned);
  const unpinnedAnnouncements = settings.announcements.filter((a) => !a.is_pinned);
  const allAnnouncements = [...pinnedAnnouncements, ...unpinnedAnnouncements];

  // Use programs as class levels, or fall back to default
  const classLevels =
    tenant.programs && tenant.programs.length > 0
      ? tenant.programs
      : DEFAULT_CLASS_LEVELS;

  const currentYear = new Date().getFullYear();

  return (
    <>
      <Helmet>
        <title>{tenant.name} — École primaire</title>
        <meta
          name="description"
          content={
            settings.description ||
            settings.tagline ||
            `${tenant.name} — Un environnement bienveillant pour l'épanouissement de votre enfant.`
          }
        />
        <meta property="og:title" content={tenant.name} />
        <meta name="theme-color" content={primaryColor} />
      </Helmet>

      <div className="min-h-screen bg-orange-50">
        {/* ─── COLORFUL NAVBAR ─────────────────────────────────────── */}
        <nav
          className="sticky top-0 z-50 shadow-md"
          style={{ backgroundColor: primaryColor }}
        >
          <div className="container mx-auto px-4">
            <div className="flex items-center justify-between h-16">
              {/* Logo */}
              <Link to={`/ecole/${slug}`} className="flex items-center gap-3">
                {settings.logo_url ? (
                  <img
                    src={settings.logo_url}
                    alt={tenant.name}
                    className="h-10 w-10 rounded-full object-contain bg-white/20 p-1"
                  />
                ) : (
                  <div className="h-10 w-10 rounded-full bg-white/20 flex items-center justify-center text-2xl">
                    🏫
                  </div>
                )}
                <span className="font-bold text-white text-lg hidden sm:block truncate">
                  {tenant.name}
                </span>
              </Link>

              {/* Desktop nav */}
              <div className="hidden lg:flex items-center gap-1">
                {[
                  { label: '🏠 Accueil', href: `/ecole/${slug}` },
                  { label: '📚 Nos classes', href: `#classes` },
                  { label: '📢 Infos parents', href: `#annonces` },
                  { label: '📞 Contact', href: `#contact` },
                ].map((link) => (
                  <a
                    key={link.label}
                    href={link.href}
                    className="px-4 py-2 rounded-full text-sm font-semibold text-white/90 hover:text-white hover:bg-white/20 transition-colors"
                  >
                    {link.label}
                  </a>
                ))}
              </div>

              {/* CTA */}
              <div className="hidden sm:flex items-center gap-2">
                <Link
                  to={`/admissions/${slug}`}
                  className="px-5 py-2 rounded-full text-sm font-bold text-white bg-white/20 hover:bg-white/30 border-2 border-white/40 transition-all shadow-sm"
                >
                  Inscription
                </Link>
              </div>

              {/* Mobile hamburger */}
              <button
                className="lg:hidden p-2 rounded-full hover:bg-white/20 transition-colors text-white"
                onClick={() => setMobileOpen(!mobileOpen)}
              >
                {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>
            </div>

            {/* Mobile menu */}
            {mobileOpen && (
              <div className="lg:hidden py-4 border-t border-white/20 space-y-1">
                {[
                  { label: '🏠 Accueil', href: `/ecole/${slug}` },
                  { label: '📚 Nos classes', href: `#classes` },
                  { label: '📢 Infos parents', href: `#annonces` },
                  { label: '📞 Contact', href: `#contact` },
                ].map((link) => (
                  <a
                    key={link.label}
                    href={link.href}
                    className="block px-4 py-3 rounded-xl text-sm font-semibold text-white hover:bg-white/20"
                    onClick={() => setMobileOpen(false)}
                  >
                    {link.label}
                  </a>
                ))}
                <div className="pt-3 border-t border-white/20">
                  <Link
                    to={`/admissions/${slug}`}
                    className="block px-4 py-3 rounded-xl text-sm font-bold text-white bg-white/20 text-center border-2 border-white/40"
                    onClick={() => setMobileOpen(false)}
                  >
                    S'inscrire
                  </Link>
                </div>
              </div>
            )}
          </div>
        </nav>

        {/* ─── HERO ────────────────────────────────────────────────── */}
        <header className="relative overflow-hidden min-h-[480px] flex items-center">
          {/* Animated background art — CSS circles */}
          <div className="absolute inset-0" style={{ backgroundColor: '#fff7ed' }}>
            {/* Decorative colored circles */}
            <div
              className="absolute top-8 left-8 w-32 h-32 rounded-full opacity-20"
              style={{ backgroundColor: primaryColor }}
            />
            <div
              className="absolute top-20 right-20 w-48 h-48 rounded-full opacity-15"
              style={{ backgroundColor: secondaryColor }}
            />
            <div className="absolute bottom-10 left-1/4 w-24 h-24 rounded-full opacity-20 bg-yellow-400" />
            <div className="absolute bottom-16 right-1/3 w-40 h-40 rounded-full opacity-10 bg-green-400" />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 rounded-full opacity-5 bg-pink-400" />

            {/* Stars */}
            {['top-12 left-1/3', 'top-24 right-1/4', 'bottom-20 left-16', 'bottom-12 right-12'].map(
              (pos, i) => (
                <div key={i} className={`absolute ${pos} text-2xl opacity-30`}>
                  ⭐
                </div>
              )
            )}
          </div>

          {settings.banner_url && (
            <>
              <img
                src={settings.banner_url}
                alt={tenant.name}
                className="absolute inset-0 w-full h-full object-cover opacity-10"
              />
            </>
          )}

          <div className="container mx-auto px-4 py-20 relative z-10 text-center">
            {/* Logo or emoji */}
            {settings.logo_url ? (
              <img
                src={settings.logo_url}
                alt={tenant.name}
                className="w-28 h-28 rounded-3xl object-contain mx-auto mb-6 shadow-xl bg-white p-3"
              />
            ) : (
              <div
                className="w-28 h-28 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-xl text-5xl bg-white"
              >
                🏫
              </div>
            )}

            <h1
              className="text-4xl md:text-6xl font-black mb-4 leading-tight"
              style={{ color: primaryColor }}
            >
              Bienvenue à{' '}
              <span
                className="inline-block"
                style={{
                  background: `linear-gradient(135deg, ${primaryColor}, ${secondaryColor})`,
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                }}
              >
                {tenant.name}
              </span>{' '}
              🎉
            </h1>

            {settings.tagline && (
              <p className="text-lg md:text-xl text-gray-600 mb-8 max-w-2xl mx-auto leading-relaxed font-medium">
                {settings.tagline}
              </p>
            )}

            {!settings.tagline && (
              <p className="text-lg md:text-xl text-gray-600 mb-8 max-w-2xl mx-auto leading-relaxed font-medium">
                Un lieu d'apprentissage, de découverte et d'épanouissement pour votre enfant.
              </p>
            )}

            <div className="flex flex-wrap justify-center gap-4">
              <Link
                to={`/admissions/${slug}`}
                className="inline-flex items-center gap-2 px-8 py-4 rounded-2xl font-bold text-white text-lg shadow-lg hover:shadow-xl hover:-translate-y-1 transition-all"
                style={{ backgroundColor: primaryColor }}
              >
                <UserPlus className="w-5 h-5" />
                Inscription {currentYear}/{currentYear + 1}
              </Link>
              <Link
                to={`/ecole/${slug}#contact`}
                className="inline-flex items-center gap-2 px-8 py-4 rounded-2xl font-bold text-lg shadow-sm hover:shadow-md border-2 bg-white hover:-translate-y-1 transition-all"
                style={{ color: primaryColor, borderColor: primaryColor }}
              >
                📞 Nous contacter
              </Link>
            </div>

            {tenant.address && (
              <div className="flex items-center justify-center gap-2 text-gray-500 mt-8">
                <MapPin className="w-4 h-4 flex-shrink-0" />
                <span className="text-sm">{tenant.address}</span>
              </div>
            )}
          </div>
        </header>

        {/* ─── NOS CLASSES ─────────────────────────────────────────── */}
        <section id="classes" className="py-20">
          <div className="container mx-auto px-4">
            <div className="text-center mb-12">
              <div className="text-4xl mb-3">📚</div>
              <h2 className="text-3xl md:text-4xl font-black text-gray-800 mb-3">Nos Classes</h2>
              <p className="text-gray-500 text-lg">
                Une progression adaptée à chaque étape de la scolarité
              </p>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
              {classLevels.map((level, i) => {
                const colors = CLASS_COLORS[i % CLASS_COLORS.length];
                return (
                  <div
                    key={i}
                    className="rounded-3xl p-6 text-center border-2 hover:shadow-lg hover:-translate-y-1 transition-all cursor-default"
                    style={{
                      backgroundColor: colors.bg,
                      borderColor: colors.border,
                    }}
                  >
                    <div className="text-4xl mb-3">{colors.emoji}</div>
                    <p className="font-black text-lg" style={{ color: colors.text }}>
                      {level}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ─── LA VIE A L'ECOLE ────────────────────────────────────── */}
        <section className="py-20 bg-white">
          <div className="container mx-auto px-4">
            <div className="text-center mb-12">
              <div className="text-4xl mb-3">🌈</div>
              <h2 className="text-3xl md:text-4xl font-black text-gray-800 mb-3">
                La vie à l'école
              </h2>
              <p className="text-gray-500 text-lg">
                Des activités variées pour l'épanouissement de votre enfant
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {ACTIVITY_CARDS.map((activity, i) => (
                <div
                  key={i}
                  className="rounded-3xl p-6 text-center hover:shadow-lg hover:-translate-y-1 transition-all"
                  style={{ backgroundColor: activity.bg }}
                >
                  <div className="text-5xl mb-4">{activity.emoji}</div>
                  <h3 className="font-black text-lg mb-2" style={{ color: activity.text }}>
                    {activity.title}
                  </h3>
                  <p className="text-sm text-gray-600 leading-relaxed">{activity.desc}</p>
                </div>
              ))}
            </div>

            {settings.features && settings.features.length > 0 && (
              <div className="mt-12 grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl mx-auto">
                {settings.features.map((feat, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-3 bg-gray-50 rounded-2xl px-5 py-3 border border-gray-100"
                  >
                    <span className="text-xl">✅</span>
                    <span className="text-sm font-semibold text-gray-700">{feat}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* ─── STATS SECTION ───────────────────────────────────────── */}
        {settings.show_stats && tenant.stats && (
          <section className="py-16" style={{ backgroundColor: '#fff7ed' }}>
            <div className="container mx-auto px-4">
              <div className="text-center mb-10">
                <div className="text-4xl mb-3">🌟</div>
                <h2 className="text-3xl font-black text-gray-800">Notre école en chiffres</h2>
              </div>

              <div className="flex flex-wrap justify-center gap-6">
                {[
                  {
                    emoji: '👧',
                    value: `${tenant.stats.student_count}`,
                    label: 'élèves',
                    bg: '#fce7f3',
                    text: '#be185d',
                  },
                  {
                    emoji: '👩‍🏫',
                    value: `${tenant.stats.teacher_count}`,
                    label: 'enseignants',
                    bg: '#dbeafe',
                    text: '#1d4ed8',
                  },
                  {
                    emoji: '📖',
                    value: `${classLevels.length}`,
                    label: 'niveaux',
                    bg: '#d1fae5',
                    text: '#065f46',
                  },
                  {
                    emoji: '🏆',
                    value: settings.founded_year
                      ? `${currentYear - settings.founded_year}`
                      : '20+',
                    label: "ans d'expérience",
                    bg: '#fef3c7',
                    text: '#92400e',
                  },
                ].map((stat, i) => (
                  <div
                    key={i}
                    className="rounded-3xl px-8 py-6 text-center shadow-sm hover:shadow-md transition-shadow min-w-[160px]"
                    style={{ backgroundColor: stat.bg }}
                  >
                    <div className="text-4xl mb-2">{stat.emoji}</div>
                    <p className="text-4xl font-black" style={{ color: stat.text }}>
                      {stat.value}
                    </p>
                    <p className="text-sm font-semibold text-gray-600 mt-1">{stat.label}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* ─── ANNONCES PARENTS ────────────────────────────────────── */}
        {allAnnouncements.length > 0 && (
          <section id="annonces" className="py-20 bg-white">
            <div className="container mx-auto px-4">
              <div className="text-center mb-12">
                <div className="text-4xl mb-3">📢</div>
                <h2 className="text-3xl md:text-4xl font-black text-gray-800 mb-3">
                  Infos pour les parents
                </h2>
                <p className="text-gray-500">Actualités et annonces de l'école</p>
              </div>

              <div className="max-w-2xl mx-auto space-y-4">
                {allAnnouncements.slice(0, 5).map((ann, i) => (
                  <div
                    key={ann.id ?? i}
                    className={`rounded-2xl p-5 border-2 flex gap-4 hover:shadow-md transition-shadow ${
                      ann.is_pinned
                        ? 'border-yellow-200 bg-yellow-50'
                        : 'border-gray-100 bg-gray-50'
                    }`}
                  >
                    <div
                      className="w-10 h-10 rounded-2xl flex items-center justify-center text-xl flex-shrink-0 mt-0.5"
                      style={{ backgroundColor: ann.is_pinned ? '#fef3c7' : `${primaryColor}15` }}
                    >
                      {ann.is_pinned ? '📌' : '📣'}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap mb-1.5">
                        <h3 className="font-bold text-gray-900">{ann.title}</h3>
                        {ann.is_pinned && (
                          <span className="text-xs bg-yellow-200 text-yellow-800 px-2 py-0.5 rounded-full font-bold">
                            Important
                          </span>
                        )}
                        {ann.category && (
                          <span
                            className="text-xs px-2 py-0.5 rounded-full font-semibold"
                            style={{ backgroundColor: `${primaryColor}15`, color: primaryColor }}
                          >
                            {ann.category}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-600 leading-relaxed">{ann.body}</p>
                      {ann.date && (
                        <time className="text-xs text-gray-400 mt-2 block">
                          {new Date(ann.date).toLocaleDateString('fr-FR', {
                            day: 'numeric',
                            month: 'long',
                            year: 'numeric',
                          })}
                        </time>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* ─── GALERIE ─────────────────────────────────────────────── */}
        {settings.show_gallery && settings.gallery.length > 0 && (
          <section className="py-20" style={{ backgroundColor: '#f0fdf4' }}>
            <div className="container mx-auto px-4">
              <div className="text-center mb-12">
                <div className="text-4xl mb-3">📸</div>
                <h2 className="text-3xl md:text-4xl font-black text-gray-800 mb-3">
                  Notre galerie
                </h2>
                <p className="text-gray-500">Des moments de bonheur à l'école</p>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {settings.gallery.map((url, i) => (
                  <div
                    key={i}
                    className="rounded-3xl overflow-hidden bg-gray-100 group shadow-sm hover:shadow-lg transition-shadow"
                    style={{ aspectRatio: '4/3' }}
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
            </div>
          </section>
        )}

        {/* ─── INFO PRATIQUES ──────────────────────────────────────── */}
        <section id="contact" className="py-20 bg-white">
          <div className="container mx-auto px-4">
            <div className="text-center mb-12">
              <div className="text-4xl mb-3">📋</div>
              <h2 className="text-3xl md:text-4xl font-black text-gray-800 mb-3">
                Infos pratiques
              </h2>
              <p className="text-gray-500">Tout ce qu'il faut savoir pour contacter l'école</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 max-w-5xl mx-auto">
              {/* Address */}
              {tenant.address && (
                <div
                  className="rounded-3xl p-6 text-center border-2 hover:shadow-md transition-shadow"
                  style={{ backgroundColor: '#dbeafe', borderColor: '#93c5fd' }}
                >
                  <div className="text-4xl mb-3">📍</div>
                  <h3 className="font-black text-blue-700 mb-2">Adresse</h3>
                  <p className="text-sm text-blue-600 leading-relaxed">{tenant.address}</p>
                  <a
                    href={`https://maps.google.com/?q=${encodeURIComponent(tenant.address)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block mt-3 text-xs font-bold text-blue-500 underline"
                  >
                    Voir sur la carte
                  </a>
                </div>
              )}

              {/* Phone */}
              {(tenant.phone || settings.contact_phone) && (
                <div
                  className="rounded-3xl p-6 text-center border-2 hover:shadow-md transition-shadow"
                  style={{ backgroundColor: '#d1fae5', borderColor: '#6ee7b7' }}
                >
                  <div className="text-4xl mb-3">📞</div>
                  <h3 className="font-black text-green-700 mb-2">Téléphone</h3>
                  <a
                    href={`tel:${tenant.phone || settings.contact_phone}`}
                    className="text-sm font-bold text-green-600 hover:underline"
                  >
                    {tenant.phone || settings.contact_phone}
                  </a>
                </div>
              )}

              {/* Hours */}
              {settings.opening_hours && (
                <div
                  className="rounded-3xl p-6 text-center border-2 hover:shadow-md transition-shadow"
                  style={{ backgroundColor: '#fef3c7', borderColor: '#fcd34d' }}
                >
                  <div className="text-4xl mb-3">⏰</div>
                  <h3 className="font-black text-yellow-700 mb-2">Horaires</h3>
                  <p className="text-xs text-yellow-700 whitespace-pre-line leading-relaxed">
                    {settings.opening_hours}
                  </p>
                </div>
              )}

              {/* Email */}
              {(tenant.email || settings.contact_email) && (
                <div
                  className="rounded-3xl p-6 text-center border-2 hover:shadow-md transition-shadow"
                  style={{ backgroundColor: '#fce7f3', borderColor: '#f9a8d4' }}
                >
                  <div className="text-4xl mb-3">✉️</div>
                  <h3 className="font-black text-pink-700 mb-2">Email</h3>
                  <a
                    href={`mailto:${tenant.email || settings.contact_email}`}
                    className="text-xs font-bold text-pink-600 hover:underline break-all"
                  >
                    {tenant.email || settings.contact_email}
                  </a>
                </div>
              )}
            </div>

            {/* Social links */}
            {(settings.facebook || settings.instagram || settings.youtube) && (
              <div className="text-center mt-10">
                <p className="text-gray-500 font-semibold mb-4">Suivez-nous</p>
                <div className="flex justify-center gap-4">
                  {settings.facebook && (
                    <a
                      href={settings.facebook}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-12 h-12 rounded-2xl flex items-center justify-center bg-blue-100 text-blue-700 hover:bg-blue-200 transition-colors text-xl shadow-sm"
                    >
                      <Facebook className="w-5 h-5" />
                    </a>
                  )}
                  {settings.instagram && (
                    <a
                      href={settings.instagram}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-12 h-12 rounded-2xl flex items-center justify-center bg-pink-100 text-pink-600 hover:bg-pink-200 transition-colors shadow-sm"
                    >
                      <Instagram className="w-5 h-5" />
                    </a>
                  )}
                  {settings.youtube && (
                    <a
                      href={settings.youtube}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-12 h-12 rounded-2xl flex items-center justify-center bg-red-100 text-red-600 hover:bg-red-200 transition-colors shadow-sm"
                    >
                      <Youtube className="w-5 h-5" />
                    </a>
                  )}
                </div>
              </div>
            )}

            {/* CTA box */}
            <div className="mt-16 max-w-2xl mx-auto">
              <div
                className="rounded-3xl p-8 text-center text-white shadow-xl"
                style={{
                  background: `linear-gradient(135deg, ${primaryColor} 0%, ${secondaryColor} 100%)`,
                }}
              >
                <div className="text-5xl mb-4">🎒</div>
                <h3 className="text-2xl font-black mb-3">
                  Inscrivez votre enfant !
                </h3>
                <p className="text-white/85 mb-6 text-sm leading-relaxed">
                  Rejoignez notre école pour l'année scolaire {currentYear}/{currentYear + 1}.
                  Un accompagnement bienveillant et personnalisé vous attend.
                </p>
                <Link
                  to={`/admissions/${slug}`}
                  className="inline-flex items-center gap-2 px-8 py-3.5 rounded-2xl font-bold text-gray-800 bg-white hover:bg-gray-50 transition-colors shadow-md text-lg"
                >
                  Déposer un dossier
                  <ArrowRight className="w-5 h-5" />
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* ─── FOOTER ──────────────────────────────────────────────── */}
        <footer style={{ backgroundColor: primaryColor }} className="text-white">
          <div className="container mx-auto px-4 py-10">
            <div className="flex flex-col md:flex-row items-center justify-between gap-6 mb-8">
              {/* Brand */}
              <div className="flex items-center gap-3">
                {settings.logo_url ? (
                  <img
                    src={settings.logo_url}
                    alt={tenant.name}
                    className="h-10 w-10 rounded-2xl object-contain bg-white/20 p-1"
                  />
                ) : (
                  <div className="h-10 w-10 rounded-2xl bg-white/20 flex items-center justify-center text-2xl">
                    🏫
                  </div>
                )}
                <div>
                  <p className="font-black text-lg">{tenant.name}</p>
                  {settings.school_motto && (
                    <p className="text-white/70 text-xs italic">"{settings.school_motto}"</p>
                  )}
                </div>
              </div>

              {/* Quick links */}
              <div className="flex flex-wrap justify-center gap-x-6 gap-y-2">
                {[
                  { label: 'Accueil', href: `/ecole/${slug}` },
                  { label: 'Inscription', href: `/admissions/${slug}` },
                  { label: 'CGU', href: '/terms' },
                  { label: 'Confidentialité', href: '/privacy' },
                ].map((link) => (
                  <Link
                    key={link.label}
                    to={link.href}
                    className="text-white/70 hover:text-white text-sm transition-colors"
                  >
                    {link.label}
                  </Link>
                ))}
              </div>
            </div>

            <div className="border-t border-white/20 pt-6 flex flex-col sm:flex-row items-center justify-between gap-3">
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
