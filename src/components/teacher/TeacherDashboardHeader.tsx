import { format } from "date-fns";
import { fr } from "date-fns/locale";

interface TeacherDashboardHeaderProps {
    teacherName: string;
}

export const TeacherDashboardHeader = ({ teacherName }: TeacherDashboardHeaderProps) => {
    return (
        <div className="bg-gradient-hero rounded-2xl p-6 text-primary-foreground">
            <h1 className="text-2xl font-display font-bold mb-2">
                Bienvenue, {teacherName || "Professeur"} !
            </h1>
            <p className="text-primary-foreground/80">
                {format(new Date(), "EEEE d MMMM yyyy", { locale: fr })}
            </p>
        </div>
    );
};
