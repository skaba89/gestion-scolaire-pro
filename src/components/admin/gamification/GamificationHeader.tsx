import { Trophy } from "lucide-react";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";

export const GamificationHeader = () => {
    const { t } = useTranslation();
    return (
        <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center justify-between p-6 rounded-3xl bg-gradient-to-r from-primary/10 via-background to-background border border-primary/10 mb-6 relative overflow-hidden"
        >
            <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl -mr-32 -mt-32" />

            <div className="relative z-10">
                <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3 bg-clip-text text-transparent bg-gradient-to-r from-primary to-primary/60">
                    <Trophy className="h-8 w-8 text-yellow-500 drop-shadow-sm" />
                    {t("gamification.title", "Gamification")}
                </h1>
                <p className="text-muted-foreground mt-1 max-w-lg">
                    {t("gamification.description", "Gérez les points, badges et classements des étudiants avec un système de récompenses dynamique.")}
                </p>
            </div>
        </motion.div>
    );
};
