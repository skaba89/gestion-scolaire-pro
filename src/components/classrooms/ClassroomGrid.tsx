import { MoreVertical, Edit, Trash2, MapPin, Users } from "lucide-react";
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle
} from "@/components/ui/card";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Classroom } from "@/queries/classrooms";

interface ClassroomGridProps {
    classrooms: Classroom[];
    academicYears: { id: string; name: string }[];
    studentsLabel: string;
    studentLabel: string;
    onEdit: (classroom: Classroom) => void;
    onDelete: (id: string) => void;
    onDetail: (classroom: Classroom) => void;
}

export const ClassroomGrid = ({
    classrooms,
    academicYears,
    studentsLabel,
    studentLabel,
    onEdit,
    onDelete,
    onDetail,
}: ClassroomGridProps) => {
    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {classrooms.map((classroom) => {
                const occupancyRate = classroom.capacity ? Math.round(((classroom.enrollment_count || 0) / classroom.capacity) * 100) : 0;
                return (
                    <Card key={classroom.id}
                        className="group border-none shadow-md hover:shadow-2xl transition-all duration-300 rounded-2xl overflow-hidden cursor-pointer bg-card/60 backdrop-blur-sm"
                        onClick={() => onDetail(classroom)}
                    >
                        <CardHeader className="pb-4">
                            <div className="flex justify-between items-start">
                                <div className="flex items-center gap-3">
                                    <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center font-bold text-lg group-hover:bg-primary group-hover:text-white transition-all">
                                        {(classroom.name || "?").substring(0, 2)}
                                    </div>
                                    <div>
                                        <CardTitle className="text-xl font-bold font-display group-hover:text-primary transition-colors">
                                            {classroom.name || "Sans nom"}
                                        </CardTitle>
                                        <Badge variant="secondary" className="mt-1 bg-muted/80 text-muted-foreground text-[10px] font-bold uppercase tracking-wider">
                                            {classroom.level?.name || 'Niveau'}
                                        </Badge>
                                    </div>
                                </div>
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                                        <Button variant="ghost" size="icon" className="rounded-full h-8 w-8 hover:bg-background">
                                            <MoreVertical className="w-4 h-4" />
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end" className="rounded-xl border-none shadow-2xl">
                                        <DropdownMenuItem
                                            onClick={(e) => { e.stopPropagation(); onEdit(classroom); }}
                                            className="rounded-lg gap-2 cursor-pointer"
                                        >
                                            <Edit className="w-4 h-4" /> Modifier
                                        </DropdownMenuItem>
                                        <DropdownMenuItem
                                            className="text-destructive rounded-lg gap-2 cursor-pointer focus:bg-destructive/10"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onDelete(classroom.id);
                                            }}
                                        >
                                            <Trash2 className="w-4 h-4" /> Supprimer
                                        </DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="space-y-1.5">
                                <div className="flex justify-between text-xs text-muted-foreground font-bold uppercase tracking-wider">
                                    <span>Année scolaire</span>
                                    <span className="text-foreground">
                                        {academicYears.find(y => y.id === classroom.academic_year_id)?.name || "-"}
                                    </span>
                                </div>
                                <div className="flex justify-between text-xs text-muted-foreground font-bold uppercase tracking-wider">
                                    <span><MapPin className="w-3 h-3 inline mr-1" /> Salle</span>
                                    <span className="text-foreground">{classroom.room?.name || "-"}</span>
                                </div>
                            </div>

                            <div className="pt-4 border-t border-muted/50 space-y-3">
                                <div className="flex justify-between items-end mb-1">
                                    <div className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                                        <Users className="w-4 h-4 text-primary" />
                                        <span>
                                            {classroom.enrollment_count} / {classroom.capacity || '-'} {classroom.enrollment_count && classroom.enrollment_count > 1 ? studentsLabel : studentLabel}
                                        </span>
                                    </div>
                                    <span className={`text-xs font-bold ${occupancyRate > 90 ? 'text-destructive' : 'text-primary'}`}>
                                        {occupancyRate}%
                                    </span>
                                </div>
                                <Progress value={occupancyRate} className="h-2 rounded-full bg-muted shadow-inner" />
                            </div>
                        </CardContent>
                    </Card>
                );
            })}
        </div>
    );
};
