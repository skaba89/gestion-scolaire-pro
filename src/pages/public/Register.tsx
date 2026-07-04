/**
 * Self-service school registration — 3-step wizard
 *
 * Step 1 : School info   (name, type, country)
 * Step 2 : Admin account (first_name, last_name, email, password)
 * Step 3 : Review & submit → redirect to onboarding
 */
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import apiClient from "@/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  GraduationCap, ArrowLeft, ArrowRight, Loader2, CheckCircle,
  School, User, Eye, EyeOff, Sparkles, Shield,
} from "lucide-react";

// ─── Data ─────────────────────────────────────────────────────────────────────

const SCHOOL_TYPES = [
  { value: "primary",    label: "École primaire" },
  { value: "middle",     label: "Collège" },
  { value: "high",       label: "Lycée" },
  { value: "university", label: "Université / Grandes écoles" },
  { value: "training",   label: "Centre de formation" },
];

const COUNTRIES = [
  { value: "GN", label: "🇬🇳 Guinée" },
  { value: "SN", label: "🇸🇳 Sénégal" },
  { value: "CI", label: "🇨🇮 Côte d'Ivoire" },
  { value: "ML", label: "🇲🇱 Mali" },
  { value: "BF", label: "🇧🇫 Burkina Faso" },
  { value: "CM", label: "🇨🇲 Cameroun" },
  { value: "TG", label: "🇹🇬 Togo" },
  { value: "BJ", label: "🇧🇯 Bénin" },
  { value: "NE", label: "🇳🇪 Niger" },
  { value: "CD", label: "🇨🇩 RD Congo" },
  { value: "MA", label: "🇲🇦 Maroc" },
  { value: "DZ", label: "🇩🇿 Algérie" },
  { value: "TN", label: "🇹🇳 Tunisie" },
  { value: "FR", label: "🇫🇷 France" },
  { value: "OTHER", label: "Autre pays" },
];

// Password strength (same logic as ResetPassword page)
function getStrengthRules(pw: string) {
  return [
    { label: "8 caractères minimum", ok: pw.length >= 8 },
    { label: "Une majuscule", ok: /[A-Z]/.test(pw) },
    { label: "Une minuscule", ok: /[a-z]/.test(pw) },
    { label: "Un chiffre", ok: /[0-9]/.test(pw) },
    { label: "Un caractère spécial", ok: /[^A-Za-z0-9]/.test(pw) },
  ];
}

