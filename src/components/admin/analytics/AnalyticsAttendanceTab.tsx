import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ResponsiveContainer, AreaChart, Area, CartesianGrid, XAxis, YAxis, Tooltip, BarChart, Bar, Legend } from "recharts";
import { Activity, BarChart3 } from "lucide-react";

interface AttendanceTrendData {
    date: string;
    taux: number;
    présents: number;
    absents: number;
}

interface AnalyticsAttendanceTabProps {
    data: AttendanceTrendData[];
}

export const AnalyticsAttendanceTab = ({ data }: AnalyticsAttendanceTabProps) => {
    return (
        <div className="grid lg:grid-cols-2 gap-6">
            <Card className="shadow-sm">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-lg">
                        <Activity className="w-5 h-5 text-primary" />
                        Évolution du Taux de Présence
                    </CardTitle>
                    <CardDescription>Tendance sur la période sélectionnée</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="h-72">
                        {data && data.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={data}>
                                    <defs>
                                        <linearGradient id="attendanceGradient" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="hsl(142, 76%, 36%)" stopOpacity={0.3} />
                                            <stop offset="95%" stopColor="hsl(142, 76%, 36%)" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                                    <XAxis dataKey="date" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                                    <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                                    <Tooltip
                                        contentStyle={{
                                            backgroundColor: "hsl(var(--card))",
                                            border: "1px solid hsl(var(--border))",
                                            borderRadius: "8px",
                                            boxShadow: "0 4px 12px rgba(0,0,0,0.1)"
                                        }}
                                        formatter={(value: number) => [`${value}%`, "Taux"]}
                                    />
                                    <Area
                                        type="monotone"
                                        dataKey="taux"
                                        stroke="hsl(142, 76%, 36%)"
                                        fill="url(#attendanceGradient)"
                                        strokeWidth={3}
                                    />
                                </AreaChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="h-full flex items-center justify-center text-muted-foreground italic">
                                Aucune donnée disponible
                            </div>
                        )}
                    </div>
                </CardContent>
            </Card>

            <Card className="shadow-sm">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-lg">
                        <BarChart3 className="w-5 h-5 text-primary" />
                        Présents vs Absents
                    </CardTitle>
                    <CardDescription>Comparaison quotidienne</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="h-72">
                        {data && data.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={data}>
                                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                                    <XAxis dataKey="date" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                                    <YAxis tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                                    <Tooltip
                                        contentStyle={{
                                            backgroundColor: "hsl(var(--card))",
                                            border: "1px solid hsl(var(--border))",
                                            borderRadius: "8px",
                                            boxShadow: "0 4px 12px rgba(0,0,0,0.1)"
                                        }}
                                    />
                                    <Legend iconType="circle" />
                                    <Bar dataKey="présents" fill="hsl(142, 76%, 36%)" radius={[4, 4, 0, 0]} />
                                    <Bar dataKey="absents" fill="hsl(0, 84%, 60%)" radius={[4, 4, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="h-full flex items-center justify-center text-muted-foreground italic">
                                Aucune donnée disponible
                            </div>
                        )}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
};
