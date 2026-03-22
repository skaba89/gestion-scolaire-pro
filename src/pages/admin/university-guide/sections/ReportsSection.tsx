import { BarChart3, ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { InfoBox } from "../components/GuideComponents";

export const ReportsSection = () => {
    return (
        <div className="space-y-6">
            <h2 className="text-2xl font-bold">Tableaux de bord et rapports</h2>

            <h3 className="text-xl font-semibold">Dashboard administratif</h3>

            <p className="text-muted-foreground">
                Le tableau de bord central affiche les indicateurs clés :
            </p>

            <div className="grid md:grid-cols-4 gap-4 mt-4">
                {[
                    { label: "Étudiants inscrits", value: "2,847", trend: "+12%" },
                    { label: "Taux de présence", value: "94.2%", trend: "+3%" },
                    { label: "Moyenne générale", value: "12.8/20", trend: "-0.2" },
                    { label: "Recouvrement", value: "78%", trend: "+5%" }
                ].map((stat, index) => (
                    <Card key={index} className="p-4 text-center">
                        <p className="text-2xl font-bold">{stat.value}</p>
                        <p className="text-sm text-muted-foreground">{stat.label}</p>
                        <Badge variant="outline" className="mt-2 text-[10px]">{stat.trend}</Badge>
                    </Card>
                ))}
            </div>

            <h3 className="text-xl font-semibold mt-8">Rapports disponibles</h3>

            <div className="space-y-2 text-left">
                {[
                    "Effectifs par département et niveau",
                    "Statistiques d'assiduité par période",
                    "Distribution des notes par matière",
                    "Taux de réussite par filière",
                    "État des inscriptions (réinscriptions, nouvelles)",
                    "Rapports financiers (facturation, recouvrement)",
                    "Comparatif inter-semestres",
                    "Alertes précoces (étudiants en difficulté)"
                ].map((report, index) => (
                    <div key={index} className="flex items-center gap-2 p-2 rounded hover:bg-muted">
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm">{report}</span>
                    </div>
                ))}
            </div>

            <h3 className="text-xl font-semibold mt-8">Insights IA</h3>

            <InfoBox type="tip">
                Le module Insights IA analyse automatiquement les données pour identifier
                les étudiants à risque, suggérer des améliorations pédagogiques et
                prédire les tendances.
            </InfoBox>

            <div className="grid md:grid-cols-2 gap-4 text-left">
                <Card className="border-l-4 border-l-red-500">
                    <CardHeader>
                        <CardTitle className="text-base">Alerte précoce</CardTitle>
                    </CardHeader>
                    <CardContent className="text-sm text-muted-foreground">
                        5 étudiants de L2 Info présentent une chute de performance
                        de plus de 30% ce semestre. Action recommandée : entretien individuel.
                    </CardContent>
                </Card>

                <Card className="border-l-4 border-l-green-500">
                    <CardHeader>
                        <CardTitle className="text-base">Recommandation</CardTitle>
                    </CardHeader>
                    <CardContent className="text-sm text-muted-foreground">
                        Le taux de réussite en Mathématiques L1 a augmenté de 15%
                        depuis l'introduction des TD supplémentaires. Maintenir cette pratique.
                    </CardContent>
                </Card>
            </div>
        </div>
    );
};
