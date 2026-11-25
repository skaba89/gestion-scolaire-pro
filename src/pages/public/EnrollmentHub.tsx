/**
 * EnrollmentHub — portail central d'inscription en ligne par établissement.
 * Paths:
 *  1. Étudiant inscrit → login vers son espace
 *  2. Réinscription (étudiant existant, nouvelle année)
 *  3. Nouvelle candidature (nouvel étudiant)
 */
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { useParams, useNavigate, Link } from "react-router-dom";
import { School, LogIn, RefreshCw, FileText, Loader2, AlertCircle, Phone, Mail, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import axios from "axios";

interface TenantInfo {
  id: string;
  name: string;
  type: string;
  email: string;
  phone: string;
  address: string;
  website: string;
  country: string;
  admissions_open: boolean;
  levels: { id: string; name: string; description: string }[];
  current_academic_year: { id: string; name: string; start_date: string; end_date: string } | null;
}

export default function EnrollmentHub() {
  const { t } = useTranslation();

  const { tenantSlug } = useParams<{ tenantSlug: string }>();
  const navigate = useNavigate();
  const [school, setSchool] = useState<TenantInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!tenantSlug) return;
    const apiBase = (window as any).__SCHOOLFLOW_CONFIG__?.API_URL || import.meta.env.VITE_API_URL || "";
    axios
      .get(`${apiBase}/api/v1/admissions/public/tenant-info/${tenantSlug}/`)
      .then((r) => setSchool(r.data))
      .catch((err) => {
        if (err.response?.status === 404) {
          setError("publicJourney.hub.notFound"); // clé, traduite à l'affichage
        } else {
          setError("publicJourney.hub.loadError");
        }
      })
      .finally(() => setLoading(false));
  }, [tenantSlug]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
        <Loader2 className="h-10 w-10 animate-spin text-indigo-600" />
      </div>
    );
  }

  if (error || !school) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-6">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md text-center">
          <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-800 mb-2">{t("publicJourney.hub.oops")}</h2>
          <p className="text-gray-600">{error ? t(error) : null}</p>
          <Button className="mt-6" onClick={() => navigate("/connexion")}>
            {t("publicJourney.hub.backHome")}
          </Button>
        </div>
      </div>
    );
  }

  const yearName = school.current_academic_year?.name ?? "—";

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* Header */}
      <div className="bg-white shadow-sm">
        <div className="max-w-4xl mx-auto px-6 py-5 flex items-center gap-4">
          <div className="p-3 bg-indigo-600 rounded-xl">
            <School className="h-7 w-7 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold text-gray-900 truncate">{school.name}</h1>
            <p className="text-sm text-gray-500">{t(`publicJourney.hub.types.${school.type}`, { defaultValue: school.type })}</p>
          </div>
          <LanguageSwitcher />
          <Badge variant={school.admissions_open ? "default" : "secondary"} className="shrink-0">
            {school.admissions_open ? t("publicJourney.hub.open") : t("publicJourney.hub.closed")}
          </Badge>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-10">
        {/* Intro */}
        <div className="text-center mb-10">
          <h2 className="text-3xl font-extrabold text-gray-900 mb-3">
            {t("publicJourney.hub.title")}
          </h2>
          <p className="text-gray-600 text-lg">
            {t("publicJourney.hub.schoolYear")} <span className="font-semibold text-indigo-700">{yearName}</span>
          </p>
          <p className="text-gray-500 mt-1 text-sm">{t("publicJourney.hub.chooseSituation")}</p>
        </div>

        {/* 3 path cards */}
        <div className="grid md:grid-cols-3 gap-6">
          {/* Path 1: Login */}
          <div className="bg-white rounded-2xl shadow-md hover:shadow-lg transition-shadow p-7 flex flex-col">
            <div className="p-3 bg-blue-100 rounded-xl w-fit mb-4">
              <LogIn className="h-7 w-7 text-blue-600" />
            </div>
            <h3 className="text-lg font-bold text-gray-900 mb-2">{t("publicJourney.hub.enrolled.title")}</h3>
            <p className="text-sm text-gray-600 flex-1 mb-6">
              {t("publicJourney.hub.enrolled.text")}
            </p>
            <Button
              className="w-full"
              onClick={() => window.location.href = `/${tenantSlug}/auth`}
            >
              {t("publicJourney.hub.enrolled.action")}
            </Button>
          </div>

          {/* Path 2: Re-enrollment */}
          <div className="bg-white rounded-2xl shadow-md hover:shadow-lg transition-shadow p-7 flex flex-col">
            <div className="p-3 bg-amber-100 rounded-xl w-fit mb-4">
              <RefreshCw className="h-7 w-7 text-amber-600" />
            </div>
            <h3 className="text-lg font-bold text-gray-900 mb-2">{t("publicJourney.hub.reenroll.title")}</h3>
            <p className="text-sm text-gray-600 flex-1 mb-6">
              {t("publicJourney.hub.reenroll.text")}
            </p>
            <Button
              variant="outline"
              className="w-full border-amber-400 text-amber-700 hover:bg-amber-50"
              disabled={!school.admissions_open}
              onClick={() => navigate(`/inscription/${tenantSlug}/reinscription`)}
            >
              {t("publicJourney.hub.reenroll.title")}
            </Button>
          </div>

          {/* Path 3: New application */}
          <div className="bg-white rounded-2xl shadow-md hover:shadow-lg transition-shadow p-7 flex flex-col">
            <div className="p-3 bg-green-100 rounded-xl w-fit mb-4">
              <FileText className="h-7 w-7 text-green-600" />
            </div>
            <h3 className="text-lg font-bold text-gray-900 mb-2">{t("publicJourney.hub.apply.title")}</h3>
            <p className="text-sm text-gray-600 flex-1 mb-6">
              {t("publicJourney.hub.apply.text")}
            </p>
            <Button
              variant="outline"
              className="w-full border-green-500 text-green-700 hover:bg-green-50"
              disabled={!school.admissions_open}
              onClick={() => navigate(`/admissions/${tenantSlug}`)}
            >
              {t("publicJourney.hub.apply.action")}
            </Button>
          </div>
        </div>

        {/* Check status link */}
        <div className="mt-8 text-center">
          <p className="text-sm text-gray-500">
            {t("publicJourney.hub.alreadySubmitted")}{" "}
            <Link
              to={`/inscription/${tenantSlug}/statut`}
              className="text-indigo-600 font-medium hover:underline"
            >
              {t("publicJourney.hub.trackLink")}
            </Link>
          </p>
        </div>

        {/* School contact info */}
        {(school.email || school.phone || school.website) && (
          <div className="mt-10 bg-white/70 rounded-2xl p-6 flex flex-wrap gap-6 justify-center text-sm text-gray-600">
            {school.email && (
              <a href={`mailto:${school.email}`} className="flex items-center gap-2 hover:text-indigo-600">
                <Mail className="h-4 w-4" /> {school.email}
              </a>
            )}
            {school.phone && (
              <a href={`tel:${school.phone}`} className="flex items-center gap-2 hover:text-indigo-600">
                <Phone className="h-4 w-4" /> {school.phone}
              </a>
            )}
            {school.website && (
              <a href={school.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 hover:text-indigo-600">
                <Globe className="h-4 w-4" /> {t("publicJourney.hub.website")}
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
