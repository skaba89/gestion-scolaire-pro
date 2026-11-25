/**
 * ReEnrollment — formulaire de réinscription pour un étudiant existant
 * Route: /inscription/:tenantSlug/reinscription
 */
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Loader2, Search, CheckCircle, AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import axios from "axios";

interface TenantInfo {
  id: string;
  name: string;
  levels: { id: string; name: string }[];
  current_academic_year: { id: string; name: string } | null;
  admissions_open: boolean;
}

interface VerifiedStudent {
  student_id: string;
  student_name: string;
  registration_number: string;
  current_level: string;
  masked_email: string;
  masked_phone: string;
}

interface SubmitResult {
  reference: string;
  status: string;
  status_label: string;
  submitted_at: string;
  message: string;
}

function getApiBase() {
  return (window as any).__SCHOOLFLOW_CONFIG__?.API_URL || import.meta.env.VITE_API_URL || "";
}

export default function ReEnrollment() {
  const { t } = useTranslation();

  const { tenantSlug } = useParams<{ tenantSlug: string }>();
  const navigate = useNavigate();

  const [school, setSchool] = useState<TenantInfo | null>(null);
  const [schoolLoading, setSchoolLoading] = useState(true);

  // Step 1: verify student
  const [registrationNumber, setRegistrationNumber] = useState("");
  const [parentEmail, setParentEmail] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [student, setStudent] = useState<VerifiedStudent | null>(null);

  // Step 2: fill form
  const [levelId, setLevelId] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<SubmitResult | null>(null);

  useEffect(() => {
    if (!tenantSlug) return;
    axios
      .get(`${getApiBase()}/api/v1/admissions/public/tenant-info/${tenantSlug}/`)
      .then((r) => setSchool(r.data))
      .catch(() => setSchool(null))
      .finally(() => setSchoolLoading(false));
  }, [tenantSlug]);

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!school) return;
    setVerifying(true);
    setVerifyError(null);
    setStudent(null);
    try {
      const r = await axios.post(`${getApiBase()}/api/v1/admissions/public/verify-student/`, {
        tenant_id: school.id,
        registration_number: registrationNumber.trim(),
        parent_email: parentEmail.trim(),
      });
      setStudent(r.data);
    } catch (err: any) {
      setVerifyError(
        err.response?.data?.detail ||
          t("publicJourney.reenroll.verifyError")
      );
    } finally {
      setVerifying(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!school || !student || !levelId) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const r = await axios.post(`${getApiBase()}/api/v1/admissions/public/reenroll/`, {
        tenant_id: school.id,
        student_id: student.student_id,
        // Le serveur revérifie matricule + e-mail parent (SEC-ADM-01).
        registration_number: registrationNumber.trim(),
        academic_year_id: school.current_academic_year?.id,
        level_id: levelId,
        parent_email: parentEmail.trim(),
        notes: notes.trim() || undefined,
      });
      setResult(r.data);
    } catch (err: any) {
      setSubmitError(
        err.response?.data?.detail || t("publicJourney.reenroll.genericError")
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (schoolLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-amber-50 to-orange-100">
        <Loader2 className="h-10 w-10 animate-spin text-amber-600" />
      </div>
    );
  }

  if (!school) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-amber-50 to-orange-100 p-6">
        <div className="bg-white rounded-2xl shadow p-8 text-center max-w-sm">
          <AlertCircle className="h-10 w-10 text-red-400 mx-auto mb-3" />
          <p className="text-gray-700 font-medium">{t("publicJourney.reenroll.notFound")}</p>
          <Button className="mt-5" onClick={() => navigate("/connexion")}>{t("publicJourney.reenroll.back")}</Button>
        </div>
      </div>
    );
  }

  // Success screen
  if (result) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-amber-50 to-orange-100 p-6">
        <div className="bg-white rounded-2xl shadow-lg p-10 max-w-md text-center">
          <CheckCircle className="h-14 w-14 text-green-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">{t("publicJourney.reenroll.submitted")}</h2>
          <p className="text-gray-600 mb-4">{result.message}</p>
          <div className="bg-gray-50 rounded-xl p-4 text-left mb-6">
            <p className="text-xs text-gray-500 mb-1">{t("publicJourney.reenroll.reference")}</p>
            <p className="font-mono text-sm font-semibold text-indigo-700 break-all">{result.reference}</p>
            <p className="text-xs text-gray-400 mt-2">{t("publicJourney.reenroll.keepReference")}</p>
          </div>
          <div className="flex gap-3">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => navigate(`/inscription/${tenantSlug}/statut`)}
            >
              {t("publicJourney.reenroll.track")}
            </Button>
            <Button className="flex-1" onClick={() => navigate(`/inscription/${tenantSlug}`)}>
              {t("publicJourney.reenroll.backToPortal")}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 to-orange-100">
      <div className="max-w-xl mx-auto px-6 py-10">
        <Button
          variant="ghost"
          size="sm"
          className="mb-6 text-amber-700 hover:bg-amber-50"
          onClick={() => navigate(`/inscription/${tenantSlug}`)}
        >
          <ArrowLeft className="h-4 w-4 mr-2" /> {t("publicJourney.reenroll.backToPortal")}
        </Button>

        <div className="flex justify-end mb-2"><LanguageSwitcher /></div>
        <div className="bg-white rounded-2xl shadow-md p-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-amber-100 rounded-xl">
              <RefreshCw className="h-6 w-6 text-amber-600" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">{t("publicJourney.reenroll.title")}</h1>
              <p className="text-sm text-gray-500">{school.name}</p>
            </div>
          </div>

          {!school.admissions_open && (
            <div className="mb-6 flex items-start gap-3 bg-yellow-50 border border-yellow-200 rounded-xl p-4">
              <AlertCircle className="h-5 w-5 text-yellow-600 shrink-0 mt-0.5" />
              <p className="text-sm text-yellow-800">
                {t("publicJourney.reenroll.closed")}
              </p>
            </div>
          )}

          {/* Step 1: Verify student identity */}
          {!student && (
            <>
              <p className="text-sm text-gray-600 mb-5">
                {t("publicJourney.reenroll.intro")}
              </p>
              <form onSubmit={handleVerify} className="space-y-4">
                <div>
                  <Label htmlFor="reg">{t("publicJourney.reenroll.registrationNumber")}</Label>
                  <Input
                    id="reg"
                    placeholder={t("publicJourney.reenroll.registrationPlaceholder")}
                    value={registrationNumber}
                    onChange={(e) => setRegistrationNumber(e.target.value)}
                    required
                    className="mt-1"
                    disabled={!school.admissions_open}
                  />
                </div>
                <div>
                  <Label htmlFor="pemail">{t("publicJourney.reenroll.parentEmail")}</Label>
                  <Input
                    id="pemail"
                    type="email"
                    placeholder="parent@example.com"
                    value={parentEmail}
                    onChange={(e) => setParentEmail(e.target.value)}
                    required
                    className="mt-1"
                    disabled={!school.admissions_open}
                  />
                </div>
                {verifyError && (
                  <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg p-3">
                    <AlertCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                    <p className="text-sm text-red-700">{verifyError}</p>
                  </div>
                )}
                <Button type="submit" className="w-full" disabled={verifying || !school.admissions_open}>
                  {verifying ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> {t("publicJourney.reenroll.verifying")}</>
                  ) : (
                    <><Search className="h-4 w-4 mr-2" /> {t("publicJourney.reenroll.verify")}</>
                  )}
                </Button>
              </form>
            </>
          )}

          {/* Step 2: Confirm & submit */}
          {student && (
            <>
              {/* Confirmed student card */}
              <div className="mb-6 bg-green-50 border border-green-200 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  <span className="text-sm font-semibold text-green-800">{t("publicJourney.reenroll.verified")}</span>
                </div>
                <p className="text-sm text-gray-800 font-medium">{student.student_name}</p>
                <p className="text-xs text-gray-500">
                  {t("publicJourney.reenroll.studentLine", { number: student.registration_number, level: student.current_level ?? "—" })}
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  {t("publicJourney.reenroll.contactLine", { email: student.masked_email, phone: student.masked_phone })}
                </p>
                <button
                  type="button"
                  className="mt-2 text-xs text-indigo-600 hover:underline"
                  onClick={() => { setStudent(null); setVerifyError(null); }}
                >
                  {t("publicJourney.reenroll.notMe")}
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label>{t("publicJourney.reenroll.schoolYear")}</Label>
                  <Input
                    value={school.current_academic_year?.name ?? "—"}
                    readOnly
                    className="mt-1 bg-gray-50 text-gray-600"
                  />
                </div>
                <div>
                  <Label htmlFor="level">{t("publicJourney.reenroll.level")}</Label>
                  <Select value={levelId} onValueChange={setLevelId} required>
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder={t("publicJourney.reenroll.levelPlaceholder")} />
                    </SelectTrigger>
                    <SelectContent>
                      {school.levels.map((l) => (
                        <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="notes">
                    {t("publicJourney.reenroll.notes")} <span className="text-gray-400 font-normal">{t("publicJourney.reenroll.optional")}</span>
                  </Label>
                  <Textarea
                    id="notes"
                    placeholder={t("publicJourney.reenroll.notesPlaceholder")}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="mt-1"
                    rows={3}
                  />
                </div>
                {submitError && (
                  <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg p-3">
                    <AlertCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                    <p className="text-sm text-red-700">{submitError}</p>
                  </div>
                )}
                <Button type="submit" className="w-full bg-amber-600 hover:bg-amber-700" disabled={submitting || !levelId}>
                  {submitting ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> {t("publicJourney.reenroll.sending")}</>
                  ) : (
                    t("publicJourney.reenroll.submit")
                  )}
                </Button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
