import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { GraduationCap, Eye, EyeOff } from "lucide-react";

const AuthNative = () => {
  const { signIn, isLoading } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!email.trim() || !password.trim()) {
      toast({
        title: "Champs requis",
        description: "Veuillez renseigner votre email et votre mot de passe.",
        variant: "destructive",
      });
      return;
    }

    setSubmitting(true);
    try {
    const { error, profileData } = await signIn(email, password);
    if (error) {
      const msg = error.message || "Identifiants incorrects";
      let description = msg;
      if (msg.includes("401") || msg.includes("identifiant") || msg.includes("credential")) {
        description = "Email ou mot de passe incorrect. Veuillez vérifier vos identifiants.";
      } else if (msg.includes("network") || msg.includes("Network") || msg.includes("ECONNREFUSED")) {
        description = "Impossible de joindre le serveur. Vérifiez que l'API est lancée.";
      }
      toast({
        title: "Erreur de connexion",
        description,
        variant: "destructive",
      });
      return;
    }

    // Use the profile data returned by signIn (fetched from /users/me/)
    const userRoles: string[] = (profileData?.roles as string[]) || [];
    const tenantSlug = (profileData?.tenant?.slug as string) || null;

    // SUPER_ADMIN has no tenant — redirect to platform dashboard
    if (userRoles.includes("SUPER_ADMIN") && !tenantSlug) {
      navigate("/super-admin", { replace: true });
      return;
    }

    // SUPER_ADMIN with a tenant goes to super-admin panel (not tenant dashboard)
    if (userRoles.includes("SUPER_ADMIN") && tenantSlug) {
      navigate("/super-admin", { replace: true });
      return;
    }

    // Other users: use the tenant slug from the profile
    if (!tenantSlug) {
      toast({
        title: "Erreur",
        description: "Aucun établissement associé à votre compte. Contactez un administrateur.",
        variant: "destructive",
      });
      return;
    }

    const slug = tenantSlug;

    if (userRoles.includes("TENANT_ADMIN") || userRoles.includes("DIRECTOR") || userRoles.includes("STAFF")) {
      navigate(`/${slug}/admin`, { replace: true });
    } else if (userRoles.includes("TEACHER")) {
      navigate(`/${slug}/teacher`, { replace: true });
    } else if (userRoles.includes("PARENT")) {
      navigate(`/${slug}/parent`, { replace: true });
    } else if (userRoles.includes("STUDENT")) {
      navigate(`/${slug}/student`, { replace: true });
    } else if (userRoles.includes("ALUMNI")) {
      navigate(`/${slug}/alumni`, { replace: true });
    } else {
      navigate(`/${slug}/admin`, { replace: true });
    }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      <Card className="w-full max-w-md shadow-2xl border-0">
        <CardHeader className="text-center space-y-3 pb-4">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center shadow-lg">
            <GraduationCap className="w-8 h-8 text-white" />
          </div>
          <div>
            <CardTitle className="text-2xl font-bold tracking-tight">SchoolFlow Pro</CardTitle>
            <CardDescription className="text-sm text-muted-foreground mt-1">
              Connectez-vous à votre espace de gestion scolaire
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form className="space-y-5" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-medium">Adresse email</Label>
              <Input
                id="email"
                type="email"
                placeholder="admin@schoolflow.local"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
                autoComplete="email"
                className="h-11"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm font-medium">Mot de passe</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Votre mot de passe"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  className="h-11 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  tabIndex={-1}
                  aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              className="w-full h-11 text-base font-semibold bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700"
              disabled={submitting || isLoading}
            >
              {submitting ? (
                <span className="flex items-center gap-2">
                  <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></span>
                  Connexion en cours...
                </span>
              ) : (
                "Se connecter"
              )}
            </Button>
          </form>
        </CardContent>
        <CardFooter className="flex flex-col gap-3 text-center text-xs text-muted-foreground pb-6">
          <p>
            Environnement de démonstration —{" "}
            <a href="/" className="underline underline-offset-2 hover:text-foreground transition-colors">
              Retour à l'accueil
            </a>
          </p>
        </CardFooter>
      </Card>
    </div>
  );
};

export default AuthNative;
