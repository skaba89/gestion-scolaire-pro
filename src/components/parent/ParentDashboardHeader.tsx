import { format } from "date-fns";
import { fr } from "date-fns/locale";

interface ParentDashboardHeaderProps {
    name: string;
    childCount: number;
}

export const ParentDashboardHeader = ({ name, childCount }: ParentDashboardHeaderProps) => {
    return (
        <div className="bg-gradient-hero rounded-2xl p-6 text-primary-foreground">
            <h1 className="text-2xl font-display font-bold mb-2">
                Bienvenue, {name || "Parent"} !
            </h1>
            <p className="text-primary-foreground/80">
                {format(new Date(), "EEEE d MMMM yyyy", { locale: fr })}
            </p>
            {childCount > 0 && (
                <p className="text-primary-foreground/60 text-sm mt-3 bg-white/10 w-fit px-3 py-1 rounded-full border border-white/10">
                    {childCount} enfant{childCount > 1 ? "s" : ""} inscrit{childCount > 1 ? "s" : ""}
                </p>
            )}
        </div>
    );
};
