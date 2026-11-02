import { useTranslation } from "react-i18next";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Lightbulb } from "lucide-react";
import type { Recommendation } from "@/types/ai";

interface RecommendationCardProps {
    recommendation: Recommendation;
}

const PRIORITY_COLORS: Record<Recommendation["priority"], string> = {
    high: "bg-red-500/10 text-red-600",
    medium: "bg-yellow-500/10 text-yellow-600",
    low: "bg-blue-500/10 text-blue-600",
};

/** Suggestion fondée sur les indicateurs affichés. Ni « impact estimé »
 * (rien ne le mesure) ni bouton « Appliquer » (il n'exécutait aucune action). */
export const RecommendationCard = ({ recommendation }: RecommendationCardProps) => {
    const { t } = useTranslation();
    return (
        <Card>
            <CardContent className="flex flex-col md:flex-row items-start gap-4 p-6">
                <div className={`p-3 rounded-full shrink-0 ${PRIORITY_COLORS[recommendation.priority]}`}>
                    <Lightbulb className="h-6 w-6" aria-hidden="true" />
                </div>
                <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                        <Badge variant="outline">{recommendation.category}</Badge>
                        <Badge className={PRIORITY_COLORS[recommendation.priority]} variant="secondary">
                            {t(`aiInsights.priority.${recommendation.priority}`)}
                        </Badge>
                    </div>
                    <h3 className="font-semibold text-lg">{recommendation.title}</h3>
                    <p className="text-muted-foreground mt-1 text-sm">{recommendation.description}</p>
                </div>
            </CardContent>
        </Card>
    );
};
