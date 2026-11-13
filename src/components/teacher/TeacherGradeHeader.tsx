import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";

interface TeacherGradeHeaderProps {
    onNewAssessmentClick: () => void;
}

export const TeacherGradeHeader = ({ onNewAssessmentClick }: TeacherGradeHeaderProps) => {
    const { t } = useTranslation();
    return (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
                <h1 className="text-2xl font-display font-bold text-foreground">{t("teacherPortal.gradeHeader.title")}</h1>
                <p className="text-muted-foreground">{t("teacherPortal.gradeHeader.subtitle")}</p>
            </div>
            <Button
                onClick={onNewAssessmentClick}
                className="shrink-0 bg-primary hover:bg-primary/90 transition-all shadow-md"
            >
                <Plus className="w-4 h-4 mr-2" />
                {t("teacherPortal.gradeHeader.new")}
            </Button>
        </div>
    );
};
