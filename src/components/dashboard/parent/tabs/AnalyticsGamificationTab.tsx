import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Award } from "lucide-react";
import { format } from "date-fns";
import { BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { dateFnsLocale } from "@/lib/locale";
import { useTranslation } from "react-i18next";

interface AnalyticsGamificationTabProps {
    pointsByCategory: any[];
    achievements: any[];
}

export const AnalyticsGamificationTab = ({ pointsByCategory, achievements }: AnalyticsGamificationTabProps) => {
    const { t } = useTranslation();
    return (
        <div className="grid gap-6 md:grid-cols-2">
            <Card>
                <CardHeader>
                    <CardTitle>{t("parentPortal.gamificationTab.pointsTitle")}</CardTitle>
                    <CardDescription>{t("parentPortal.gamificationTab.pointsHint")}</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="h-72">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={pointsByCategory} layout="vertical">
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis type="number" />
                                <YAxis dataKey="name" type="category" width={100} />
                                <Tooltip />
                                <Bar dataKey="value" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>{t("parentPortal.gamificationTab.badgesTitle")}</CardTitle>
                    <CardDescription>{t("parentPortal.gamificationTab.badgesHint")}</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="space-y-3">
                        {achievements.slice(0, 6).map((ach: any, index: number) => (
                            <div key={index} className="flex items-center gap-3 p-3 bg-muted rounded-lg">
                                <div className={`p-2 rounded-full ${ach.achievement?.rarity === "legendary" ? "bg-yellow-100" :
                                        ach.achievement?.rarity === "rare" ? "bg-purple-100" : "bg-blue-100"
                                    }`}>
                                    <Award className={`h-5 w-5 ${ach.achievement?.rarity === "legendary" ? "text-yellow-600" :
                                            ach.achievement?.rarity === "rare" ? "text-purple-600" : "text-blue-600"
                                        }`} />
                                </div>
                                <div className="flex-1">
                                    <p className="font-medium">{ach.achievement?.name}</p>
                                    <p className="text-xs text-muted-foreground">
                                        {ach.earned_at ? format(new Date(ach.earned_at), "dd MMM yyyy", { locale: dateFnsLocale() }) : ""}
                                        {ach.achievement?.points_reward && ` • +${ach.achievement.points_reward} pts`}
                                    </p>
                                </div>
                                <Badge variant="outline" className="capitalize">
                                    {ach.achievement?.rarity || "common"}
                                </Badge>
                            </div>
                        ))}
                        {achievements.length === 0 && (
                            <p className="text-center text-muted-foreground py-8">{t("parentPortal.gamificationTab.none")}</p>
                        )}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
};
