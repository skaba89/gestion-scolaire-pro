import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Brain } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

interface AnalyticsRecommendationsProps {
    recommendations: any[];
}

export const AnalyticsRecommendations = ({ recommendations }: AnalyticsRecommendationsProps) => {
    const { t } = useTranslation();
    const [isVisible, setIsVisible] = useState(true);

    if (!isVisible || recommendations.length === 0) return null;

    return (
        <Card className="border-primary/20 bg-gradient-to-r from-primary/5 to-transparent">
            <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Brain className="h-5 w-5 text-primary" />
                        <CardTitle className="text-lg">{t("parentPortal.recommendations.title")}</CardTitle>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => setIsVisible(false)}>
                        {t("parentPortal.recommendations.hide")}
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
