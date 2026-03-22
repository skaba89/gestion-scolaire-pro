import { Plus, CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";

interface AcademicYearHeaderProps {
    onAddClick: () => void;
    manageTermsUrl: string;
}

export const AcademicYearHeader = ({
    onAddClick,
    manageTermsUrl,
}: AcademicYearHeaderProps) => {
    return (
        <div className="flex items-center justify-between">
            <div>
                <h1 className="text-2xl font-display font-bold text-foreground">Années Scolaires</h1>
                <p className="text-muted-foreground">Gérez les années scolaires de votre établissement</p>
            </div>
            <div className="flex gap-2">
                <Link to={manageTermsUrl}>
                    <Button variant="outline">
                        <CalendarDays className="w-4 h-4 mr-2" />
                        Gérer les trimestres
                    </Button>
                </Link>
                <Button onClick={onAddClick}>
                    <Plus className="w-4 h-4 mr-2" />
                    Nouvelle année
                </Button>
            </div>
        </div>
    );
};
