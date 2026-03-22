import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Calendar, Users, Home, Clock, Mail, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useTenant } from "@/contexts/TenantContext";
import { ClassSubjectsManager } from "./ClassSubjectsManager";
import { BookOpen } from "lucide-react";
import { useStudentLabel } from "@/hooks/useStudentLabel";

interface Student {
    id: string;
    first_name: string;
    last_name: string;
    email: string | null;
    gender: string | null;
    status: string;
}

interface ClassDetailModalProps {
    isOpen: boolean;
    onClose: () => void;
    classroom: any;
}

export const ClassDetailModal = ({ isOpen, onClose, classroom }: ClassDetailModalProps) => {
    const { tenant } = useTenant();
    const { studentLabel, StudentLabel, studentsLabel, StudentsLabel } = useStudentLabel();
    const [students, setStudents] = useState<Student[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (isOpen && classroom?.id) {
            fetchStudents();
        }
    }, [isOpen, classroom?.id]);

    const fetchStudents = async () => {
        setLoading(true);
        const { data, error } = await supabase
            .from("enrollments")
            .select(`
        student_id,
        students:student_id (
          id,
          first_name,
          last_name,
          email,
          gender,
          status
        )
      `)
            .eq("class_id", classroom.id)
            .eq("status", "active");

        if (!error && data) {
            setStudents(data.map((d: any) => d.students));
        }
        setLoading(false);
    };

    if (!classroom) return null;

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-4xl p-0 overflow-hidden sm:rounded-2xl border-none shadow-2xl">
                <div className="bg-primary/5 p-6 border-b border-primary/10">
                    <div className="flex items-start gap-4">
                        <div className="w-14 h-14 rounded-2xl bg-primary flex items-center justify-center text-white shadow-lg shadow-primary/20">
                            <Calendar className="w-8 h-8" />
                        </div>
                        <div className="flex-1">
                            <h2 className="text-3xl font-bold text-foreground font-display">{classroom.name}</h2>
                            <div className="flex items-center gap-2 mt-1">
                                <Badge variant="secondary" className="bg-primary/10 text-primary border-none">
                                    {classroom.level?.name || "Niveau non défini"}
                                </Badge>
                                <span className="text-muted-foreground text-sm">• {classroom.academic_year_name || "2024-2025"}</span>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-8">
                        <StatSmall icon={Users} label={StudentsLabel} value={classroom.enrollment_count || 0} />
                        <StatSmall icon={Home} label="Capacité" value={classroom.capacity || "-"} />
                        <StatSmall icon={Clock} label="Salle" value={classroom.room_name || "B201"} />
                        <StatSmall icon={Calendar} label="Cours/sem." value="24h" />
                    </div>
                </div>

                <div className="p-6 pt-2">
                    <Tabs defaultValue="students" className="w-full">
                        <TabsList className="bg-muted/50 p-1 rounded-xl mb-6">
                            <TabsTrigger value="students" className="rounded-lg gap-2 data-[state=active]:bg-background data-[state=active]:shadow-sm">
                                <Users className="w-4 h-4" />
                                {StudentsLabel} ({students.length})
                            </TabsTrigger>
                            <TabsTrigger value="schedule" className="rounded-lg gap-2 data-[state=active]:bg-background data-[state=active]:shadow-sm">
                                <Clock className="w-4 h-4" />
                                Emploi du temps
                            </TabsTrigger>
                            <TabsTrigger value="curriculum" className="rounded-lg gap-2 data-[state=active]:bg-background data-[state=active]:shadow-sm">
                                <BookOpen className="w-4 h-4" />
                                Matières
                            </TabsTrigger>
                        </TabsList>

                        <TabsContent value="students">
                            <ScrollArea className="h-[400px] pr-4">
                                <div className="space-y-2">
                                    {loading ? (
                                        <p className="text-center py-8 text-muted-foreground animate-pulse">Chargement des {studentsLabel}...</p>
                                    ) : students.filter(s => !!s).length === 0 ? (
                                        <div className="text-center py-12 text-muted-foreground border-2 border-dashed rounded-2xl">
                                            <Users className="w-12 h-12 mx-auto mb-3 opacity-20" />
                                            <p>Aucun {studentLabel} dans cette classe</p>
                                        </div>
                                    ) : (
                                        students.filter(s => !!s).map((student) => (
                                            <div key={student.id} className="flex items-center justify-between p-4 rounded-xl border border-border hover:bg-muted/30 transition-colors group">
                                                <div className="flex items-center gap-4">
                                                    <Avatar className="h-10 w-10 border-2 border-background shadow-sm">
                                                        <AvatarFallback className="bg-primary/5 text-primary text-xs font-bold">
                                                            {(student.first_name?.[0] || "")}{(student.last_name?.[0] || "")}
                                                        </AvatarFallback>
                                                    </Avatar>
                                                    <div>
                                                        <p className="font-semibold text-sm group-hover:text-primary transition-colors">
                                                            {student.first_name} {student.last_name}
                                                        </p>
                                                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                                            <Mail className="w-3 h-3" />
                                                            {student.email || "pas d'email"}
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-3">
                                                    <Badge variant="outline" className="text-[10px] px-2 py-0 h-5 border-emerald-100 bg-emerald-50 text-emerald-700 font-medium">
                                                        <CheckCircle2 className="w-3 h-3 mr-1" />
                                                        Actif
                                                    </Badge>
                                                    <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded-md">
                                                        {student.gender === 'male' ? 'Garçon' : 'Fille'}
                                                    </span>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </ScrollArea>
                        </TabsContent>

                        <TabsContent value="schedule">
                            <div className="h-[400px] flex flex-col items-center justify-center text-muted-foreground border-2 border-dashed rounded-2xl">
                                <Clock className="w-12 h-12 mb-3 opacity-20" />
                                <p>Visualisation de l'emploi du temps bientôt disponible</p>
                            </div>
                        </TabsContent>

                        <TabsContent value="curriculum">
                            {tenant && (
                                <ClassSubjectsManager
                                    classId={classroom.id}
                                    tenantId={tenant.id}
                                    academicYearId={classroom.academic_year_id}
                                    levelId={classroom.level_id}
                                />
                            )}
                        </TabsContent>
                    </Tabs>
                </div>
            </DialogContent>
        </Dialog>
    );
};

const StatSmall = ({ icon: Icon, label, value }: { icon: any, label: string, value: string | number }) => (
    <div className="bg-background/60 backdrop-blur-sm p-3 rounded-xl border border-white/20 shadow-sm flex items-center gap-3">
        <div className="p-2 bg-primary/10 rounded-lg text-primary">
            <Icon className="w-4 h-4" />
        </div>
        <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">{label}</p>
            <p className="text-lg font-bold text-foreground leading-tight">{value}</p>
        </div>
    </div>
);
