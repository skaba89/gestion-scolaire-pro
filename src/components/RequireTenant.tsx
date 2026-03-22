import { useTenant } from "@/contexts/TenantContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertCircle } from "lucide-react";

interface RequireTenantProps {
  children: React.ReactNode;
}

export const RequireTenant = ({ children }: RequireTenantProps) => {
  const { tenant, isLoading } = useTenant();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Chargement...</p>
        </div>
      </div>
    );
  }

  if (!tenant) {
    return (
      <Card className="border-warning/50 bg-warning/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-warning">
            <AlertCircle className="w-5 h-5" />
            Établissement non configuré
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            Votre compte n'est pas encore associé à un établissement. 
            Contactez votre administrateur pour être ajouté à votre établissement.
          </p>
        </CardContent>
      </Card>
    );
  }

  return <>{children}</>;
};
