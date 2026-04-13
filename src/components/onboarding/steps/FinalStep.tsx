import { CheckCircle2, School, Loader2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiClient } from "@/api/client";

import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";

interface FinalStepProps {
    allData: any;
    onFinish: () => void;
}

export const FinalStep = ({ allData, onFinish }: FinalStepProps) => {
    const [isCreating, setIsCreating] = useState(false);
    const [created, setCreated] = useState(false);
    const navigate = useNavigate();
    const { toast } = useToast();
    const { refreshProfile } = useAuth();

    const handleCreate = async () => {
        setIsCreating(true);

        try {
            // Defensive check for school name
            const schoolName = allData.school?.name || "";
            if (!schoolName) {
                toast({
                    title: "Informations manquantes",
                    description: "Le nom de l'établissement est requis pour terminer la configuration.",
                    variant: "destructive"
                });
                setIsCreating(false);
                return;
            }

            // Prepare data for the backend API
            const payload = {
                name: schoolName,
                slug: schoolName.toLowerCase().trim().replace(/\s+/g, '-'),
                type: allData.school?.type || 'primary',
                country: allData.school?.country || '',
                currency: allData.school?.currency || 'XOF',
                phone: allData.school?.phone || '',
                email: allData.school?.email || '',
                address: allData.school?.address || '',
                academic_year_start: allData.year?.start_date,
                academic_year_end: allData.year?.end_date,
                levels: allData.structure?.levels?.map((l: any) => l.name) || [],
                terms: allData.year?.terms?.map((t: any) => ({
                    name: t.name,
                    start_date: t.start_date,
                    end_date: t.end_date
                })) || []
            };

            const response = await apiClient.post('/tenants/', payload);
            const tenant = response.data;

            // Mark onboarding as completed so AdminLayout doesn't redirect back
            try {
                await apiClient.patch('/tenants/settings', { onboarding_completed: true });
            } catch (err) {
                console.error("Failed to mark onboarding as completed", err);
            }

            setCreated(true);
            toast({
                title: "Établissement créé !",
                description: "Votre établissement a été créé avec succès via l'API souveraine.",
            });

            // Refresh profile to get tenant_id and TENANT_ADMIN role
            await refreshProfile();

            // Rediriger après 2 secondes
            setTimeout(() => {
                navigate(`/${tenant.slug}/admin`);
            }, 2000);

        } catch (error: any) {
            console.error("Error creating school via API:", error);
            let errorMessage = error.response?.data?.detail || error.message || "Une erreur est survenue lors de la création";

            if (error.response?.status === 409) {
                errorMessage = "Cet établissement a déjà été configuré. Vous pouvez continuer vers le tableau de bord ou utiliser un autre nom.";
            }

            console.error("Establishment creation failed:", errorMessage);
            toast({
                title: error.response?.status === 409 ? "Établissement déjà existant" : "Erreur lors de la création",
                description: errorMessage,
                variant: error.response?.status === 409 ? "default" : "destructive"
            });
        } finally {
            setIsCreating(false);
        }
    };

    if (created) {
        return (
            <div className="text-center py-12">
                <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
                    <CheckCircle2 className="w-12 h-12 text-green-600" />
                </div>
                <h2 className="text-3xl font-bold mb-3">Félicitations ! 🎉</h2>
                <p className="text-lg text-muted-foreground mb-6">
                    Votre établissement a été créé avec succès.
                </p>
                <p className="text-sm text-muted-foreground">
                    Redirection vers votre tableau de bord...
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
                    <School className="w-6 h-6 text-primary" />
                </div>
                <div>
                    <div className="flex items-center gap-2">
                        <h2 className="text-2xl font-bold">Récapitulatif</h2>
                        <span className="bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded-full font-semibold">
                            Souverain API v2
                        </span>
                    </div>
                    <p className="text-muted-foreground">Vérifiez les informations avant de créer votre établissement</p>
                </div>
            </div>

            <div className="space-y-4">
                <Card>
                    <CardContent className="p-6">
                        <h3 className="font-semibold mb-3 flex items-center gap-2">
                            <CheckCircle2 className="w-5 h-5 text-green-600" />
                            Informations Générales
                        </h3>
                        <div className="space-y-2 text-sm">
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">Nom :</span>
                                <span className="font-medium">{allData.school.name || 'Non défini'}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">Type :</span>
                                <span className="font-medium">
                                    {allData.school.type === 'primary' && 'École Primaire'}
                                    {allData.school.type === 'middle' && 'Collège'}
                                    {allData.school.type === 'high' && 'Lycée'}
                                    {allData.school.type === 'university' && 'Université'}
                                </span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">Pays :</span>
                                <span className="font-medium">{allData.school.country || 'Non défini'}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">Devise :</span>
                                <span className="font-medium">{allData.school.currency || 'Non défini'}</span>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardContent className="p-6">
                        <h3 className="font-semibold mb-3 flex items-center gap-2">
                            <CheckCircle2 className="w-5 h-5 text-green-600" />
                            Structure
                        </h3>
                        <div className="text-sm">
                            <span className="text-muted-foreground">Niveaux : </span>
                            <span className="font-medium">
                                {allData.structure.levels?.length || 0} niveau(x) configuré(s)
                            </span>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardContent className="p-6">
                        <h3 className="font-semibold mb-3 flex items-center gap-2">
                            <CheckCircle2 className="w-5 h-5 text-green-600" />
                            Année Scolaire
                        </h3>
                        <div className="space-y-2 text-sm">
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">Période :</span>
                                <span className="font-medium">
                                    {allData.year.start_date && allData.year.end_date
                                        ? `${new Date(allData.year.start_date).toLocaleDateString('fr-FR')} - ${new Date(allData.year.end_date).toLocaleDateString('fr-FR')}`
                                        : 'Non défini'}
                                </span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">Trimestres :</span>
                                <span className="font-medium">{allData.year.terms?.length || 0} période(s)</span>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardContent className="p-6">
                        <h3 className="font-semibold mb-3 flex items-center gap-2">
                            <CheckCircle2 className="w-5 h-5 text-green-600" />
                            Équipe
                        </h3>
                        <div className="text-sm">
                            <span className="text-muted-foreground">Administrateurs : </span>
                            <span className="font-medium">
                                {allData.team.admins?.length || 0} invitation(s)
                            </span>
                        </div>
                    </CardContent>
                </Card>
            </div>

            <Alert className="bg-amber-50 border-amber-200">
                <AlertDescription className="text-amber-800">
                    ⚠️ Une fois créé, certaines informations ne pourront pas être modifiées facilement. Vérifiez bien vos données.
                </AlertDescription>
            </Alert>

            <Button
                onClick={handleCreate}
                disabled={isCreating}
                className="w-full h-12 text-lg bg-green-600 hover:bg-green-700"
            >
                {isCreating ? (
                    <>
                        <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                        Création en cours...
                    </>
                ) : (
                    <>
                        <CheckCircle2 className="w-5 h-5 mr-2" />
                        Créer mon établissement
                    </>
                )}
            </Button>
        </div>
    );
};
