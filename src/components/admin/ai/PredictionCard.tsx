import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { TrendingUp, TrendingDown, BarChart3 } from "lucide-react";

interface Prediction {
    type: string;
    title: string;
    description: string;
    confidence: number;
    trend: "up" | "down" | "stable";
    value: string;
}

interface PredictionCardProps {
    prediction: Prediction;
}

export const PredictionCard = ({ prediction }: PredictionCardProps) => {
    return (
        <Card key={prediction.type}>
            <CardContent className="pt-6">
                <div className="flex items-start justify-between">
                    <div>
                        <p className="text-2xl font-bold">{prediction.value}</p>
                        <p className="text-sm text-muted-foreground">{prediction.title}</p>
                    </div>
                    <div className={`p-2 rounded-full ${prediction.trend === "up" ? "bg-green-500/10" :
                            prediction.trend === "down" ? "bg-red-500/10" : "bg-muted"
                        }`}>
                        {prediction.trend === "up" ? (
                            <TrendingUp className="h-5 w-5 text-green-600" />
                        ) : prediction.trend === "down" ? (
                            <TrendingDown className="h-5 w-5 text-red-600" />
                        ) : (
                            <BarChart3 className="h-5 w-5 text-muted-foreground" />
                        )}
                    </div>
                </div>
                <CardContent className="px-0 pb-0 pt-3">
                    <div className="flex items-center gap-2">
                        <Progress value={prediction.confidence} className="h-1 flex-1" />
                        <span className="text-xs text-muted-foreground whitespace-nowrap">{prediction.confidence}% confiance</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-2 line-clamp-1">{prediction.description}</p>
                </CardContent>
            </CardContent>
        </Card>
    );
};
