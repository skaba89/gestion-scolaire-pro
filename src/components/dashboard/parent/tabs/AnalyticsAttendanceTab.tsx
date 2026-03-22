import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

interface AnalyticsAttendanceTabProps {
    attendanceByMonth: any[];
}

export const AnalyticsAttendanceTab = ({ attendanceByMonth }: AnalyticsAttendanceTabProps) => {
    return (
        <Card>
            <CardHeader>
                <CardTitle>Taux de présence</CardTitle>
                <CardDescription>Évolution mensuelle de l'assiduité</CardDescription>
            </CardHeader>
            <CardContent>
                <div className="h-80">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={attendanceByMonth}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="month" />
                            <YAxis domain={[0, 100]} />
                            <Tooltip formatter={(value) => `${value}%`} />
                            <Bar
                                dataKey="rate"
                                fill="hsl(var(--primary))"
                                radius={[4, 4, 0, 0]}
                            />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </CardContent>
        </Card>
    );
};
