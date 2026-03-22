import { Building2, Users, Layers } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ShortcutCard } from "../components/GuideComponents";
import { ScreenshotCard } from "../components/GuideComponents";
import adminDashboard from "@/assets/docs/admin-dashboard.png";

export const OverviewSection = () => {
    return (
        <div className="space-y-6">
            <h2 className="text-2xl font-bold">Présentation de la plateforme</h2>

            <p className="text-muted-foreground">
                Cette plateforme est un système de gestion universitaire complet conçu pour les établissements
                d'enseignement supérieur avec plusieurs départements et filières. Elle permet une gestion
                centralisée tout en offrant une autonomie aux différents départements.
            </p>

            <div className="grid md:grid-cols-3 gap-4">
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-lg flex items-center gap-2">
                            <Users className="h-5 w-5 text-primary" />
                            Multi-rôles
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-sm text-muted-foreground">
                            8 types d'utilisateurs : Super Admin, Admin, Directeur, Chef de département,
                            Enseignant, Étudiant, Parent, Alumni
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-lg flex items-center gap-2">
                            <Building2 className="h-5 w-5 text-primary" />
                            Multi-départements
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-sm text-muted-foreground">
                            Gestion décentralisée par département avec isolation des données
                            et tableaux de bord dédiés
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-lg flex items-center gap-2">
                            <Layers className="h-5 w-5 text-primary" />
                            Multi-filières
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-sm text-muted-foreground">
                            Chaque département peut gérer plusieurs filières/programmes
                            avec leurs propres niveaux et matières
                        </p>
                    </CardContent>
                </Card>
            </div>

            <h3 className="text-xl font-semibold mt-8">Architecture du système</h3>

            <div className="bg-muted/50 p-6 rounded-lg">
                <div className="text-center space-y-4">
                    <div className="inline-block bg-primary text-primary-foreground px-6 py-3 rounded-lg font-semibold">
                        🏛️ UNIVERSITÉ (Tenant)
                    </div>
                    <div className="flex justify-center">
                        <div className="w-px h-8 bg-border" />
                    </div>
                    <div className="flex flex-wrap justify-center gap-4">
                        {["Sciences", "Lettres", "Économie", "Droit", "Médecine"].map((dept) => (
                            <div key={dept} className="bg-card border px-4 py-2 rounded-lg text-sm">
                                📚 Dép. {dept}
                            </div>
                        ))}
                    </div>
                    <div className="flex justify-center">
                        <div className="w-px h-8 bg-border" />
                    </div>
                    <div className="flex flex-wrap justify-center gap-2">
                        {["L1", "L2", "L3", "M1", "M2", "Doctorat"].map((level) => (
                            <Badge key={level} variant="outline">{level}</Badge>
                        ))}
                    </div>
                </div>
            </div>

            <ScreenshotCard
                src={adminDashboard}
                alt="Tableau de bord administrateur"
                caption="Figure 1: Tableau de bord principal de l'administration universitaire"
            />
        </div>
    );
};
