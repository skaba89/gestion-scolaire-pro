import { Prediction } from "@/types/ai";
import { PredictionCard } from "@/components/admin/ai/PredictionCard";

interface AIStatsProps {
    predictions: Prediction[];
}

export function AIStats({ predictions }: AIStatsProps) {
    return (
        <div className="grid md:grid-cols-4 gap-4">
            {predictions.map((prediction) => (
                <PredictionCard key={prediction.type} prediction={prediction} />
            ))}
        </div>
    );
}
