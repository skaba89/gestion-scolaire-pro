// src/types/tenant.ts
// Types publics pour les landing pages et l'annuaire des établissements

export interface TenantLandingAnnouncement {
  id?: string;
  title: string;
  body: string;
  date?: string | null;
  is_pinned?: boolean;
  category?: string | null;
}

export interface TenantLandingSettings {
  logo_url?: string | null;
  banner_url?: string | null;
  description?: string | null;
  tagline?: string | null;
  primary_color: string;
  secondary_color?: string | null;
  facebook?: string | null;
  instagram?: string | null;
  twitter?: string | null;
  youtube?: string | null;
  gallery: string[];
  opening_hours?: string | null;
  announcements: TenantLandingAnnouncement[];
  features?: string[];
  show_stats: boolean;
  show_programs: boolean;
  show_gallery?: boolean;
  custom_domain?: string | null;
  school_motto?: string | null;
  founded_year?: number | null;
  accreditation?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  facebook_url?: string | null;
  twitter_url?: string | null;
  linkedin_url?: string | null;
}

export interface TenantPublicStats {
  student_count: number;
  teacher_count: number;
}

export interface TenantPublicCard {
  id: string;
  name: string;
  slug: string;
  type: string;
  address?: string | null;
  email?: string | null;
  website?: string | null;
  logo_url?: string | null;
  description?: string | null;
  primary_color?: string;
}

export interface TenantPublicResponse {
  id: string;
  name: string;
  slug: string;
  type: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  website?: string | null;
  country?: string;
  currency?: string;
  is_active: boolean;
  landing: TenantLandingSettings;
  stats?: TenantPublicStats;
  programs?: any[];
  departments?: any[];
  announcements?: TenantLandingAnnouncement[];
}

export type TenantTypeKey =
  | 'SCHOOL' | 'UNIVERSITY' | 'HIGH_SCHOOL' | 'LYCEE'
  | 'PRIMARY' | 'ELEMENTARY' | 'TRAINING_CENTER'
  | 'HIGHER_EDUCATION' | 'INSTITUTE' | 'BTS' | 'IUT'
  | 'SECONDARY' | string;

export function getTenantTypeLabel(type: TenantTypeKey): string {
  const labels: Record<string, string> = {
    UNIVERSITY: 'Université',
    HIGHER_EDUCATION: 'Enseignement supérieur',
    INSTITUTE: 'Institut',
    HIGH_SCHOOL: 'Lycée',
    LYCEE: 'Lycée',
    SECONDARY: 'Collège',
    PRIMARY: 'École primaire',
    ELEMENTARY: 'École primaire',
    SCHOOL: 'École',
    TRAINING_CENTER: 'Centre de formation',
    BTS: 'BTS / IUT',
    IUT: 'BTS / IUT',
  };
  return labels[String(type).toUpperCase()] ?? 'Établissement';
}

export function getTenantTypeColor(type: TenantTypeKey): string {
  const t = String(type).toUpperCase();
  if (['UNIVERSITY', 'HIGHER_EDUCATION', 'INSTITUTE', 'BTS', 'IUT'].includes(t))
    return 'bg-purple-100 text-purple-800';
  if (['HIGH_SCHOOL', 'LYCEE', 'SECONDARY'].includes(t))
    return 'bg-blue-100 text-blue-800';
  if (['PRIMARY', 'ELEMENTARY'].includes(t))
    return 'bg-green-100 text-green-800';
  if (t === 'TRAINING_CENTER') return 'bg-orange-100 text-orange-800';
  return 'bg-gray-100 text-gray-700';
}

export function getTenantTypeIcon(type: TenantTypeKey): string {
  const t = String(type).toUpperCase();
  if (['UNIVERSITY', 'HIGHER_EDUCATION', 'INSTITUTE', 'BTS', 'IUT'].includes(t))
    return '🎓';
  if (['HIGH_SCHOOL', 'LYCEE', 'SECONDARY'].includes(t)) return '🏫';
  if (['PRIMARY', 'ELEMENTARY'].includes(t)) return '📚';
  if (t === 'TRAINING_CENTER') return '🔧';
  return '🏛️';
}

export function getLandingSettings(tenant: TenantPublicResponse): TenantLandingSettings {
  const defaults: TenantLandingSettings = {
    primary_color: '#1e3a5f',
    gallery: [],
    announcements: [],
    features: [],
    show_stats: true,
    show_programs: true,
    show_gallery: true,
  };
  return { ...defaults, ...(tenant.landing ?? {}) };
}
