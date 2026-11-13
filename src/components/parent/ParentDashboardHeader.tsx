import { format } from "date-fns";
import { dateFnsLocale } from "@/lib/locale";
import { useTranslation } from "react-i18next";

interface ParentDashboardHeaderProps {
    name: string;
    childCount: number;
}

export const ParentDashboardHeader = ({ name, childCount }: ParentDashboardHeaderProps) => {
    const { t } = useTranslation();
    return (
        <div className="bg-gradient-hero rounded-2xl p-6 text-primary-foreground">
            <h1 className="text-2xl font-display font-bold mb-2">
                {t("parentPortal.header.welcome", { name: name || t("parentPortal.header.parent") })}
            </h1>
            <p className="text-primary-foreground/80">
                {format(new Date(), "EEEE d MMMM yyyy", { locale: dateFnsLocale() })}
            </p>
            {childCount > 0 && (
                <p className="text-primary-foreground/60 text-sm mt-3 bg-white/10 w-fit px-3 py-1 rounded-full border border-white/10">
                    {t("parentPortal.header.enrolledChildren", { count: childCount })}
                </p>
            )}
        </div>
    );
};
