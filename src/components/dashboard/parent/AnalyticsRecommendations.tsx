import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Brain } from "lucide-react";
import { useState } from "react";

interface AnalyticsRecommendationsProps {
    recommendations: any[];
}

export const AnalyticsRecommendations = ({ recommendations }: AnalyticsRecommendationsProps) => {
    const [isVisible, setIsVisible] = useState(true);

    if (!isVisible || recommendations.length === 0) return null;

    return (
        <Card className="border-primary/20 bg-gradient-to-r from-primary/5 to-transparent">
            <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Brain className="h-5 w-5 text-primary" />
                        <CardTitle className="text-lg">Recommandations personnalisées</CardTitle>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => setIsVisible(false)}>
                        Masquer
                    </Button>
                </div>
            </CardHeader>
            <CardContent>
                <div className="grid gap-3">
                    {recommendations.map((rec, index) => (
                        <div
                            key={index}
                            className={`flex items-start gap-3 p-3 rounded-lg ${rec.type === "success" ? "bg-success/10" : "bg-warning/10"
                                }`}
                        >
                            <rec.icon className={`h-5 w-5 mt-0.5 ${rec.type === "success" ? "text-success" : "text-warning"
                                }`} />
                            <div>
                                <p className="font-medium text-sm">{rec.title}</p>
                                <p className="text-sm text-muted-foreground">{rec.message}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </CardContent>
        </Card>
    );
};
