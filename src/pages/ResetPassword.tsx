import { useState, useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ArrowLeft,
  GraduationCap,
  Loader2,
  Eye,
  EyeOff,
  CheckCircle,
  XCircle,
  Lock,
} from "lucide-react";
import apiClient from "@/api/client";

// ─── Background pattern ───────────────────────────────────────────────────────

function LoginPattern() {
  return (
    <svg className="absolute inset-0 w-full h-full" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <pattern id="rpGrid" width="40" height="40" patternUnits="userSpaceOnUse">
          <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="0.5" />
        </pattern>
        <pattern id="rpDots" width="20" height="20" patternUnits="userSpaceOnUse">
          <circle cx="10" cy="10" r="0.8" fill="rgba(255,255,255,0.03)" />
        </pattern>
        <radialGradient id="rpGlow1" cx="15%" cy="25%" r="55%">
          <stop offset="0%" stopColor="rgba(99,102,241,0.08)" />
          <stop offset="100%" stopColor="transparent" />
        </radialGradient>
        <radialGradient id="rpGlow2" cx="85%" cy="75%" r="45%">
          <stop offset="0%" stopColor="rgba(79,70,229,0.06)" />
          <stop offset="100%" stopColor="transparent" />
        </radialGradient>
      </defs>
      <rect width="100%" height="100%" fill="url(#rpGrid)" />
      <rect width="100%" height="100%" fill="url(#rpDots)" />
      <rect width="100%" height="100%" fill="url(#rpGlow1)" />
      <rect width="100%" height="100%" fill="url(#rpGlow2)" />
    </svg>
  );
}

// ─── Password strength indicator ─────────────────────────────────────────────

interface StrengthRule {
  label: string;
  ok: boolean;
}

function getStrengthRules(password: string): StrengthRule[] {
  return [
    { label: "8 caractères minimum", ok: password.length >= 8 },
    { label: "Une majuscule (A-Z)", ok: /[A-Z]/.test(password) },
    { label: "Une minuscule (a-z)", ok: /[a-z]/.test(password) },
    { label: "Un chiffre (0-9)", ok: /[0-9]/.test(password) },
    { label: "Un caractère spécial (!@#…)", ok: /[^A-Za-z0-9]/.test(password) },
  ];
}

