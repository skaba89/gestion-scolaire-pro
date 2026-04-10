import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { apiClient } from "@/api/client";
import { TOKEN_STORAGE_KEY } from "@/api/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Lock, Eye, EyeOff, KeyRound, Loader2, CheckCircle } from "lucide-react";


const ChangePassword = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const passwordRequirements = [
    { label: "Au moins 8 caractères", check: password.length >= 8 },
    { label: "Au moins une majuscule", check: /[A-Z]/.test(password) },
    { label: "Au moins une minuscule", check: /[a-z]/.test(password) },
    { label: "Au moins un chiffre", check: /[0-9]/.test(password) },
  ];

  const isPasswordValid = passwordRequirements.every((req) => req.check);
  const passwordsMatch = password === confirmPassword && password.length > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    if (!isPasswordValid) {
      toast({
        title: "Mot de passe invalide",
        description: "Le mot de passe doit respecter toutes les conditions (8 car., majuscule, minuscule, chiffre).",
        variant: "destructive"
      });
      return;
    }

    if (!passwordsMatch) {
      toast({
        title: "Erreur",
        description: "Les mots de passe ne correspondent pas.",
        variant: "destructive"
      });
      return;
    }

    setIsSubmitting(true);
    try {
      // Update password via API
      await apiClient.post("/auth/change-password/", {
        new_password: password,
      });

      // Update must_change_password flag via API
      await apiClient.patch("/hr/profiles/me/", {
        must_change_password: false,
      });

      toast({
        title: "Mot de passe modifié",
        description: "Votre mot de passe a été modifié avec succès. Veuillez vous reconnecter.",
      });

      // Clear stored tokens
      localStorage.removeItem(TOKEN_STORAGE_KEY);
      sessionStorage.removeItem(TOKEN_STORAGE_KEY);

      // Navigate to auth
      navigate("/auth", { replace: true });
    } catch (error: any) {
      console.error("Error changing password:", error);
      toast({
        title: "Erreur",
        description: error.response?.data?.detail || error.message || "Impossible de changer le mot de passe",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-4">
            <KeyRound className="w-6 h-6 text-primary" />
          </div>
          <CardTitle className="text-2xl">Changement de mot de passe</CardTitle>
          <CardDescription>
            Pour des raisons de sécurité, vous devez changer votre mot de passe avant de continuer.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">Nouveau mot de passe</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 w-4 text-muted-foreground" />
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-10 pr-10"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="w-4 w-4" /> : <Eye className="w-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirmer le mot de passe</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 w-4 text-muted-foreground" />
                <Input
                  id="confirmPassword"
                  type={showConfirmPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="pl-10 pr-10"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showConfirmPassword ? <EyeOff className="w-4 w-4" /> : <Eye className="w-4 w-4" />}
                </button>
              </div>
              {confirmPassword && !passwordsMatch && (
                <p className="text-xs text-destructive">Les mots de passe ne correspondent pas</p>
              )}
            </div>

            <div className="space-y-2 p-3 bg-muted rounded-lg">
              <p className="text-sm font-medium text-muted-foreground">Exigences du mot de passe :</p>
              <ul className="space-y-1">
                {passwordRequirements.map((req, index) => (
                  <li key={index} className="flex items-center gap-2 text-sm">
                    <CheckCircle
                      className={`w-4 w-4 ${req.check ? "text-green-500" : "text-muted-foreground"}`}
                    />
                    <span className={req.check ? "text-foreground" : "text-muted-foreground"}>
                      {req.label}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <Button
              type="submit"
              className="w-full"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 w-4 mr-2 animate-spin" />
                  Modification en cours...
                </>
              ) : (
                "Changer le mot de passe"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default ChangePassword;
