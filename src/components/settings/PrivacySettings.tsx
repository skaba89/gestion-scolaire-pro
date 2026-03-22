import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Download, Trash2, AlertTriangle, Shield, FileJson } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { gdprService } from "@/lib/gdpr-service";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export const PrivacySettings = () => {
    const { user, signOut } = useAuth();
    const { toast } = useToast();
    const [isExporting, setIsExporting] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);

    const handleExportData = async () => {
        if (!user) return;
        setIsExporting(true);
        try {
            const data = await gdprService.exportUserData(user.id);
            gdprService.downloadDataAsJson(data, `schoolflow-data-${new Date().toISOString().split('T')[0]}.json`);
            toast({
                title: "Export réussi",
                description: "Vos données ont été téléchargées.",
            });
        } catch (error) {
            toast({
                title: "Erreur",
                description: "Impossible d'exporter vos données.",
                variant: "destructive",
            });
        } finally {
            setIsExporting(false);
        }
    };

    const handleDeleteAccount = async () => {
        if (!user) return;
        setIsDeleting(true);
        try {
            await gdprService.deleteAccount(user.id);
            toast({
                title: "Compte supprimé",
                description: "Votre compte a été anonymisé. Vous allez être déconnecté.",
            });
            setTimeout(() => {
                signOut();
            }, 2000);
        } catch (error) {
            toast({
                title: "Erreur",
                description: "Impossible de supprimer votre compte. Veuillez contacter l'administrateur.",
                variant: "destructive",
            });
            setIsDeleting(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-2 mb-4">
                <Shield className="h-6 w-6 text-primary" />
                <h2 className="text-2xl font-bold tracking-tight">Confidentialité & Données</h2>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Export des données (Portabilité)</CardTitle>
                    <CardDescription>
                        Conformément au RGPD, vous pouvez récupérer une copie de toutes vos données personnelles au format JSON.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <Button
                        onClick={handleExportData}
                        disabled={isExporting}
                        variant="outline"
                        className="flex items-center gap-2"
                    >
                        {isExporting ? (
                            <span className="loading loading-spinner loading-xs"></span>
                        ) : (
                            <FileJson className="h-4 w-4" />
                        )}
                        {isExporting ? "Préparation..." : "Télécharger mes données (JSON)"}
                    </Button>
                </CardContent>
            </Card>

            <Card className="border-destructive/20">
                <CardHeader>
                    <CardTitle className="text-destructive flex items-center gap-2">
                        <Trash2 className="h-5 w-5" />
                        Zone de Danger
                    </CardTitle>
                    <CardDescription>
                        Actions irréversibles concernant votre compte.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <Alert variant="destructive">
                        <AlertTriangle className="h-4 w-4" />
                        <AlertTitle>Attention</AlertTitle>
                        <AlertDescription>
                            La suppression de votre compte entraînera l'anonymisation irréversible de vos données personnelles.
                            Les données académiques nécessaires au fonctionnement de l'établissement (notes, bulletins) seront conservées mais ne seront plus liées à votre identité.
                        </AlertDescription>
                    </Alert>

                    <AlertDialog>
                        <AlertDialogTrigger asChild>
                            <Button variant="destructive">Supprimer mon compte</Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle>Êtes-vous absolument sûr ?</AlertDialogTitle>
                                <AlertDialogDescription>
                                    Cette action est irréversible. Vos données personnelles seront effacées ou anonymisées.
                                    Vous ne pourrez plus accéder à votre compte.
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel>Annuler</AlertDialogCancel>
                                <AlertDialogAction
                                    onClick={handleDeleteAccount}
                                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                    disabled={isDeleting}
                                >
                                    {isDeleting ? "Suppression..." : "Oui, supprimer mon compte"}
                                </AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                </CardContent>
            </Card>
        </div>
    );
};
