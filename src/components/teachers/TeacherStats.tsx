import { GraduationCap, Users, BookOpen } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useTranslation } from "react-i18next";

interface TeacherStatsProps {
    totalTeachers: number;
    activeTeachers: number;
    totalSubjects: number;
}

export const TeacherStats = ({
    totalTeachers,
    activeTeachers,
    totalSubjects,
}: TeacherStatsProps) => {
    const { t } = useTranslation();
    return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
                <CardContent className="pt-6">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-primary/10 rounded-lg">
                            <GraduationCap className="w-6 h-6 text-primary" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold">{totalTeachers}</p>
                            <p className="text-sm text-muted-foreground">{t("teachingAdmin.professeurs")}</p>
                        </div>
                    </div>
                </CardContent>
            </Card>
            <Card>
                <CardContent className="pt-6">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-green-500/10 rounded-lg">
                            <Users className="w-6 h-6 text-green-500" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold">{activeTeachers}</p>
                            <p className="text-sm text-muted-foreground">{t("teachingAdmin.actifs")}</p>
                        </div>
                    </div>
                </CardContent>
            </Card>
            <Card>
                <CardContent className="pt-6">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-blue-500/10 rounded-lg">
                            <BookOpen className="w-6 h-6 text-blue-500" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold">{totalSubjects}</p>
                            <p className="text-sm text-muted-foreground">{t("teachingAdmin.matieres")}</p>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
};
