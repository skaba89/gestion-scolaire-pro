/**
 * EnrollmentHub — portail central d'inscription en ligne par établissement.
 * Paths:
 *  1. Étudiant inscrit → login vers son espace
 *  2. Réinscription (étudiant existant, nouvelle année)
 *  3. Nouvelle candidature (nouvel étudiant)
 */
import { useEffect, useState } from "react";
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

const TYPE_LABELS: Record<string, string> = {
  primary_school: "École Primaire",
  middle_school: "Collège",
  high_school: "Lycée",
  university: "Université",
  training_center: "Centre de Formation",
  school: "Établissement Scolaire",
};

export default function EnrollmentHub() {
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
          setError("Établissement introuvable. Vérifiez l'adresse et réessayez.");
        } else {
          setError("Impossible de charger les informations de l'établissement.");
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
          <h2 className="text-xl font-bold text-gray-800 mb-2">Oups !</h2>
          <p className="text-gray-600">{error}</p>
          <Button className="mt-6" onClick={() => navigate("/connexion")}>
            Retour à l'accueil
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
            <p className="text-sm text-gray-500">{TYPE_LABELS[school.type] ?? school.type}</p>
          </div>
          <Badge variant={school.admissions_open ? "default" : "secondary"} className="shrink-0">
            {school.admissions_open ? "Inscriptions ouvertes" : "Inscriptions fermées"}
          </Badge>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-10">
        {/* Intro */}
        <div className="text-center mb-10">
          <h2 className="text-3xl font-extrabold text-gray-900 mb-3">
            Portail d'inscription en ligne
          </h2>
          <p className="text-gray-600 text-lg">
            Année scolaire : <span className="font-semibold text-indigo-700">{yearName}</span>
          </p>
          <p className="text-gray-500 mt-1 text-sm">Choisissez votre situation ci-dessous</p>
        </div>

        {/* 3 path cards */}
        <div className="grid md:grid-cols-3 gap-6">
          {/* Path 1: Login */}
          <div className="bg-white rounded-2xl shadow-md hover:shadow-lg transition-shadow p-7 flex flex-col">
            <div className="p-3 bg-blue-100 rounded-xl w-fit mb-4">
              <LogIn className="h-7 w-7 text-blue-600" />
            </div>
            <h3 className="text-lg font-bold text-gray-900 mb-2">Je suis déjà inscrit</h3>
            <p className="text-sm text-gray-600 flex-1 mb-6">
              Vous avez un compte étudiant actif ? Accédez directement à votre espace personnel.
            </p>
            <Button
              className="w-full"
              onClick={() => window.location.href = `/${tenantSlug}/auth`}
            >
              Se connecter
            </Button>
          </div>

          {/* Path 2: Re-enrollment */}
          <div className="bg-white rounded-2xl shadow-md hover:shadow-lg transition-shadow p-7 flex flex-col">
            <div className="p-3 bg-amber-100 rounded-xl w-fit mb-4">
              <RefreshCw className="h-7 w-7 text-amber-600" />
            </div>
            <h3 className="text-lg font-bold text-gray-900 mb-2">Réinscription</h3>
            <p className="text-sm text-gray-600 flex-1 mb-6">
              Étudiant déjà scolarisé dans cet établissement ? Faites votre demande de réinscription pour la nouvelle année.
            </p>
            <Button
              variant="outline"
              className="w-full border-amber-400 text-amber-700 hover:bg-amber-50"
              disabled={!school.admissions_open}
              onClick={() => navigate(`/inscription/${tenantSlug}/reinscription`)}
            >
              Réinscription
            </Button>
          </div>

          {/* Path 3: New application */}
          <div className="bg-white rounded-2xl shadow-md hover:shadow-lg transition-shadow p-7 flex flex-col">
            <div className="p-3 bg-green-100 rounded-xl w-fit mb-4">
              <FileText className="h-7 w-7 text-green-600" />
            </div>
            <h3 className="text-lg font-bold text-gray-900 mb-2">Nouvelle candidature</h3>
            <p className="text-sm text-gray-600 flex-1 mb-6">
              Nouvel étudiant ? Déposez votre dossier de candidature. Notre équipe l'examinera et vous contactera.
            </p>
            <Button
              variant="outline"
              className="w-full border-green-500 text-green-700 hover:bg-green-50"
              disabled={!school.admissions_open}
              onClick={() => navigate(`/admissions/${tenantSlug}`)}
            >
              Déposer un dossier
            </Button>
          </div>
        </div>

        {/* Check status link */}
        <div className="mt-8 text-center">
          <p className="text-sm text-gray-500">
            Vous avez déjà soumis un dossier ?{" "}
            <Link
              to={`/inscription/${tenantSlug}/statut`}
              className="text-indigo-600 font-medium hover:underline"
            >
              Suivre l'état de ma candidature →
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
                <Globe className="h-4 w-4" /> Site web
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
