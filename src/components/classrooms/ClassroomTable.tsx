import { Edit, Trash2, Users } from "lucide-react";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Classroom } from "@/queries/classrooms";

interface ClassroomTableProps {
    classrooms: Classroom[];
    onEdit: (classroom: Classroom) => void;
    onDelete: (id: string) => void;
    onDetail: (classroom: Classroom) => void;
}

export const ClassroomTable = ({
    classrooms,
    onEdit,
    onDelete,
    onDetail,
}: ClassroomTableProps) => {
    return (
        <Card className="border-none shadow-sm overflow-hidden rounded-2xl">
            <CardContent className="p-0">
                <div className="overflow-x-auto">
                    <Table>
                        <TableHeader className="bg-muted/50">
                            <TableRow>
                                <TableHead className="w-[200px]">Classe</TableHead>
                                <TableHead>Niveau</TableHead>
                                <TableHead>Effectif</TableHead>
                                <TableHead>Capacité</TableHead>
                                <TableHead>Campus</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {classrooms.map((classroom) => (
                                <TableRow
                                    key={classroom.id}
                                    className="cursor-pointer hover:bg-muted/30"
                                    onClick={() => onDetail(classroom)}
                                >
                                    <TableCell className="font-bold">{classroom.name}</TableCell>
                                    <TableCell>
                                        <Badge variant="outline" className="bg-muted/50 uppercase text-[10px] tracking-wider font-bold">
                                            {classroom.level?.name || '-'}
                                        </Badge>
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex items-center gap-2">
                                            <Users className="w-4 h-4 text-primary" />
                                            <span>{classroom.enrollment_count || 0}</span>
                                        </div>
                                    </TableCell>
                                    <TableCell>{classroom.capacity ?? '-'}</TableCell>
                                    <TableCell>{classroom.campus?.name || '-'}</TableCell>
                                    <TableCell className="text-right">
                                        <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                                            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={() => onEdit(classroom)}>
                                                <Edit className="w-4 h-4 text-muted-foreground" />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8 rounded-full text-destructive hover:text-destructive hover:bg-destructive/10"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onDelete(classroom.id);
                                                }}
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </Button>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            </CardContent>
        </Card>
    );
};
