import { format } from "date-fns";
import { dateFnsLocale } from "@/lib/locale";
import { useTranslation } from "react-i18next";

interface TeacherDashboardHeaderProps {
    teacherName: string;
}

export const TeacherDashboardHeader = ({ teacherName }: TeacherDashboardHeaderProps) => {
    const { t } = useTranslation();
    return (
        <div className="bg-gradient-hero rounded-2xl p-6 text-primary-foreground">
            <h1 className="text-2xl font-display font-bold mb-2">
                {t("teacherPortal.header.welcome", { name: teacherName || t("teacherPortal.header.teacher") })}
            </h1>
            <p className="text-primary-foreground/80">
                {format(new Date(), "EEEE d MMMM yyyy", { locale: dateFnsLocale() })}
            </p>
        </div>
    );
};
