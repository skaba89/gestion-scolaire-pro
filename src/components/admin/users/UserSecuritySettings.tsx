import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Shield, Lock, AlertCircle, Loader2 } from "lucide-react";
import { useStudentLabel } from "@/hooks/useStudentLabel";
import { useTenantSecuritySettings, useUpdateSecuritySettings } from "@/queries/users";
import { toast } from "sonner";

interface UserSecuritySettingsProps {
    tenantId: string | undefined;
}

export const UserSecuritySettings = ({ tenantId }: UserSecuritySettingsProps) => {
    const { StudentsLabel, StudentLabel, studentsLabel } = useStudentLabel();
    const { data: securitySettings, isLoading } = useTenantSecuritySettings(tenantId || "");
    const updateSettingsMutation = useUpdateSecuritySettings(tenantId || "");

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
        );
    }

    const handleToggleDelegation = async () => {
        if (!tenantId) return;
        const nextValue = !securitySettings?.staff_can_manage_roles;
        try {
            updateSettingsMutation.mutate({
                staff_can_manage_roles: nextValue
            }, {
                onSuccess: () => {
                    toast.success(nextValue
                        ? "Le secrétariat a désormais les droits de gestion"
                        : "Les droits du secrétariat ont été retirés"
                    );
                }
            });
        } catch (error: any) {
            // Error handled in mutation
        }
    };

    return (
        <div className="grid gap-6">
            <Card className="border-none shadow-lg">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Shield className="w-5 h-5 text-primary" />
                        Privilèges d'Administration
                    </CardTitle>
                    <CardDescription>
                        Configurez qui peut gérer les comptes et les accès de l'établissement.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="flex items-center justify-between p-4 bg-muted/40 rounded-xl border border-muted">
                        <div className="space-y-0.5">
                            <div className="flex items-center gap-2">
                                <Label className="text-base font-bold">Délégation au Secrétariat</Label>
                                <Badge variant="outline" className="text-[10px] uppercase font-black tracking-tighter">Bêta</Badge>
                            </div>
                            <p className="text-sm text-muted-foreground max-w-md">
                                Autorise les utilisateurs avec le rôle <strong>Secrétariat</strong> à ajouter des utilisateurs et modifier leurs rôles (privilèges).
                            </p>
                        </div>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={handleToggleDelegation}
                            disabled={updateSettingsMutation.isPending}
                        >
                            {updateSettingsMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                            {securitySettings?.staff_can_manage_roles ? "Désactiver" : "Activer"}
                        </Button>
                    </div>

                    <div className="p-4 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/50 rounded-xl flex gap-3">
                        <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
                        <div className="text-sm text-amber-800 dark:text-amber-200">
                            <p className="font-bold mb-1">Attention Sécurité</p>
                            La délégation permet au secrétariat de créer des comptes Administrateur. Assurez-vous que cette confiance est justifiée par les besoins de l'établissement.
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Card className="border-none shadow-lg">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Lock className="w-5 h-5 text-primary" />
                        Règles de Création de Comptes
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid md:grid-cols-2 gap-4">
                        <div className="p-4 rounded-xl border bg-card">
                            <p className="font-bold text-sm mb-2">Comptes {StudentsLabel}</p>
                            <p className="text-xs text-muted-foreground mb-4">
                                Le rôle <strong>{StudentLabel}</strong> est désormais disponible dans le menu de création. Les {studentsLabel} créés ici apparaîtront comme des utilisateurs authentifiés.
                            </p>
                            <Badge variant="secondary" className="bg-green-100 text-green-700">Activé</Badge>
                        </div>
                        <div className="p-4 rounded-xl border bg-card opacity-50">
                            <p className="font-bold text-sm mb-2">Auto-Enregistrement</p>
                            <p className="text-xs text-muted-foreground mb-4">
                                Permettre aux utilisateurs de s'enregistrer eux-mêmes sur le portail de l'école.
                            </p>
                            <Badge variant="outline">Désactivé</Badge>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
};
