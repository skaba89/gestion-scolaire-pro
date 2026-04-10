import { TableRow, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { GraduationCap, Mail, Phone, Settings2, Eye, Trash2 } from "lucide-react";
import { StaffProfile as TeacherProfile } from "@/features/staff/types";
import { CSSProperties } from "react";

interface TeacherRowProps {
    teacher: TeacherProfile;
    onView: (teacher: TeacherProfile) => void;
    onAssign: (teacher: TeacherProfile) => void;
    onDelete: (teacher: TeacherProfile) => void;
    style?: CSSProperties;
    className?: string;
}

export const TeacherRow = ({ teacher, onView, onAssign, onDelete, style, className }: TeacherRowProps) => {
    return (
        <TableRow style={style} className={className}>
            <TableCell className="font-medium">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        <GraduationCap className="w-5 h-5 text-primary" />
                    </div>
                    <div className="truncate">
                        <p className="font-medium truncate">
                            {teacher.first_name || teacher.last_name
                                ? `${teacher.first_name || ""} ${teacher.last_name || ""}`.trim()
                                : "—"}
                        </p>
                    </div>
                </div>
            </TableCell>
            <TableCell>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Mail className="w-4 h-4 shrink-0" />
                    <span className="truncate max-w-[150px]">{teacher.email}</span>
                </div>
            </TableCell>
            <TableCell>
                {teacher.phone ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Phone className="w-4 h-4 shrink-0" />
                        <span className="truncate">{teacher.phone}</span>
                    </div>
                ) : (
                    <span className="text-muted-foreground">—</span>
                )}
            </TableCell>
            <TableCell>
                <Badge variant={teacher.is_active ? "default" : "secondary"} className="text-[10px]">
                    {teacher.is_active ? "Actif" : "Inactif"}
                </Badge>
            </TableCell>
            <TableCell className="text-right">
                <div className="flex items-center justify-end gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-8 px-2"
                        onClick={() => onAssign(teacher)}
                    >
                        <Settings2 className="w-4 h-4 mr-1" />
                        <span className="hidden sm:inline">Assignations</span>
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-8 px-2"
                        onClick={() => onView(teacher)}
                    >
                        <Eye className="w-4 h-4 mr-1" />
                        <span className="hidden sm:inline">Détails</span>
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 px-2 text-red-600 hover:text-red-700 hover:bg-red-50"
                        onClick={() => onDelete(teacher)}
                    >
                        <Trash2 className="w-4 h-4" />
                    </Button>
                </div>
            </TableCell>
        </TableRow>
    );
};
