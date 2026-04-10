import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, AlertCircle } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";

interface AnalyticsHomeworkTabProps {
    homeworkData: any[];
    homeworkTimingData: any[];
}

export const AnalyticsHomeworkTab = ({ homeworkData, homeworkTimingData }: AnalyticsHomeworkTabProps) => {
    return (
        <div className="grid gap-6 md:grid-cols-3">
            <Card className="md:col-span-2">
                <CardHeader>
                    <CardTitle>Derniers devoirs</CardTitle>
                    <CardDescription>État des rendus et notes obtenues</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="space-y-3 max-h-96 overflow-y-auto">
                        {homeworkData.slice(0, 10).map((hw: any, index: number) => (
                            <div key={index} className="flex items-center justify-between p-4 border rounded-lg">
                                <div className="flex items-center gap-3">
                                    {hw.submitted_at ? (
                                        <CheckCircle className="h-5 w-5 text-success" />
                                    ) : (
                                        <AlertCircle className="h-5 w-5 text-warning" />
                                    )}
                                    <div>
                                        <p className="font-medium">{hw.homework?.title}</p>
                                        <p className="text-sm text-muted-foreground">
                                            Échéance: {hw.homework?.due_date ? format(new Date(hw.homework.due_date), "dd MMM yyyy", { locale: fr }) : "-"}
                                        </p>
                                    </div>
                                </div>
                                <div className="text-right">
                                    {hw.grade !== null ? (
                                        <Badge variant={hw.grade >= (hw.homework?.max_points || 20) * 0.7 ? "default" : "secondary"}>
                                            {hw.grade}/{hw.homework?.max_points || 20}
                                        </Badge>
                                    ) : hw.submitted_at ? (
                                        <Badge variant="outline">En attente</Badge>
                                    ) : (
                                        <Badge variant="destructive">Non rendu</Badge>
                                    )}
                                </div>
                            </div>
                        ))}
                        {homeworkData.length === 0 && (
                            <p className="text-center text-muted-foreground py-8">Aucun devoir trouvé</p>
                        )}
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Ponctualité</CardTitle>
                    <CardDescription>Timing des rendus</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={homeworkTimingData}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={40}
                                    outerRadius={80}
                                    dataKey="value"
                                    label={({ name, value }) => `${name}: ${value}`}
                                >
                                    {homeworkTimingData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.color} />
                                    ))}
                                </Pie>
                                <Tooltip />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
};
