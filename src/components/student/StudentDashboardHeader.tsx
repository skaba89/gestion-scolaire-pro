import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

interface StudentDashboardHeaderProps {
    name: string;
    className?: string;
    studentLabel: string;
}

export const StudentDashboardHeader = ({ name, className, studentLabel }: StudentDashboardHeaderProps) => {
    return (
        <div className="bg-gradient-hero rounded-2xl p-6 text-primary-foreground">
            <h1 className="text-2xl font-display font-bold mb-2">
                Bienvenue, {name || studentLabel} !
            </h1>
            <p className="text-primary-foreground/80">
                {format(new Date(), "EEEE d MMMM yyyy", { locale: fr })}
            </p>
            {className && (
                <div className="mt-3 flex flex-wrap gap-2">
                    <Badge variant="secondary" className="bg-white/20 text-white border-white/20">
                        {className}
                    </Badge>
                </div>
            )}
        </div>
    );
};