function PasswordStrength({ pw }: { pw: string }) {
  if (!pw) return null;
  const rules = getStrengthRules(pw);
  const score = rules.filter((r) => r.ok).length;
  const colors = ["bg-red-500", "bg-orange-500", "bg-yellow-500", "bg-lime-500", "bg-green-500"];
  return (
    <div className="mt-2 space-y-1.5">
      <div className="flex gap-1">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className={`h-1 flex-1 rounded-full ${i < score ? colors[score - 1] : "bg-gray-200 dark:bg-gray-700"}`} />
        ))}
      </div>
      <ul className="space-y-0.5">
        {rules.map((r) => (
          <li key={r.label} className={`flex items-center gap-1.5 text-xs ${r.ok ? "text-green-600 dark:text-green-400" : "text-gray-400"}`}>
            <CheckCircle className={`w-3 h-3 ${r.ok ? "text-green-500" : "text-gray-300"}`} />
            {r.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── Step indicators ──────────────────────────────────────────────────────────

const STEPS = [
  { id: 1, label: "Votre établissement", icon: School },
  { id: 2, label: "Votre compte",        icon: User },
  { id: 3, label: "Confirmation",         icon: CheckCircle },
];

function StepIndicator({ current }: { current: number }) {
  return (
    <div className="flex items-center justify-center gap-2 mb-8">
      {STEPS.map((s, i) => {
        const done = current > s.id;
        const active = current === s.id;
        return (
          <div key={s.id} className="flex items-center gap-2">
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              done   ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" :
              active ? "bg-indigo-600 text-white" :
                       "bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500"
            }`}>
              {done ? <CheckCircle className="w-3.5 h-3.5" /> : <s.icon className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">{s.label}</span>
              <span className="sm:hidden">{s.id}</span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={`w-6 h-px ${done ? "bg-green-300" : "bg-gray-200 dark:bg-gray-700"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Form state ───────────────────────────────────────────────────────────────

interface FormData {
  school_name: string;
  school_type: string;
  country: string;
  first_name: string;
  last_name: string;
  email: string;
  password: string;
  confirm_password: string;
  accepted_terms: boolean;
}

const INITIAL: FormData = {
  school_name: "", school_type: "", country: "GN",
  first_name: "", last_name: "", email: "", password: "",
  confirm_password: "", accepted_terms: false,
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function Register() {
  const navigate = useNavigate();
  const { refreshProfile } = useAuth();
  const { toast } = useToast();

  const [step, setStep] = useState(1);
  const [form, setForm] = useState<FormData>(INITIAL);
  const [showPw, setShowPw] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const set = (k: keyof FormData, v: string | boolean) =>
    setForm((f) => ({ ...f, [k]: v }));

  // ── Step validation ──────────────────────────────────────────────────────

  const step1Valid = form.school_name.trim().length >= 2 && !!form.school_type && !!form.country;

  const step2Valid =
    form.first_name.trim() &&
    form.last_name.trim() &&
    form.email.includes("@") &&
    getStrengthRules(form.password).every((r) => r.ok) &&
    form.password === form.confirm_password;

  const step3Valid = form.accepted_terms;

  // ── Submit ───────────────────────────────────────────────────────────────

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const { data } = await apiClient.post("/auth/register-school/", {
        school_name: form.school_name.trim(),
        school_type: form.school_type,
        country: form.country,
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        email: form.email.trim().toLowerCase(),
        password: form.password,
      });

      // Store token + tenant so apiClient sends X-Tenant-ID on every call
      localStorage.setItem("schoolflow:access_token", data.access_token);
      if (data.tenant_id) {
        localStorage.setItem("last_tenant_id", data.tenant_id);
      }

      toast({
        title: "🎉 Établissement créé !",
        description: "Votre essai Pro de 30 jours est activé. Configurons votre école.",
      });

      // Hydrate the Auth context BEFORE navigating — otherwise the user
      // lands on onboarding with an empty tenant/profile context.
      await refreshProfile();
      navigate(data.onboarding_url, { replace: true });
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      toast({
        title: "Erreur lors de la création",
        description: detail ?? "Une erreur est survenue. Réessayez dans quelques instants.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen flex">
      {/* Left panel */}
      <div className="hidden lg:flex lg:w-2/5 relative bg-gradient-to-br from-indigo-900 via-indigo-800 to-purple-900 flex-col items-center justify-center p-12 overflow-hidden">
        <svg className="absolute inset-0 w-full h-full" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="regGrid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="0.5"/>
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#regGrid)"/>
        </svg>
        <div className="relative z-10 text-center max-w-xs">
          <div className="w-20 h-20 bg-white/10 backdrop-blur-sm rounded-3xl flex items-center justify-center mx-auto mb-6 border border-white/20">
            <GraduationCap className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-3">SchoolFlow Pro</h1>
          <p className="text-indigo-200 text-sm leading-relaxed mb-8">
            Créez votre espace scolaire en moins de 2 minutes et commencez votre essai Pro gratuit de 30 jours.
          </p>
          {/* Benefits */}
          <div className="space-y-3 text-left">
            {[
              "30 jours d'essai Pro gratuit",
              "Sans carte bancaire",
              "Données sécurisées & isolées",
              "Support inclus",
            ].map((b) => (
              <div key={b} className="flex items-center gap-2.5 text-sm text-white/80">
                <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0" />
                {b}
              </div>
            ))}
          </div>
          <p className="mt-10 text-indigo-300 text-xs">
            Déjà un compte ?{" "}
            <Link to="/auth" className="text-white underline underline-offset-2">Se connecter</Link>
          </p>
        </div>
      </div>

      {/* Right panel — form */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-10 bg-gray-50 dark:bg-gray-950 overflow-y-auto">
        <div className="w-full max-w-lg">
          {/* Mobile back link */}
          <Link to="/" className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 mb-6 lg:hidden">
            <ArrowLeft className="w-4 h-4" /> Retour à l'accueil
          </Link>

          <div className="mb-6">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Créer votre établissement</h2>
            <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">
              Inscription gratuite · Essai Pro 30 jours · Sans CB
            </p>
          </div>

          <StepIndicator current={step} />

          {/* ── STEP 1 : School info ── */}
          {step === 1 && (
            <div className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="school_name">Nom de l'établissement *</Label>
                <Input
                  id="school_name"
                  placeholder="Ex : Lycée Excellence de Conakry"
                  value={form.school_name}
                  onChange={(e) => set("school_name", e.target.value)}
                  autoFocus
                  className="h-11"
                />
              </div>

              <div className="space-y-2">
                <Label>Type d'établissement *</Label>
                <Select value={form.school_type} onValueChange={(v) => set("school_type", v)}>
                  <SelectTrigger className="h-11">
                    <SelectValue placeholder="Choisissez un type…" />
                  </SelectTrigger>
                  <SelectContent>
                    {SCHOOL_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Pays *</Label>
                <Select value={form.country} onValueChange={(v) => set("country", v)}>
                  <SelectTrigger className="h-11">
                    <SelectValue placeholder="Votre pays" />
                  </SelectTrigger>
                  <SelectContent>
                    {COUNTRIES.map((c) => (
                      <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Button
                className="w-full h-11 bg-indigo-600 hover:bg-indigo-700"
                disabled={!step1Valid}
                onClick={() => setStep(2)}
              >
                Continuer <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          )}

          {/* ── STEP 2 : Admin account ── */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="first_name">Prénom *</Label>
                  <Input
                    id="first_name"
                    placeholder="Mamadou"
                    value={form.first_name}
                    onChange={(e) => set("first_name", e.target.value)}
                    autoFocus
                    className="h-11"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="last_name">Nom *</Label>
                  <Input
                    id="last_name"
                    placeholder="Diallo"
                    value={form.last_name}
                    onChange={(e) => set("last_name", e.target.value)}
                    className="h-11"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Adresse email *</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="directeur@monecole.edu"
                  value={form.email}
                  onChange={(e) => set("email", e.target.value)}
                  autoComplete="email"
                  className="h-11"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Mot de passe *</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPw ? "text" : "password"}
                    placeholder="••••••••"
                    value={form.password}
                    onChange={(e) => set("password", e.target.value)}
                    className="h-11 pr-10"
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => setShowPw((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <PasswordStrength pw={form.password} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirm_password">Confirmer le mot de passe *</Label>
                <Input
                  id="confirm_password"
                  type="password"
                  placeholder="••••••••"
                  value={form.confirm_password}
                  onChange={(e) => set("confirm_password", e.target.value)}
                  className="h-11"
                />
                {form.confirm_password && form.password !== form.confirm_password && (
                  <p className="text-xs text-red-500">Les mots de passe ne correspondent pas</p>
                )}
              </div>

              <div className="flex gap-3 pt-2">
                <Button variant="outline" className="flex-1 h-11" onClick={() => setStep(1)}>
                  <ArrowLeft className="w-4 h-4 mr-2" /> Retour
                </Button>
                <Button
                  className="flex-1 h-11 bg-indigo-600 hover:bg-indigo-700"
                  disabled={!step2Valid}
                  onClick={() => setStep(3)}
                >
                  Continuer <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </div>
            </div>
          )}

          {/* ── STEP 3 : Review & confirm ── */}
          {step === 3 && (
            <div className="space-y-5">
              {/* Summary card */}
              <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5 space-y-3">
                <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-indigo-500" />
                  Résumé de votre inscription
                </h3>
                <dl className="space-y-2 text-sm">
                  {[
                    { label: "Établissement", value: form.school_name },
                    { label: "Type", value: SCHOOL_TYPES.find((t) => t.value === form.school_type)?.label },
                    { label: "Pays", value: COUNTRIES.find((c) => c.value === form.country)?.label },
                    { label: "Administrateur", value: `${form.first_name} ${form.last_name}` },
                    { label: "Email", value: form.email },
                  ].map(({ label, value }) => (
                    <div key={label} className="flex justify-between gap-4">
                      <dt className="text-gray-500 dark:text-gray-400 flex-shrink-0">{label}</dt>
                      <dd className="text-gray-900 dark:text-white font-medium text-right">{value}</dd>
                    </div>
                  ))}
                </dl>
              </div>

              {/* Trial badge */}
              <div className="flex items-start gap-3 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 rounded-xl p-4">
                <Shield className="w-5 h-5 text-indigo-600 dark:text-indigo-400 flex-shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="font-medium text-indigo-800 dark:text-indigo-300">Essai Pro gratuit — 30 jours</p>
                  <p className="text-indigo-600 dark:text-indigo-400 text-xs mt-0.5">
                    Accès complet à toutes les fonctionnalités Pro. Aucune carte bancaire requise.
                    Votre essai expire dans 30 jours.
                  </p>
                </div>
              </div>

              {/* Terms checkbox */}
              <label className="flex items-start gap-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={form.accepted_terms}
                  onChange={(e) => set("accepted_terms", e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded accent-indigo-600"
                />
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  J'accepte les{" "}
                  <Link to="/terms" target="_blank" className="text-indigo-600 hover:underline">
                    Conditions Générales d'Utilisation
                  </Link>{" "}
                  et la{" "}
                  <Link to="/privacy" target="_blank" className="text-indigo-600 hover:underline">
                    Politique de confidentialité
                  </Link>.
                </span>
              </label>

              <div className="flex gap-3">
                <Button variant="outline" className="flex-1 h-11" onClick={() => setStep(2)}>
                  <ArrowLeft className="w-4 h-4 mr-2" /> Retour
                </Button>
                <Button
                  className="flex-1 h-11 bg-indigo-600 hover:bg-indigo-700"
                  disabled={!step3Valid || submitting}
                  onClick={handleSubmit}
                >
                  {submitting ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Création…</>
                  ) : (
                    <><CheckCircle className="w-4 h-4 mr-2" /> Créer mon établissement</>
                  )}
                </Button>
              </div>
            </div>
          )}

          {/* Already have an account */}
          <p className="text-center text-sm text-gray-500 dark:text-gray-400 mt-8">
            Déjà un compte ?{" "}
            <Link to="/auth" className="text-indigo-600 hover:underline font-medium">
              Se connecter
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
