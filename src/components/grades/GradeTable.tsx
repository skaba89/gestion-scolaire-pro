import { useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { BarChart3 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Assessment } from "@/queries/grades";

interface GradeTableProps {
    assessments: Assessment[];
    isLoading: boolean;
}

export const GradeTable = ({ assessments = [], isLoading }: GradeTableProps) => {
    const parentRef = useRef<HTMLDivElement>(null);

    const rowVirtualizer = useVirtualizer({
        count: assessments.length,
        getScrollElement: () => parentRef.current,
        estimateSize: () => 53,
        overscan: 10,
    });

    const virtualItems = rowVirtualizer.getVirtualItems();
    const paddingTop = virtualItems.length > 0 ? virtualItems[0].start : 0;
    const paddingBottom = virtualItems.length > 0
        ? rowVirtualizer.getTotalSize() - virtualItems[virtualItems.length - 1].end
        : 0;

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <BarChart3 className="w-5 h-5" />
                    Évaluations ({assessments?.length || 0})
                </CardTitle>
            </CardHeader>
            <CardContent>
                {isLoading ? (
                    <div className="text-center py-8 text-muted-foreground">
                        Chargement...
                    </div>
                ) : assessments?.length === 0 ? (
                    <div className="text-center py-12">
                        <BarChart3 className="w-12 h-12 text-muted-foreground/50 mx-auto mb-4" />
                        <p className="text-muted-foreground">Aucune évaluation trouvée</p>
                        <p className="text-sm text-muted-foreground/70">
                            Créez des évaluations pour commencer à saisir les notes
                        </p>
                    </div>
                ) : (
                    <div
                        ref={parentRef}
                        className="h-[500px] overflow-auto border rounded-md relative"
                    >
                        <Table>
                            <TableHeader className="sticky top-0 bg-background z-10 shadow-sm">
                                <TableRow>
                                    <TableHead>Évaluation</TableHead>
                                    <TableHead>Matière</TableHead>
                                    <TableHead>Classe</TableHead>
                                    <TableHead>Type</TableHead>
                                    <TableHead>Note Max</TableHead>
                                    <TableHead>Coefficient</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {paddingTop > 0 && (
                                    <TableRow>
                                        <TableCell colSpan={6} style={{ height: `${paddingTop}px` }} />
                                    </TableRow>
                                )}
                                {virtualItems.map((virtualRow) => {
                                    const assessment = assessments[virtualRow.index];
                                    return (
                                        <TableRow key={assessment.id} style={{ height: `${virtualRow.size}px` }}>
                                            <TableCell className="font-medium">{assessment.name}</TableCell>
                                            <TableCell>
                                                <Badge variant="outline">
                                                    {assessment.subjects?.name || "-"}
                                                </Badge>
                                            </TableCell>
                                            <TableCell>{assessment.classrooms?.name || "-"}</TableCell>
                                            <TableCell>
                                                <Badge variant="secondary">{assessment.type}</Badge>
                                            </TableCell>
                                            <TableCell>{assessment.max_score}</TableCell>
                                            <TableCell>{assessment.weight}</TableCell>
                                        </TableRow>
                                    );
                                })}
                                {paddingBottom > 0 && (
                                    <TableRow>
                                        <TableCell colSpan={6} style={{ height: `${paddingBottom}px` }} />
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </div>
                )}
            </CardContent>
        </Card>
    );
};

