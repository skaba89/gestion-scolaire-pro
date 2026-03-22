import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Users, School, BarChart3, ClipboardCheck } from "lucide-react";
import { Link } from "react-router-dom";

interface TeacherClassCardProps {
    classroom: { id: string; name: string };
    studentCount: number;
    studentsLabel: string;
    getTenantUrl: (path: string) => string;
}

export const TeacherClassCard = ({
    classroom,
    studentCount,
    studentsLabel,
    getTenantUrl,
}: TeacherClassCardProps) => {
    return (
        <Card className="hover:shadow-lg transition-all duration-300 border-transparent hover:border-primary/20 group">
            <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                    <div className="space-y-1">
                        <CardTitle className="text-xl group-hover:text-primary transition-colors">
                            {classroom.name}
                        </CardTitle>
                        <div className="flex items-center gap-2">
                            <Badge variant="outline" className="bg-primary/5">
                                <School className="w-3 h-3 mr-1" />
                                Classe
                            </Badge>
                        </div>
                    </div>
                    <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center group-hover:bg-primary group-hover:text-primary-foreground transition-all duration-300">
                        <Users className="w-6 h-6" />
                    </div>
                </div>
            </CardHeader>
            <CardContent>
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-6">
                    <div className="flex -space-x-2 mr-2">
                        {[1, 2, 3].map(i => (
                            <div key={i} className="w-6 h-6 rounded-full border-2 border-background bg-muted flex items-center justify-center text-[10px] font-bold">
                                {i}
                            </div>
                        ))}
                    </div>
                    <span className="font-medium text-foreground">{studentCount}</span>
                    <span>{studentsLabel} inscrits</span>
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <Link to={getTenantUrl(`/teacher/grades?classroom=${classroom.id}`)}>
                        <Button variant="outline" size="sm" className="w-full hover:bg-primary/5 transition-colors">
                            <BarChart3 className="w-4 h-4 mr-1.5" />
                            Notes
                        </Button>
                    </Link>
                    <Link to={getTenantUrl(`/teacher/attendance?classroom=${classroom.id}`)}>
                        <Button variant="outline" size="sm" className="w-full hover:bg-primary/5 transition-colors">
                            <ClipboardCheck className="w-4 h-4 mr-1.5" />
                            Présences
                        </Button>
                    </Link>
                </div>
            </CardContent>
        </Card>
    );
};
