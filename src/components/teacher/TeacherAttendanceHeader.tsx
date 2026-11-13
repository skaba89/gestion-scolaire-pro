import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";
import { useTranslation } from "react-i18next";

interface TeacherAttendanceHeaderProps {
    studentsLabel: string;
    showMarkAll: boolean;
    onMarkAllPresent: () => void;
}

export const TeacherAttendanceHeader = ({
    studentsLabel,
    showMarkAll,
    onMarkAllPresent
}: TeacherAttendanceHeaderProps) => {
    const { t } = useTranslation();
    return (
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
                <h1 className="text-2xl font-display font-bold text-foreground">{t("teacherPortal.attendance.title")}</h1>
                <p className="text-muted-foreground">{t("teacherPortal.attendance.subtitle", { label: studentsLabel })}</p>
            </div>
            {showMarkAll && (
                <Button variant="outline" onClick={onMarkAllPresent} className="shrink-0">
                    <Check className="w-4 h-4 mr-2" />
                    {t("teacherPortal.attendance.allPresentBtn")}
                </Button>
            )}
        </div>
    );
};
