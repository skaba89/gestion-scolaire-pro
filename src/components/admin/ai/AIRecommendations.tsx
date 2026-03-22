import { Recommendation } from "@/types/ai";
import { RecommendationCard } from "@/components/admin/ai/RecommendationCard";

interface AIRecommendationsProps {
    recommendations: Recommendation[];
}

export function AIRecommendations({ recommendations }: AIRecommendationsProps) {
    return (
        <div className="space-y-4">
            {recommendations.map((rec) => (
                <RecommendationCard key={rec.id} recommendation={rec} />
            ))}
        </div>
    );
}
