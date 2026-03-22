import { Award, FileText, Users, GraduationCap, MessageSquare } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoBox, StepList, ScreenshotCard } from "../components/GuideComponents";
import alumniDashboard from "@/assets/docs/alumni-dashboard.png";

export const AlumniSection = () => {
    return (
        <div className="space-y-6">
            <h2 className="text-2xl font-bold">Gestion des anciens étudiants</h2>

            <p className="text-muted-foreground">
                Le module Alumni permet de maintenir le lien avec les anciens étudiants
                et de créer un réseau professionnel actif.
            </p>

            <h3 className="text-xl font-semibold">Fonctionnalités Alumni</h3>

            <div className="grid md:grid-cols-2 gap-4 text-left">
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base flex items-center gap-2">
                            <FileText className="h-4 w-4" />
                            Demandes de documents
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="text-sm text-muted-foreground">
                        Les alumni peuvent demander des attestations, relevés de notes,
                        diplômes et autres documents officiels en ligne.
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="text-base flex items-center gap-2">
                            <Users className="h-4 w-4" />
                            Programme de mentorat
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="text-sm text-muted-foreground">
                        Les alumni peuvent s'inscrire comme mentors pour guider
                        les étudiants actuels dans leur parcours professionnel.
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="text-base flex items-center gap-2">
                            <GraduationCap className="h-4 w-4" />
                            Offres de carrière
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="text-sm text-muted-foreground">
                        Accès aux offres de stages et d'emplois partagées
                        par les entreprises partenaires.
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="text-base flex items-center gap-2">
                            <MessageSquare className="h-4 w-4" />
                            Réseau et communication
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="text-sm text-muted-foreground">
                        Messagerie interne pour rester en contact avec
                        l'université et les autres alumni.
                    </CardContent>
                </Card>
            </div>

            <ScreenshotCard
                src={alumniDashboard}
                alt="Tableau de bord alumni"
                caption="Figure 7: Espace dédié aux anciens étudiants"
            />

            <h3 className="text-xl font-semibold mt-8">Conversion étudiant → Alumni</h3>

            <StepList steps={[
                "Marquez l'étudiant comme 'Diplômé' dans son dossier",
                "Le compte est automatiquement converti en compte Alumni",
                "L'ancien étudiant conserve son accès avec les fonctionnalités Alumni"
            ]} />
        </div>
    );
};
