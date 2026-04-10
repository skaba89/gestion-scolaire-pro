import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Lightbulb, Target } from "lucide-react";

interface Recommendation {
    id: string;
    category: string;
    title: string;
    description: string;
    priority: "high" | "medium" | "low";
    impact: string;
}

interface RecommendationCardProps {
    recommendation: Recommendation;
}

export const RecommendationCard = ({ recommendation }: RecommendationCardProps) => {
    const priorityColors = {
        high: "bg-red-500/10 text-red-600",
        medium: "bg-yellow-500/10 text-yellow-600",
        low: "bg-blue-500/10 text-blue-600",
    };

    return (
        <Card key={recommendation.id}>
            <CardContent className="flex flex-col md:flex-row items-start gap-4 p-6">
                <div className={`p-3 rounded-full shrink-0 ${priorityColors[recommendation.priority]}`}>
                    <Lightbulb className="h-6 w-6" />
                </div>
                <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                        <Badge variant="outline">{recommendation.category}</Badge>
                        <Badge className={priorityColors[recommendation.priority]} variant="secondary">
                            {recommendation.priority === "high" ? "Priorité haute" :
                                recommendation.priority === "medium" ? "Priorité moyenne" : "Priorité basse"}
                        </Badge>
                    </div>
                    <h3 className="font-semibold text-lg">{recommendation.title}</h3>
                    <p className="text-muted-foreground mt-1 text-sm">{recommendation.description}</p>
                    <p className="text-xs text-primary mt-2 flex items-center gap-1 font-medium">
                        <Target className="h-4 w-4" />
                        Impact estimé: {recommendation.impact}
                    </p>
                </div>
                <Button variant="outline" size="sm" className="shrink-0 w-full md:w-auto">Appliquer</Button>
            </CardContent>
        </Card>
    );
};
