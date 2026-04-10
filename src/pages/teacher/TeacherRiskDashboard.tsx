import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/api/client";
import { useAuth } from "@/contexts/AuthContext";
import { useTenant } from "@/contexts/TenantContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
    AlertTriangle,
    Users,
    Search,
    Mail,
    Calendar,
    Download,
    TrendingDown,
    BookOpen
} from "lucide-react";
import { cn } from "@/lib/utils";
import { TableSkeleton } from "@/components/ui/TableSkeleton";
import { recommendationEngine } from "@/utils/recommendationEngine";

type RiskLevel = "LOW" | "MODERATE" | "HIGH" | "CRITICAL";

interface StudentRiskData {
    student_id: string;
    student_name: string;
    class_name: string;
    risk_score: number;
    risk_level: RiskLevel;
    factors: any[];
    calculated_at: string;
}

const getRiskColor = (level: RiskLevel) => {
    switch (level) {
        case "CRITICAL": return "bg-red-100 text-red-800 border-red-200";
        case "HIGH": return "bg-orange-100 text-orange-800 border-orange-200";
        case "MODERATE": return "bg-yellow-100 text-yellow-800 border-yellow-200";
        case "LOW": return "bg-green-100 text-green-800 border-green-200";
    }
};

const getRiskIcon = (level: RiskLevel) => {
    switch (level) {
        case "CRITICAL": return "🔴";
        case "HIGH": return "🟠";
        case "MODERATE": return "🟡";
        case "LOW": return "🟢";
    }
};

