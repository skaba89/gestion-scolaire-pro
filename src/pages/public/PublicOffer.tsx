import { Link, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Building, GraduationCap, Layers, MapPin, Phone } from "lucide-react";
import { usePublicTenant } from "@/hooks/usePublicTenant";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import type { TenantPublicResponse } from "@/types/tenant";

/**
 * Annuaires (2026-11-25) : « Formations et implantations » d'un établissement — cycles et leurs
 * niveaux, filières, facultés et leurs départements, campus si l'établissement les publie.
 * Les frais et le détail des matières restent sur la page Programmes (/programmes/:slug).
 * Données : GET /tenants/public/{slug}/ (aucun responsable ni donnée personnelle).
 */
function Section({ title, icon: Icon, children }: { title: string; icon: typeof Layers; children: React.ReactNode }) {
  return (
    <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 sm:p-6" aria-labelledby={`offer-${title}`}>
      <h2 id={`offer-${title}`} className="flex items-center gap-2 text-lg font-bold text-gray-900 mb-4">
        <Icon className="w-5 h-5 text-[#1e3a5f]" aria-hidden="true" />
        {title}
      </h2>
      {children}
    </section>
  );
}

function hasOffer(tenant: TenantPublicResponse): boolean {
  return Boolean(
    tenant.cycles?.length || tenant.programs_detail?.length || tenant.faculties?.length || tenant.campuses?.length,
  );
}

export default function PublicOffer() {
  const { t } = useTranslation();
  const { tenantSlug } = useParams<{ tenantSlug: string }>();
  const { data: tenant, isLoading, isError } = usePublicTenant(tenantSlug);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50" role="status">
        <span className="text-gray-500">{t("publicOffer.loading")}</span>
      </div>
    );
  }

  if (isError || !tenant) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-gray-50 px-4 text-center">
        <h1 className="text-xl font-bold text-gray-800">{t("publicOffer.notFound")}</h1>
        <Link to="/annuaire" className="text-sm font-medium text-blue-700 hover:underline">
          {t("publicOffer.backToDirectory")}
        </Link>
      </div>
    );
  }

  const cycles = tenant.cycles ?? [];
  const programs = tenant.programs_detail ?? [];
  const faculties = tenant.faculties ?? [];
  const campuses = tenant.campuses ?? [];

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-[#1e3a5f] text-white">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
          <div className="flex items-center justify-between gap-4 mb-6">
            <Link to={`/ecole/${tenant.slug}`} className="inline-flex items-center gap-2 text-sm text-blue-100 hover:text-white">
              <ArrowLeft className="w-4 h-4" aria-hidden="true" />
              {t("publicOffer.backToSchool")}
            </Link>
            <LanguageSwitcher />
          </div>
          <p className="text-xs uppercase tracking-widest text-blue-200 mb-2">{t("publicOffer.eyebrow")}</p>
          <h1 className="text-2xl sm:text-3xl font-extrabold">{tenant.name}</h1>
          <p className="text-blue-100 mt-2">{t("publicOffer.subtitle")}</p>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8 flex flex-col gap-6">
        {!hasOffer(tenant) && (
          <p className="bg-white rounded-2xl border border-gray-100 p-6 text-gray-600 text-center">
            {t("publicOffer.empty")}
          </p>
        )}

        {cycles.length > 0 && (
          <Section title={t("publicOffer.cycles")} icon={Layers}>
            <ul className="grid gap-4 sm:grid-cols-2">
              {cycles.map((cycle) => (
                <li key={cycle.id} className="rounded-xl bg-gray-50 p-4">
                  <h3 className="font-semibold text-gray-900">{cycle.name}</h3>
                  {cycle.levels.length > 0 ? (
                    <p className="text-sm text-gray-600 mt-1">{cycle.levels.map((level) => level.name).join(" · ")}</p>
                  ) : (
                    <p className="text-sm text-gray-400 mt-1">{t("publicOffer.noLevels")}</p>
                  )}
                </li>
              ))}
            </ul>
          </Section>
        )}

        {programs.length > 0 && (
          <Section title={t("publicOffer.programs")} icon={GraduationCap}>
            <ul className="grid gap-3 sm:grid-cols-2">
              {programs.map((program) => (
                <li key={program.id} className="rounded-xl bg-gray-50 p-4">
                  <h3 className="font-semibold text-gray-900">{program.name}</h3>
                  {program.description && <p className="text-sm text-gray-600 mt-1">{program.description}</p>}
                </li>
              ))}
            </ul>
            <Link to={`/programmes/${tenant.slug}`} className="inline-block mt-4 text-sm font-medium text-blue-700 hover:underline">
              {t("publicOffer.programsDetail")}
            </Link>
          </Section>
        )}

        {faculties.length > 0 && (
          <Section title={t("publicOffer.faculties")} icon={Building}>
            <ul className="flex flex-col gap-4">
              {faculties.map((faculty) => (
                <li key={faculty.id}>
                  <h3 className="font-semibold text-gray-900">{faculty.name}</h3>
                  {faculty.description && <p className="text-sm text-gray-600">{faculty.description}</p>}
                  {faculty.departments.length > 0 && (
                    <ul className="mt-2 flex flex-wrap gap-2" aria-label={t("publicOffer.departmentsOf", { name: faculty.name })}>
                      {faculty.departments.map((department) => (
                        <li key={department.id} className="rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-800">
                          {department.name}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          </Section>
        )}

        {campuses.length > 0 && (
          <Section title={t("publicOffer.campuses")} icon={MapPin}>
            <ul className="grid gap-3 sm:grid-cols-2">
              {campuses.map((campus) => (
                <li key={campus.id} className="rounded-xl bg-gray-50 p-4">
                  <h3 className="font-semibold text-gray-900">
                    {campus.name}
                    {campus.is_main && (
                      <span className="ml-2 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                        {t("publicOffer.mainCampus")}
                      </span>
                    )}
                  </h3>
                  {campus.address && <p className="text-sm text-gray-600 mt-1">{campus.address}</p>}
                  {campus.phone && (
                    <p className="text-sm text-gray-600 mt-1 inline-flex items-center gap-1">
                      <Phone className="w-3.5 h-3.5" aria-hidden="true" />
                      <a href={`tel:${campus.phone}`} className="hover:underline">{campus.phone}</a>
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </Section>
        )}
      </main>
    </div>
  );
}
