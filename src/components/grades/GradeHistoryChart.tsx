import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, BarChart, Bar, ReferenceLine } from "recharts";
import { TrendingUp, TrendingDown, Minus, BookOpen, Trophy, Target, Calendar } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { cn } from "@/lib/utils";

interface Grade {
  id: string;
  score: number | null;
  assessment: {
    name: string;
    max_score: number;
    type: string;
    date: string;
    subject: {
      name: string;
      code: string | null;
    };
  };
}

interface GradeHistoryChartProps {
  grades: Grade[];
  className?: string;
}

const SUBJECT_COLORS = [
  "#3b82f6", "#10b981", "#8b5cf6", "#f59e0b", "#ef4444", 
  "#06b6d4", "#ec4899", "#84cc16", "#6366f1", "#14b8a6"
];

export const GradeHistoryChart = ({ grades, className }: GradeHistoryChartProps) => {
  const [selectedSubject, setSelectedSubject] = useState<string>("all");
  const [viewMode, setViewMode] = useState<"evolution" | "comparison" | "stats">("evolution");

  // Get unique subjects
  const subjects = useMemo(() => {
    const subjectMap = new Map<string, string>();
    grades.forEach((grade) => {
      const subjectName = grade.assessment.subject.name;
      if (!subjectMap.has(subjectName)) {
        subjectMap.set(subjectName, subjectName);
      }
    });
    return Array.from(subjectMap.values()).sort();
  }, [grades]);

  // Create color mapping for subjects
  const subjectColors = useMemo(() => {
    const colorMap = new Map<string, string>();
    subjects.forEach((subject, index) => {
      colorMap.set(subject, SUBJECT_COLORS[index % SUBJECT_COLORS.length]);
    });
    return colorMap;
  }, [subjects]);

  // Filter grades by selected subject
  const filteredGrades = useMemo(() => {
    if (selectedSubject === "all") return grades;
    return grades.filter((g) => g.assessment.subject.name === selectedSubject);
  }, [grades, selectedSubject]);

  // Prepare data for evolution chart
  const evolutionData = useMemo(() => {
    const sortedGrades = [...filteredGrades]
      .filter((g) => g.score !== null && g.assessment.date)
      .sort((a, b) => new Date(a.assessment.date).getTime() - new Date(b.assessment.date).getTime());

    return sortedGrades.map((grade) => ({
      date: format(new Date(grade.assessment.date), "dd/MM", { locale: fr }),
      fullDate: format(new Date(grade.assessment.date), "d MMMM yyyy", { locale: fr }),
      score: grade.score !== null ? (grade.score / grade.assessment.max_score) * 20 : 0,
      rawScore: grade.score,
      maxScore: grade.assessment.max_score,
      subject: grade.assessment.subject.name,
      assessment: grade.assessment.name,
      type: grade.assessment.type,
    }));
  }, [filteredGrades]);

  // Prepare data for subject comparison
  const comparisonData = useMemo(() => {
    const subjectAverages = new Map<string, { total: number; count: number }>();
    
    grades.forEach((grade) => {
      if (grade.score === null) return;
      const subject = grade.assessment.subject.name;
      const normalized = (grade.score / grade.assessment.max_score) * 20;
      
      if (!subjectAverages.has(subject)) {
        subjectAverages.set(subject, { total: 0, count: 0 });
      }
      const current = subjectAverages.get(subject)!;
      current.total += normalized;
      current.count++;
    });

    return Array.from(subjectAverages.entries()).map(([subject, data]) => ({
      subject,
      average: Math.round((data.total / data.count) * 10) / 10,
      count: data.count,
      color: subjectColors.get(subject) || SUBJECT_COLORS[0],
    })).sort((a, b) => b.average - a.average);
  }, [grades, subjectColors]);

  // Calculate statistics
  const stats = useMemo(() => {
    const validGrades = filteredGrades.filter((g) => g.score !== null);
    if (validGrades.length === 0) return null;

    const normalized = validGrades.map((g) => (g.score! / g.assessment.max_score) * 20);
    const average = normalized.reduce((a, b) => a + b, 0) / normalized.length;
    const max = Math.max(...normalized);
    const min = Math.min(...normalized);

    // Calculate trend (comparing last 3 vs previous 3)
    const recentGrades = normalized.slice(-3);
    const previousGrades = normalized.slice(-6, -3);
    let trend: "up" | "down" | "stable" = "stable";
    
    if (recentGrades.length >= 2 && previousGrades.length >= 2) {
      const recentAvg = recentGrades.reduce((a, b) => a + b, 0) / recentGrades.length;
      const previousAvg = previousGrades.reduce((a, b) => a + b, 0) / previousGrades.length;
      if (recentAvg > previousAvg + 0.5) trend = "up";
      else if (recentAvg < previousAvg - 0.5) trend = "down";
    }

    // Best subject
    const bestSubject = comparisonData[0];
    const weakestSubject = comparisonData[comparisonData.length - 1];

    return {
      average: Math.round(average * 10) / 10,
      max: Math.round(max * 10) / 10,
      min: Math.round(min * 10) / 10,
      count: validGrades.length,
      trend,
      bestSubject,
      weakestSubject,
    };
  }, [filteredGrades, comparisonData]);

  const getTrendIcon = (trend: "up" | "down" | "stable") => {
    switch (trend) {
      case "up":
        return <TrendingUp className="w-4 h-4 text-success" />;
      case "down":
        return <TrendingDown className="w-4 h-4 text-destructive" />;
      default:
        return <Minus className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const getGradeColor = (score: number) => {
    if (score >= 16) return "text-success";
    if (score >= 12) return "text-primary";
    if (score >= 10) return "text-warning";
    return "text-destructive";
  };

  if (grades.length === 0) {
    return (
      <Card className={className}>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <BookOpen className="w-12 h-12 text-muted-foreground/50 mb-4" />
          <p className="text-muted-foreground">Aucune note disponible pour le moment</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5" />
            Évolution des Notes
          </CardTitle>
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={selectedSubject} onValueChange={setSelectedSubject}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Toutes les matières" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes les matières</SelectItem>
                {subjects.map((subject) => (
                  <SelectItem key={subject} value={subject}>
                    {subject}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as "evolution" | "comparison" | "stats")} className="mt-4">
          <TabsList>
            <TabsTrigger value="evolution">Évolution</TabsTrigger>
            <TabsTrigger value="comparison">Par matière</TabsTrigger>
            <TabsTrigger value="stats">Statistiques</TabsTrigger>
          </TabsList>
        </Tabs>
      </CardHeader>

      <CardContent>
        {/* Stats Summary */}
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
            <div className="bg-muted/50 rounded-lg p-3 text-center">
              <div className={cn("text-2xl font-bold", getGradeColor(stats.average))}>
                {stats.average}/20
              </div>
              <div className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                Moyenne {getTrendIcon(stats.trend)}
              </div>
            </div>
            <div className="bg-muted/50 rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-success">{stats.max}/20</div>
              <div className="text-xs text-muted-foreground">Meilleure note</div>
            </div>
            <div className="bg-muted/50 rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-destructive">{stats.min}/20</div>
              <div className="text-xs text-muted-foreground">Note la plus basse</div>
            </div>
            <div className="bg-muted/50 rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-primary">{stats.count}</div>
              <div className="text-xs text-muted-foreground">Évaluations</div>
            </div>
          </div>
        )}

        {viewMode === "evolution" && (
          <div className="h-[300px]">
            {evolutionData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={evolutionData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis 
                    dataKey="date" 
                    tick={{ fontSize: 12 }}
                    className="text-muted-foreground"
                  />
                  <YAxis 
                    domain={[0, 20]} 
                    tick={{ fontSize: 12 }}
                    className="text-muted-foreground"
                  />
                  <Tooltip 
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const data = payload[0].payload;
                      return (
                        <div className="bg-popover border border-border rounded-lg p-3 shadow-lg">
                          <p className="font-semibold">{data.assessment}</p>
                          <p className="text-sm text-muted-foreground">{data.subject}</p>
                          <p className="text-sm">{data.fullDate}</p>
                          <p className={cn("font-bold text-lg", getGradeColor(data.score))}>
                            {data.rawScore}/{data.maxScore} ({data.score.toFixed(1)}/20)
                          </p>
                        </div>
                      );
                    }}
                  />
                  <ReferenceLine y={10} stroke="hsl(var(--muted-foreground))" strokeDasharray="5 5" />
                  <Line 
                    type="monotone" 
                    dataKey="score" 
                    stroke="hsl(var(--primary))" 
                    strokeWidth={2}
                    dot={{ fill: "hsl(var(--primary))", strokeWidth: 2, r: 4 }}
                    activeDot={{ r: 6, fill: "hsl(var(--primary))" }}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                Pas assez de données pour afficher l'évolution
              </div>
            )}
          </div>
        )}

        {viewMode === "comparison" && (
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={comparisonData} layout="vertical" margin={{ top: 5, right: 30, left: 80, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" horizontal={false} />
                <XAxis 
                  type="number" 
                  domain={[0, 20]} 
                  tick={{ fontSize: 12 }}
                  className="text-muted-foreground"
                />
                <YAxis 
                  type="category" 
                  dataKey="subject" 
                  tick={{ fontSize: 12 }}
                  className="text-muted-foreground"
                  width={80}
                />
                <Tooltip 
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const data = payload[0].payload;
                    return (
                      <div className="bg-popover border border-border rounded-lg p-3 shadow-lg">
                        <p className="font-semibold">{data.subject}</p>
                        <p className={cn("text-lg font-bold", getGradeColor(data.average))}>
                          Moyenne: {data.average}/20
                        </p>
                        <p className="text-sm text-muted-foreground">{data.count} évaluations</p>
                      </div>
                    );
                  }}
                />
                <ReferenceLine x={10} stroke="hsl(var(--muted-foreground))" strokeDasharray="5 5" />
                <Bar 
                  dataKey="average" 
                  fill="hsl(var(--primary))"
                  radius={[0, 4, 4, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {viewMode === "stats" && stats && (
          <div className="grid gap-4 sm:grid-cols-2">
            {stats.bestSubject && (
              <div className="border border-border rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Trophy className="w-5 h-5 text-warning" />
                  <span className="font-semibold">Meilleure matière</span>
                </div>
                <p className="text-lg font-bold text-success">{stats.bestSubject.subject}</p>
                <p className="text-sm text-muted-foreground">
                  Moyenne: {stats.bestSubject.average}/20 ({stats.bestSubject.count} notes)
                </p>
              </div>
            )}
            {stats.weakestSubject && stats.weakestSubject.subject !== stats.bestSubject?.subject && (
              <div className="border border-border rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Target className="w-5 h-5 text-primary" />
                  <span className="font-semibold">À améliorer</span>
                </div>
                <p className="text-lg font-bold text-warning">{stats.weakestSubject.subject}</p>
                <p className="text-sm text-muted-foreground">
                  Moyenne: {stats.weakestSubject.average}/20 ({stats.weakestSubject.count} notes)
                </p>
              </div>
            )}
            <div className="border border-border rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <Calendar className="w-5 h-5 text-primary" />
                <span className="font-semibold">Tendance</span>
              </div>
              <div className="flex items-center gap-2">
                {getTrendIcon(stats.trend)}
                <span className={cn(
                  "font-bold",
                  stats.trend === "up" && "text-success",
                  stats.trend === "down" && "text-destructive",
                  stats.trend === "stable" && "text-muted-foreground"
                )}>
                  {stats.trend === "up" && "En progression"}
                  {stats.trend === "down" && "En baisse"}
                  {stats.trend === "stable" && "Stable"}
                </span>
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                Basé sur les dernières évaluations
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