export const TeacherRiskDashboard = () => {
    const { user } = useAuth();
    const { tenant } = useTenant();
    const [searchTerm, setSearchTerm] = useState("");
    const [filterLevel, setFilterLevel] = useState<RiskLevel | "ALL">("ALL");

    // Get teacher's classes
    const { data: teacherClasses } = useQuery({
        queryKey: ['teacher-classes', user?.id],
        queryFn: async () => {
            const { data } = await apiClient.get("/students/", {
                params: {
                    teacher_id: user?.id,
                    view: 'classes',
                },
            });

            return data || [];
        },
        enabled: !!user?.id && !!tenant?.id
    });

    const classIds = teacherClasses?.map(c => c.id) || [];

    // Get risk scores for students in teacher's classes
    const { data: riskScores, isLoading } = useQuery({
        queryKey: ['teacher-risk-scores', classIds],
        queryFn: async () => {
            if (classIds.length === 0) return [];

            const { data } = await apiClient.get("/analytics/students-at-risk/", {
                params: {
                    class_ids: classIds.join(','),
                },
            });

            return (data || []).map((score: any) => ({
                student_id: score.student_id,
                student_name: `${score.student_first_name || ''} ${score.student_last_name || ''}`.trim(),
                class_name: score.class_name || '',
                risk_score: score.risk_score,
                risk_level: score.risk_level,
                factors: score.factors || [],
                calculated_at: score.calculated_at
            })) as StudentRiskData[];
        },
        enabled: classIds.length > 0
    });

    // Get recommendations for ALL teacher classes
    const { data: recommendations } = useQuery({
        queryKey: ['teacher-recommendations', classIds],
        queryFn: async () => {
            if (!riskScores || riskScores.length === 0) return [];

            // Iterate over ALL classIds and collect recommendations for each class
            const allRecs = await Promise.all(
                classIds.map(classId =>
                    recommendationEngine.generateTeacherRecommendations(
                        classId,
                        riskScores.map(rs => ({
                            student_id: rs.student_id,
                            risk_score: rs.risk_score,
                            risk_level: rs.risk_level,
                            factors: rs.factors,
                            calculated_at: rs.calculated_at
                        }))
                    ).catch(() => [])
                )
            );

            // Deduplicate by id, keeping highest priority
            const recMap = new Map<string, any>();
            for (const recs of allRecs) {
                for (const rec of recs) {
                    const existing = recMap.get(rec.id);
                    if (!existing || rec.priority > existing.priority) {
                        recMap.set(rec.id, rec);
                    }
                }
            }

            return Array.from(recMap.values()).sort((a, b) => b.priority - a.priority);
        },
        enabled: !!riskScores && riskScores.length > 0 && classIds.length > 0
    });

    // Filter students
    const filteredStudents = riskScores?.filter(student => {
        const matchesSearch = student.student_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            student.class_name.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesLevel = filterLevel === "ALL" || student.risk_level === filterLevel;
        return matchesSearch && matchesLevel;
    }) || [];

    // Stats
    const stats = {
        total: riskScores?.length || 0,
        critical: riskScores?.filter(s => s.risk_level === "CRITICAL").length || 0,
        high: riskScores?.filter(s => s.risk_level === "HIGH").length || 0,
        moderate: riskScores?.filter(s => s.risk_level === "MODERATE").length || 0,
    };

    const handleExportPDF = async () => {
        const { default: jsPDF } = await import("jspdf");
        const { default: autoTable } = await import("jspdf-autotable");

        const doc = new jsPDF();
        const pageWidth = doc.internal.pageSize.getWidth();

        // Header
        doc.setFontSize(18);
        doc.text("Rapport des Élèves à Risque", pageWidth / 2, 20, { align: "center" });

        doc.setFontSize(10);
        doc.text(`Généré le: ${new Date().toLocaleDateString("fr-FR")}`, pageWidth / 2, 28, { align: "center" });
        doc.text(`Établissement: ${tenant?.name || ""}`, pageWidth / 2, 34, { align: "center" });

        // Summary Stats
        doc.setFontSize(12);
        doc.text("Résumé des Alertes", 14, 45);
        autoTable(doc, {
            startY: 50,
            head: [["Total Élèves", "Alertes Critiques", "Alertes Élevées", "Alertes Modérées"]],
            body: [[stats.total, stats.critical, stats.high, stats.moderate]],
            theme: "grid"
        });

        // Student List
        doc.text("Détail par Élève", 14, (doc as any).lastAutoTable.finalY + 15);
        autoTable(doc, {
            startY: (doc as any).lastAutoTable.finalY + 20,
            head: [["Élève", "Classe", "Score", "Niveau", "Dernier Calcul"]],
            body: filteredStudents.map(s => [
                s.student_name,
                s.class_name,
                `${s.risk_score}/100`,
                s.risk_level,
                new Date(s.calculated_at).toLocaleDateString("fr-FR")
            ]),
            styles: { fontSize: 9 },
            headStyles: { fillColor: [200, 200, 200], textColor: 0 }
        });

        doc.save(`rapport-risques-${new Date().toISOString().split('T')[0]}.pdf`);
        toast.success("Rapport PDF exporté");
    };

    if (isLoading) {
        return <TableSkeleton columns={5} rows={10} />;
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold">Élèves à Risque</h1>
                    <p className="text-muted-foreground">Système d'alerte précoce pour vos classes</p>
                </div>
                <Button onClick={handleExportPDF} variant="outline">
                    <Download className="w-4 h-4 mr-2" />
                    Exporter PDF
                </Button>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card>
                    <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-muted-foreground">Total</p>
                                <p className="text-2xl font-bold">{stats.total}</p>
                            </div>
                            <Users className="w-8 h-8 text-primary opacity-20" />
                        </div>
                    </CardContent>
                </Card>
                <Card className="border-red-200 bg-red-50">
                    <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-red-600">Critique</p>
                                <p className="text-2xl font-bold text-red-700">{stats.critical}</p>
                            </div>
                            <AlertTriangle className="w-8 h-8 text-red-500 opacity-30" />
                        </div>
                    </CardContent>
                </Card>
                <Card className="border-orange-200 bg-orange-50">
                    <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-orange-600">Élevé</p>
                                <p className="text-2xl font-bold text-orange-700">{stats.high}</p>
                            </div>
                            <TrendingDown className="w-8 h-8 text-orange-500 opacity-30" />
                        </div>
                    </CardContent>
                </Card>
                <Card className="border-yellow-200 bg-yellow-50">
                    <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-yellow-600">Modéré</p>
                                <p className="text-2xl font-bold text-yellow-700">{stats.moderate}</p>
                            </div>
                            <BookOpen className="w-8 h-8 text-yellow-500 opacity-30" />
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Recommendations */}
            {recommendations && recommendations.length > 0 && (
                <Card className="border-primary/20 bg-gradient-to-r from-primary/5 to-transparent">
                    <CardHeader>
                        <CardTitle className="text-lg flex items-center gap-2">
                            <AlertTriangle className="w-5 h-5 text-primary" />
                            Recommandations
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-2">
                            {recommendations.slice(0, 3).map((rec, idx) => (
                                <div key={idx} className="flex items-start gap-3 p-3 rounded-lg bg-background">
                                    <rec.icon className="w-5 h-5 mt-0.5 text-primary" />
                                    <div className="flex-1">
                                        <p className="font-medium text-sm">{rec.title}</p>
                                        <p className="text-sm text-muted-foreground">{rec.message}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Filters */}
            <Card>
                <CardContent className="p-4">
                    <div className="flex flex-col md:flex-row gap-4">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <Input
                                placeholder="Rechercher un élève ou une classe..."
                                className="pl-9"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                        <div className="flex gap-2">
                            {(["ALL", "CRITICAL", "HIGH", "MODERATE", "LOW"] as const).map((level) => (
                                <Button
                                    key={level}
                                    variant={filterLevel === level ? "default" : "outline"}
                                    size="sm"
                                    onClick={() => setFilterLevel(level)}
                                >
                                    {level === "ALL" ? "Tous" : level}
                                </Button>
                            ))}
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Students List */}
            <Card>
                <CardHeader>
                    <CardTitle>Liste des élèves ({filteredStudents.length})</CardTitle>
                </CardHeader>
                <CardContent>
                    {filteredStudents.length === 0 ? (
                        <div className="text-center py-12 text-muted-foreground">
                            <Users className="w-12 h-12 mx-auto mb-3 opacity-20" />
                            <p>Aucun élève trouvé</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {filteredStudents.map((student) => (
                                <div
                                    key={student.student_id}
                                    className="flex items-center justify-between p-4 rounded-lg border hover:bg-muted/50 transition-colors"
                                >
                                    <div className="flex items-center gap-4 flex-1">
                                        <div className="text-2xl">{getRiskIcon(student.risk_level)}</div>
                                        <div className="flex-1">
                                            <p className="font-semibold">{student.student_name}</p>
                                            <p className="text-sm text-muted-foreground">{student.class_name}</p>
                                        </div>
                                        <Badge className={cn("font-mono", getRiskColor(student.risk_level))}>
                                            {student.risk_score}/100
                                        </Badge>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Button variant="ghost" size="sm">
                                            <Mail className="w-4 h-4 mr-2" />
                                            Contacter
                                        </Button>
                                        <Button variant="ghost" size="sm">
                                            <Calendar className="w-4 h-4 mr-2" />
                                            Entretien
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
};
