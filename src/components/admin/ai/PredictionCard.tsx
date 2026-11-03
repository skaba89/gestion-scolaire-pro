import { Card, CardContent } from "@/components/ui/card";
import type { Prediction } from "@/types/ai";

interface PredictionCardProps {
    prediction: Prediction;
}

/** Indicateur actuel calculé par le serveur — sans tendance ni « confiance »
 * inventées (aucun modèle ne les calcule). */
export const PredictionCard = ({ prediction }: PredictionCardProps) => {
    return (
        <Card>
            <CardContent className="pt-6">
                <p className="text-2xl font-bold">{prediction.value}</p>
                <p className="text-sm text-muted-foreground">{prediction.title}</p>
                <p className="text-xs text-muted-foreground mt-2">{prediction.description}</p>
            </CardContent>
        </Card>
    );
};