function PasswordStrength({ password }: { password: string }) {
  if (!password) return null;
  const rules = getStrengthRules(password);
  const score = rules.filter((r) => r.ok).length;
  const colors = ["bg-red-500", "bg-orange-500", "bg-yellow-500", "bg-lime-500", "bg-green-500"];
  const labels = ["Très faible", "Faible", "Moyen", "Fort", "Très fort"];

  return (
    <div className="mt-3 space-y-2">
      {/* Progress bar */}
      <div className="flex gap-1">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className={`h-1.5 flex-1 rounded-full transition-colors ${
              i < score ? colors[score - 1] : "bg-gray-200 dark:bg-gray-700"
            }`}
          />
        ))}
      </div>
      <p className={`text-xs font-medium ${score >= 4 ? "text-green-600" : score >= 3 ? "text-yellow-600" : "text-red-600"}`}>
        {labels[score - 1] ?? ""}
      </p>
      {/* Rules checklist */}
      <ul className="space-y-1">
        {rules.map((rule) => (
          <li key={rule.label} className="flex items-center gap-2 text-xs">
            {rule.ok ? (
              <CheckCircle className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
            ) : (
              <XCircle className="w-3.5 h-3.5 text-gray-300 dark:text-gray-600 flex-shrink-0" />
            )}
            <span className={rule.ok ? "text-green-700 dark:text-green-400" : "text-gray-400 dark:text-gray-500"}>
              {rule.label}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

const ResetPassword = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [tokenValid, setTokenValid] = useState<boolean | null>(null); // null = loading
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  // Validate token on mount
  useEffect(() => {
    if (!token) {
      setTokenValid(false);
      return;
    }
    apiClient
      .get(`/auth/validate-reset-token/?token=${encodeURIComponent(token)}`)
      .then((res) => setTokenValid(res.data?.valid === true))
      .catch(() => setTokenValid(false));
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (newPassword !== confirmPassword) {
      toast({
        title: "Les mots de passe ne correspondent pas",
        description: "Vérifiez votre saisie et réessayez.",
        variant: "destructive",
      });
      return;
    }

    const rules = getStrengthRules(newPassword);
    if (rules.some((r) => !r.ok)) {
      toast({
        title: "Mot de passe trop faible",
        description: "Votre mot de passe ne respecte pas tous les critères de sécurité.",
        variant: "destructive",
      });
      return;
    }

    setSubmitting(true);
    try {
      await apiClient.post("/auth/reset-password/", { token, new_password: newPassword });
      setDone(true);
      toast({
        title: "Mot de passe mis à jour !",
        description: "Vous allez être redirigé vers la page de connexion.",
      });
      setTimeout(() => navigate("/auth", { replace: true }), 3000);
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      if (err?.response?.status === 400) {
        setTokenValid(false);
      }
      toast({
        title: "Erreur",
        description: detail ?? "Une erreur est survenue. Réessayez depuis l'email.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* ── Left panel (branding) ── */}
      <div className="hidden lg:flex lg:w-1/2 relative bg-gradient-to-br from-indigo-900 via-indigo-800 to-purple-900 flex-col items-center justify-center p-12 overflow-hidden">
        <LoginPattern />
        <div className="relative z-10 text-center">
          <div className="w-20 h-20 bg-white/10 backdrop-blur-sm rounded-3xl flex items-center justify-center mx-auto mb-6 border border-white/20">
            <GraduationCap className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-4xl font-bold text-white mb-3">SchoolFlow Pro</h1>
          <p className="text-indigo-200 text-lg max-w-sm">
            Créez un mot de passe fort pour sécuriser votre compte.
          </p>
        </div>
      </div>

      {/* ── Right panel ── */}
      <div className="flex-1 flex items-center justify-center p-8 bg-gray-50 dark:bg-gray-950">
        <div className="w-full max-w-md">
          <Link
            to="/auth"
            className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 mb-8 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Retour à la connexion
          </Link>

          {/* ── Loading ── */}
          {tokenValid === null && (
            <div className="flex flex-col items-center gap-4 py-16 text-gray-500">
              <Loader2 className="w-8 h-8 animate-spin" />
              <p className="text-sm">Vérification du lien…</p>
            </div>
          )}

          {/* ── Invalid / expired token ── */}
          {tokenValid === false && (
            <div className="text-center py-8">
              <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-6">
                <XCircle className="w-8 h-8 text-red-600 dark:text-red-400" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-3">
                Lien invalide ou expiré
              </h2>
              <p className="text-gray-600 dark:text-gray-400 mb-8 text-sm">
                Ce lien de réinitialisation n'est plus valide. Il a peut-être déjà été utilisé
                ou a expiré après 15 minutes.
              </p>
              <Button asChild className="w-full">
                <Link to="/forgot-password">Faire une nouvelle demande</Link>
              </Button>
            </div>
          )}

          {/* ── Success ── */}
          {done && (
            <div className="text-center py-8">
              <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-6">
                <CheckCircle className="w-8 h-8 text-green-600 dark:text-green-400" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-3">
                Mot de passe mis à jour !
              </h2>
              <p className="text-gray-600 dark:text-gray-400 mb-8 text-sm">
                Votre mot de passe a été modifié avec succès. Vous allez être redirigé vers la connexion…
              </p>
              <Button asChild variant="outline" className="w-full">
                <Link to="/auth">Se connecter maintenant</Link>
              </Button>
            </div>
          )}

          {/* ── Reset form ── */}
          {tokenValid === true && !done && (
            <>
              <div className="mb-8">
                <div className="w-12 h-12 bg-indigo-100 dark:bg-indigo-900/30 rounded-2xl flex items-center justify-center mb-4">
                  <Lock className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
                </div>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                  Nouveau mot de passe
                </h2>
                <p className="text-gray-500 dark:text-gray-400 text-sm">
                  Choisissez un mot de passe sécurisé d'au moins 8 caractères.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">
                {/* New password */}
                <div className="space-y-2">
                  <Label htmlFor="new-password">Nouveau mot de passe</Label>
                  <div className="relative">
                    <Input
                      id="new-password"
                      type={showNew ? "text" : "password"}
                      placeholder="••••••••"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      autoComplete="new-password"
                      autoFocus
                      className="h-11 pr-10"
                      disabled={submitting}
                      required
                    />
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={() => setShowNew((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      aria-label={showNew ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                    >
                      {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <PasswordStrength password={newPassword} />
                </div>

                {/* Confirm password */}
                <div className="space-y-2">
                  <Label htmlFor="confirm-password">Confirmer le mot de passe</Label>
                  <div className="relative">
                    <Input
                      id="confirm-password"
                      type={showConfirm ? "text" : "password"}
                      placeholder="••••••••"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      autoComplete="new-password"
                      className="h-11 pr-10"
                      disabled={submitting}
                      required
                    />
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={() => setShowConfirm((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      aria-label={showConfirm ? "Masquer" : "Afficher"}
                    >
                      {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {confirmPassword && newPassword !== confirmPassword && (
                    <p className="text-xs text-red-500 flex items-center gap-1">
                      <XCircle className="w-3.5 h-3.5" />
                      Les mots de passe ne correspondent pas
                    </p>
                  )}
                  {confirmPassword && newPassword === confirmPassword && (
                    <p className="text-xs text-green-500 flex items-center gap-1">
                      <CheckCircle className="w-3.5 h-3.5" />
                      Les mots de passe correspondent
                    </p>
                  )}
                </div>

                <Button
                  type="submit"
                  className="w-full h-11"
                  disabled={submitting || !newPassword || !confirmPassword}
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Enregistrement…
                    </>
                  ) : (
                    "Enregistrer le nouveau mot de passe"
                  )}
                </Button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default ResetPassword;
