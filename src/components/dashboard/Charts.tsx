import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

interface ChartProps {
    data: any[];
    title?: string;
    description?: string;
    currencySymbol?: string;
}

/**
 * Revenue Trend Line Chart
 */
export const RevenueTrendChart = ({ data, title = "Évolution des revenus", description, currencySymbol }: ChartProps) => {
    return (
        <Card>
            <CardHeader>
                <CardTitle>{title}</CardTitle>
                {description && <CardDescription>{description}</CardDescription>}
            </CardHeader>
            <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={data}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="period" />
                        <YAxis />
                        <Tooltip
                            formatter={(value: number) => `${value.toLocaleString('fr-FR')} ${currencySymbol || ''}`}
                        />
                        <Legend />
                        <Line
                            type="monotone"
                            dataKey="revenue"
                            stroke="#8b5cf6"
                            strokeWidth={2}
                            name="Revenus totaux"
                        />
                        <Line
                            type="monotone"
                            dataKey="paid"
                            stroke="#10b981"
                            strokeWidth={2}
                            name="Payé"
                        />
                        <Line
                            type="monotone"
                            dataKey="pending"
                            stroke="#f59e0b"
                            strokeWidth={2}
                            name="En attente"
                        />
                    </LineChart>
                </ResponsiveContainer>
            </CardContent>
        </Card>
    );
};

/**
 * Outstanding by Class Bar Chart
 */
export const OutstandingByClassChart = ({ data, title = "Impayés par classe", description, currencySymbol }: ChartProps) => {
    return (
        <Card>
            <CardHeader>
                <CardTitle>{title}</CardTitle>
                {description && <CardDescription>{description}</CardDescription>}
            </CardHeader>
            <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={data}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="class_name" />
                        <YAxis />
                        <Tooltip
                            formatter={(value: number) => `${value.toLocaleString('fr-FR')} ${currencySymbol || ''}`}
                        />
                        <Legend />
                        <Bar
                            dataKey="outstanding_amount"
                            fill="#ef4444"
                            name="Montant impayé"
                        />
                    </BarChart>
                </ResponsiveContainer>
            </CardContent>
        </Card>
    );
};

/**
 * Success Rate by Class Bar Chart
 */
export const SuccessRateByClassChart = ({ data, title = "Taux de réussite par classe", description }: ChartProps) => {
    return (
        <Card>
            <CardHeader>
                <CardTitle>{title}</CardTitle>
                {description && <CardDescription>{description}</CardDescription>}
            </CardHeader>
            <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={data}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="class_name" />
                        <YAxis domain={[0, 100]} />
                        <Tooltip
                            formatter={(value: number) => `${value.toFixed(1)}%`}
                        />
                        <Legend />
                        <Bar
                            dataKey="success_rate"
                            fill="#10b981"
                            name="Taux de réussite (%)"
                        />
                    </BarChart>
                </ResponsiveContainer>
            </CardContent>
        </Card>
    );
};

/**
 * Success Rate by Subject Bar Chart
 */
export const SuccessRateBySubjectChart = ({ data, title = "Taux de réussite par matière", description }: ChartProps) => {
    return (
        <Card>
            <CardHeader>
                <CardTitle>{title}</CardTitle>
                {description && <CardDescription>{description}</CardDescription>}
            </CardHeader>
            <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={data} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis type="number" domain={[0, 100]} />
                        <YAxis type="category" dataKey="subject_name" width={120} />
                        <Tooltip
                            formatter={(value: number) => `${value.toFixed(1)}%`}
                        />
                        <Legend />
                        <Bar
                            dataKey="success_rate"
                            fill="#3b82f6"
                            name="Taux de réussite (%)"
                        />
                    </BarChart>
                </ResponsiveContainer>
            </CardContent>
        </Card>
    );
};

/**
 * Grade Evolution Area Chart
 */
export const GradeEvolutionChart = ({ data, title = "Évolution des notes", description }: ChartProps) => {
    return (
        <Card>
            <CardHeader>
                <CardTitle>{title}</CardTitle>
                {description && <CardDescription>{description}</CardDescription>}
            </CardHeader>
            <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                    <AreaChart data={data}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="period" />
                        <YAxis domain={[0, 20]} />
                        <Tooltip
                            formatter={(value: number) => `${value.toFixed(2)}/20`}
                        />
                        <Legend />
                        <Area
                            type="monotone"
                            dataKey="average_grade"
                            stroke="#8b5cf6"
                            fill="#8b5cf6"
                            fillOpacity={0.3}
                            name="Moyenne générale"
                        />
                    </AreaChart>
                </ResponsiveContainer>
            </CardContent>
        </Card>
    );
};

/**
 * Enrollment by Class Pie Chart
 */
export const EnrollmentByClassChart = ({ data, title = "Répartition des inscriptions", description }: ChartProps) => {
    const COLORS = ['#8b5cf6', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#06b6d4', '#84cc16'];

    return (
        <Card>
            <CardHeader>
                <CardTitle>{title}</CardTitle>
                {description && <CardDescription>{description}</CardDescription>}
            </CardHeader>
            <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                        <Pie
                            data={data}
                            cx="50%"
                            cy="50%"
                            labelLine={false}
                            label={({ class_name, enrollment_count }) => `${class_name}: ${enrollment_count}`}
                            outerRadius={100}
                            fill="#8884d8"
                            dataKey="enrollment_count"
                        >
                            {(Array.isArray(data) ? data : []).map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                            ))}
                        </Pie>
                        <Tooltip />
                    </PieChart>
                </ResponsiveContainer>
            </CardContent>
        </Card>
    );
};
/**
 * Attendance Trend Line Chart
 */
export const AttendanceTrendChart = ({ data, title = "Tendance de présence", description }: ChartProps) => {
    return (
        <Card>
            <CardHeader>
                <CardTitle>{title}</CardTitle>
                {description && <CardDescription>{description}</CardDescription>}
            </CardHeader>
            <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={data}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="period" />
                        <YAxis domain={[0, 100]} />
                        <Tooltip
                            formatter={(value: number) => `${value.toFixed(1)}%`}
                        />
                        <Legend />
                        <Line
                            type="monotone"
                            dataKey="attendance_rate"
                            stroke="#3b82f6"
                            strokeWidth={2}
                            name="Taux de présence (%)"
                        />
                    </LineChart>
                </ResponsiveContainer>
            </CardContent>
        </Card>
    );
};

/**
 * Teacher Workload Bar Chart
 */
export const TeacherWorkloadChart = ({ data, title = "Charge de travail des professeurs", description }: ChartProps) => {
    return (
        <Card>
            <CardHeader>
                <CardTitle>{title}</CardTitle>
                {description && <CardDescription>{description}</CardDescription>}
            </CardHeader>
            <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={data} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis type="number" unit="h" />
                        <YAxis type="category" dataKey="teacher_name" width={150} />
                        <Tooltip
                            formatter={(value: number) => `${value.toFixed(1)}h`}
                        />
                        <Legend />
                        <Bar
                            dataKey="total_hours"
                            fill="#8b5cf6"
                            name="Heures totales"
                            radius={[0, 4, 4, 0]}
                        />
                    </BarChart>
                </ResponsiveContainer>
            </CardContent>
        </Card>
    );
};
