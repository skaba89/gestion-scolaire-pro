import { useState } from "react";
import { Link } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, GraduationCap, Loader2, Mail, CheckCircle } from "lucide-react";
import apiClient from "@/api/client";

// ─── Background pattern (shared style with AuthNative) ───────────────────────

function LoginPattern() {
  return (
    <svg className="absolute inset-0 w-full h-full" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <pattern id="fpGrid" width="40" height="40" patternUnits="userSpaceOnUse">
          <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="0.5" />
        </pattern>
        <pattern id="fpDots" width="20" height="20" patternUnits="userSpaceOnUse">
          <circle cx="10" cy="10" r="0.8" fill="rgba(255,255,255,0.03)" />
        </pattern>
        <radialGradient id="fpGlow1" cx="15%" cy="25%" r="55%">
          <stop offset="0%" stopColor="rgba(99,102,241,0.08)" />
          <stop offset="100%" stopColor="transparent" />
        </radialGradient>
        <radialGradient id="fpGlow2" cx="85%" cy="75%" r="45%">
          <stop offset="0%" stopColor="rgba(79,70,229,0.06)" />
          <stop offset="100%" stopColor="transparent" />
        </radialGradient>
      </defs>
      <rect width="100%" height="100%" fill="url(#fpGrid)" />
      <rect width="100%" height="100%" fill="url(#fpDots)" />
      <rect width="100%" height="100%" fill="url(#fpGlow1)" />
      <rect width="100%" height="100%" fill="url(#fpGlow2)" />
    </svg>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

const ForgotPassword = () => {
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      toast({
        title: "Email requis",
        description: "Veuillez saisir votre adresse email.",
        variant: "destructive",
      });
      return;
    }

    setSubmitting(true);
    try {
      await apiClient.post("/auth/forgot-password/", { email: trimmedEmail });
      setSent(true);
    } catch (err: any) {
      // Surface server errors but keep it generic for security
      toast({
        title: "Erreur",
        description: err?.response?.data?.detail ?? "Une erreur est survenue. Réessayez dans quelques instants.",
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
            Plateforme de gestion scolaire intelligente pour les établissements d'Afrique francophone.
          </p>
        </div>
      </div>

      {/* ── Right panel (form) ── */}
      <div className="flex-1 flex items-center justify-center p-8 bg-gray-50 dark:bg-gray-950">
        <div className="w-full max-w-md">
          {/* Back link */}
          <Link
            to="/auth"
            className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 mb-8 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Retour à la connexion
          </Link>

          {sent ? (
            /* ── Success state ── */
            <div className="text-center py-8">
              <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-6">
                <CheckCircle className="w-8 h-8 text-green-600 dark:text-green-400" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-3">
                Email envoyé !
              </h2>
              <p className="text-gray-600 dark:text-gray-400 mb-2">
                Si l'adresse <strong>{email}</strong> est associée à un compte actif,
                vous recevrez un email avec un lien de réinitialisation.
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-500 mb-8">
                Le lien expire dans <strong>15 minutes</strong>. Vérifiez aussi vos spams.
              </p>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => {
                  setSent(false);
                  setEmail("");
                }}
              >
                Envoyer un autre lien
              </Button>
            </div>
          ) : (
            /* ── Request form ── */
            <>
              <div className="mb-8">
                <div className="w-12 h-12 bg-indigo-100 dark:bg-indigo-900/30 rounded-2xl flex items-center justify-center mb-4">
                  <Mail className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
                </div>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                  Mot de passe oublié ?
                </h2>
                <p className="text-gray-500 dark:text-gray-400 text-sm">
                  Saisissez votre adresse email et nous vous enverrons un lien pour créer un nouveau mot de passe.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="email">Adresse email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="vous@etablissement.edu"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    autoFocus
                    className="h-11"
                    disabled={submitting}
                    required
                  />
                </div>

                <Button type="submit" className="w-full h-11" disabled={submitting}>
                  {submitting ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Envoi en cours…
                    </>
                  ) : (
                    "Envoyer le lien de réinitialisation"
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

export default ForgotPassword;
