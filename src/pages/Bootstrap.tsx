import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ShieldCheck, KeyRound, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import apiClient from "@/api/client";

type Step = "form" | "loading" | "success" | "error";

export default function Bootstrap() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("form");
  const [bootstrapKey, setBootstrapKey] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [result, setResult] = useState<{ email: string; steps: string[] } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");

    if (!bootstrapKey.trim()) {
      setErrorMsg("Veuillez saisir la clé de bootstrap.");
      return;
    }

    if (newPassword && newPassword !== confirmPassword) {
      setErrorMsg("Les mots de passe ne correspondent pas.");
      return;
    }

    if (newPassword && newPassword.length < 8) {
      setErrorMsg("Le mot de passe doit contenir au moins 8 caractères.");
      return;
    }

    setStep("loading");

    try {
      const body: Record<string, string> = { bootstrap_key: bootstrapKey.trim() };
      if (newPassword) {
        body.new_password = newPassword;
      }

      const response = await apiClient.post("/auth/bootstrap/", body);
      const data = response.data;

      setResult({
        email: data.credentials?.email || "admin@schoolflow.local",
        steps: data.steps || [],
      });
      setStep("success");
      toast.success("Compte admin configuré avec succès !");
    } catch (err: any) {
      const detail = err?.response?.data?.detail || err?.message || "Erreur lors du bootstrap.";
      if (err?.response?.status === 403) {
        setErrorMsg("Clé de bootstrap invalide. Vérifiez la variable BOOTSTRAP_SECRET sur Render.");
      } else if (err?.response?.status === 400) {
        setErrorMsg(detail);
      } else {
        setErrorMsg(detail);
      }
      setStep("error");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 p-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-indigo-100 dark:bg-indigo-900/30 mb-4">
            <ShieldCheck className="h-8 w-8 text-indigo-600 dark:text-indigo-400" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">
            Configuration initiale
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Créez ou réinitialisez le compte super administrateur
          </p>
        </div>

        {/* Success State */}
        {step === "success" && result && (
          <Card className="border-green-200 dark:border-green-800">
            <CardHeader className="text-center pb-2">
              <div className="mx-auto mb-2">
                <CheckCircle2 className="h-12 w-12 text-green-500" />
              </div>
              <CardTitle className="text-green-700 dark:text-green-400">
                Bootstrap réussi
              </CardTitle>
              <CardDescription>
                Le compte super administrateur est prêt
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-4 text-sm">
                <p className="font-medium text-slate-700 dark:text-slate-300">
                  Email : <span className="text-indigo-600 dark:text-indigo-400">{result.email}</span>
                </p>
                <p className="text-slate-500 dark:text-slate-400 mt-1">
                  {newPassword ? "Utilisez le mot de passe que vous avez défini." : "Utilisez le mot de passe ADMIN_DEFAULT_PASSWORD configuré sur Render."}
                </p>
              </div>

              {result.steps.length > 0 && (
                <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-4">
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2 uppercase tracking-wide">
                    Étapes effectuées
                  </p>
                  <ul className="text-xs text-slate-600 dark:text-slate-300 space-y-1">
                    {result.steps.map((s, i) => (
                      <li key={i} className="flex items-start gap-1.5">
                        <CheckCircle2 className="h-3 w-3 text-green-500 mt-0.5 shrink-0" />
                        {s}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <Button
                className="w-full"
                onClick={() => navigate("/connexion")}
              >
                Se connecter
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Form State */}
        {(step === "form" || step === "error") && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <KeyRound className="h-5 w-5 text-indigo-500" />
                Clé de bootstrap
              </CardTitle>
              <CardDescription>
                Entrez la clé <code className="text-xs bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">BOOTSTRAP_SECRET</code> configurée
                dans les variables d'environnement Render.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Error alert */}
                {errorMsg && (
                  <div className="flex items-start gap-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 text-sm text-red-700 dark:text-red-400">
                    <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                    {errorMsg}
                  </div>
                )}

                {/* Bootstrap Key */}
                <div className="space-y-2">
                  <Label htmlFor="bootstrap-key">Clé de bootstrap</Label>
                  <Input
                    id="bootstrap-key"
                    type="password"
                    placeholder="Collez votre BOOTSTRAP_SECRET ici"
                    value={bootstrapKey}
                    onChange={(e) => setBootstrapKey(e.target.value)}
                    disabled={step === "loading"}
                    autoComplete="off"
                  />
                </div>

                {/* Optional New Password */}
                <div className="space-y-2">
                  <Label htmlFor="new-password">
                    Nouveau mot de passe <span className="text-slate-400 font-normal">(optionnel)</span>
                  </Label>
                  <Input
                    id="new-password"
                    type="password"
                    placeholder="Min. 8 caractères, majuscule, minuscule, chiffre, spécial"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    disabled={step === "loading"}
                    autoComplete="new-password"
                  />
                  <p className="text-xs text-slate-400">
                    Si vide, le mot de passe ADMIN_DEFAULT_PASSWORD de Render sera utilisé.
                  </p>
                </div>

                {/* Confirm Password */}
                {newPassword && (
                  <div className="space-y-2">
                    <Label htmlFor="confirm-password">Confirmer le mot de passe</Label>
                    <Input
                      id="confirm-password"
                      type="password"
                      placeholder="Confirmez le mot de passe"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      disabled={step === "loading"}
                      autoComplete="new-password"
                    />
                  </div>
                )}

                {/* Info box */}
                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 text-xs text-amber-700 dark:text-amber-400">
                  <p className="font-medium mb-1">Où trouver BOOTSTRAP_SECRET ?</p>
                  <ol className="list-decimal list-inside space-y-0.5 text-amber-600 dark:text-amber-500">
                    <li>Allez sur le dashboard Render</li>
                    <li>Ouvrez le service <strong>schoolflow-api</strong></li>
                    <li>Section <strong>Environment</strong></li>
                    <li>Copiez la valeur de <code>BOOTSTRAP_SECRET</code></li>
                  </ol>
                </div>

                <Button
                  type="submit"
                  className="w-full"
                  disabled={step === "loading"}
                >
                  {step === "loading" ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Configuration en cours...
                    </>
                  ) : (
                    "Configurer le compte admin"
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Loading State */}
        {step === "loading" && (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-indigo-500 mb-4" />
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Configuration du compte super administrateur...
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
