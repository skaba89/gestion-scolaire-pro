/**
 * ApplicationStatus — consulter le statut d'une ou plusieurs candidatures
 * Route: /inscription/:tenantSlug/statut
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { useParams, useNavigate } from "react-router-dom";
import { Search, ArrowLeft, Loader2, CheckCircle, XCircle, Clock, RefreshCw, AlertCircle, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import axios from "axios";
import { AdmissionTimeline } from "@/components/admin/admissions/AdmissionTimeline";
import type { AdmissionStep } from "@/queries/admissions";

interface Application {
  id: string;
  status: string;
  status_label: string;
  status_color: string;
  student_name: string;
  level: string;
  submitted_at: string | null;
  notes: string | null;
  type: string;
  steps: AdmissionStep[];
}

const STATUS_ICONS: Record<string, JSX.Element> = {
  DRAFT: <FileText className="h-5 w-5 text-gray-500" />,
  SUBMITTED: <Clock className="h-5 w-5 text-blue-500" />,
  UNDER_REVIEW: <RefreshCw className="h-5 w-5 text-yellow-500" />,
  ACCEPTED: <CheckCircle className="h-5 w-5 text-green-500" />,
  REJECTED: <XCircle className="h-5 w-5 text-red-500" />,
  CONVERTED_TO_STUDENT: <CheckCircle className="h-5 w-5 text-emerald-600" />,
};

const BADGE_VARIANTS: Record<string, string> = {
  gray: "secondary",
  blue: "default",
  yellow: "outline",
  green: "default",
  emerald: "default",
  red: "destructive",
};

function getApiBase() {
  return (window as any).__SCHOOLFLOW_CONFIG__?.API_URL || import.meta.env.VITE_API_URL || "";
}

export default function ApplicationStatus() {
  const { t, i18n } = useTranslation();

  const { tenantSlug } = useParams<{ tenantSlug: string }>();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [reference, setReference] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<Application[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tenantId, setTenantId] = useState<string | null>(null);

  // Resolve tenant ID on first search
  const resolveTenantId = async (): Promise<string | null> => {
    if (tenantId) return tenantId;
    try {
      const r = await axios.get(`${getApiBase()}/api/v1/admissions/public/tenant-info/${tenantSlug}/`);
      setTenantId(r.data.id);
      return r.data.id;
    } catch {
      return null;
    }
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    setError(null);
    setResults(null);

    const tid = await resolveTenantId();
    if (!tid) {
      setError(t("publicJourney.status.notFound"));
      setLoading(false);
      return;
    }

    try {
      const params: Record<string, string> = { tenant_id: tid, email: email.trim() };
      if (reference.trim()) params.reference = reference.trim();
      const r = await axios.get(`${getApiBase()}/api/v1/admissions/public/status/`, { params });
      setResults(r.data.applications);
      if (r.data.applications.length === 0) {
        setError(t("publicJourney.status.noResult"));
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || t("publicJourney.status.genericError"));
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (iso: string | null) => {
    if (!iso) return "—";
    return new Date(iso).toLocaleDateString(i18n.language === "fr" ? "fr-FR" : i18n.language, { day: "2-digit", month: "long", year: "numeric" });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="max-w-2xl mx-auto px-6 py-10">
        {/* Back button */}
        <Button
          variant="ghost"
          size="sm"
          className="mb-6 text-indigo-700 hover:bg-indigo-50"
          onClick={() => navigate(`/inscription/${tenantSlug}`)}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          {t("publicJourney.status.backToPortal")}
        </Button>

        <div className="flex justify-end mb-2"><LanguageSwitcher /></div>
        <div className="bg-white rounded-2xl shadow-md p-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">{t("publicJourney.status.title")}</h1>
          <p className="text-gray-500 text-sm mb-8">
            {t("publicJourney.status.intro")}
          </p>

          <form onSubmit={handleSearch} className="space-y-4">
            <div>
              <Label htmlFor="email">{t("publicJourney.status.parentEmail")}</Label>
              <Input
                id="email"
                type="email"
                placeholder="exemple@mail.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="reference">
                {t("publicJourney.status.reference")} <span className="text-gray-400 font-normal">{t("publicJourney.status.optional")}</span>
              </Label>
              <Input
                id="reference"
                placeholder={t("publicJourney.status.referencePlaceholder")}
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                className="mt-1"
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> {t("publicJourney.status.searching")}</>
              ) : (
                <><Search className="h-4 w-4 mr-2" /> {t("publicJourney.status.check")}</>
              )}
            </Button>
          </form>

          {/* Error */}
          {error && (
            <div className="mt-6 flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl p-4">
              <AlertCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {/* Results */}
          {results && results.length > 0 && (
            <div className="mt-8 space-y-4">
              <h2 className="text-base font-semibold text-gray-700">
                {t("publicJourney.status.found", { count: results.length })}
              </h2>
              {results.map((app) => (
                <div key={app.id} className="border border-gray-200 rounded-xl p-5 bg-gray-50">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3">
                      {STATUS_ICONS[app.status] ?? <FileText className="h-5 w-5 text-gray-400" />}
                      <div>
                        <p className="font-semibold text-gray-900">{app.student_name}</p>
                        <p className="text-xs text-gray-500">
                          {app.type === "REINSCRIPTION" ? t("publicJourney.status.reenrollment") : t("publicJourney.status.newApplication")}{" "}
                          · {app.level ?? "—"}
                        </p>
                      </div>
                    </div>
                    <Badge
                      variant={(BADGE_VARIANTS[app.status_color] as any) ?? "secondary"}
                      className="shrink-0"
                    >
                      {t(`publicJourney.status.statuses.${app.status}`, { defaultValue: app.status_label })}
                    </Badge>
                  </div>
                  <div className="mt-3 text-xs text-gray-500 flex gap-4">
                    <span>{t("publicJourney.status.submittedOn", { date: formatDate(app.submitted_at) })}</span>
                    <span className="text-gray-300">|</span>
                    <span className="font-mono truncate max-w-[200px]">{t("publicJourney.status.ref", { id: app.id })}</span>
                  </div>
                  {app.notes && (
                    <p className="mt-2 text-xs text-gray-600 italic bg-white rounded-lg p-2 border border-gray-100">
                      {app.notes}
                    </p>
                  )}
                  {app.steps && app.steps.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-gray-200">
                      <AdmissionTimeline steps={app.steps} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
