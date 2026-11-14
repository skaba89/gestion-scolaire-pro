import { CheckCircle2, Circle, XCircle, Clock } from "lucide-react";
import { format } from "date-fns";
import { AdmissionStep } from "@/queries/admissions";
import { cn } from "@/lib/utils";
import { dateFnsLocale } from "@/lib/locale";
import { useTranslation } from "react-i18next";

/**
 * Frise verticale de l'évolution d'une candidature — signalé par un
 * utilisateur : le candidat doit pouvoir suivre l'évolution de son
 * dossier étape par étape (pas juste le statut courant), et l'admin doit
 * avoir la même vue d'ensemble du traitement. Composant partagé entre
 * src/pages/public/ApplicationStatus.tsx (candidat) et
 * AdmissionDetailDialog.tsx (admin) — reçoit `steps` déjà calculées côté
 * serveur (voir _build_admission_steps dans admissions.py), jamais de
 * logique d'état dupliquée côté client.
 */
interface AdmissionTimelineProps {
    steps: AdmissionStep[];
    /** Compact = pas de description, pour un usage dans une carte
     * résultat de recherche publique où l'espace est limité. */
    compact?: boolean;
}

function StepIcon({ state }: { state: AdmissionStep["state"] }) {
    switch (state) {
        case "done":
            return <CheckCircle2 className="w-5 h-5 text-emerald-600" />;
        case "current":
            return <Clock className="w-5 h-5 text-blue-600" />;
        case "rejected":
            return <XCircle className="w-5 h-5 text-destructive" />;
        default:
            return <Circle className="w-5 h-5 text-muted-foreground/40" />;
    }
}

export function AdmissionTimeline({ steps, compact = false }: AdmissionTimelineProps) {
    const { t } = useTranslation();
    if (steps.length === 0) return null;

    return (
        <ol className="space-y-0">
            {steps.map((step, idx) => {
                const isLast = idx === steps.length - 1;
                const isFilled = step.state === "done" || step.state === "rejected";
                return (
                    <li key={step.key} className="flex gap-3">
                        <div className="flex flex-col items-center">
                            <StepIcon state={step.state} />
                            {!isLast && (
                                <div
                                    className={cn(
                                        "w-px flex-1 min-h-[1.25rem] my-0.5",
                                        isFilled ? "bg-emerald-600/40" : "bg-muted-foreground/20",
                                    )}
                                />
                            )}
                        </div>
                        <div className={cn("pb-4", isLast && "pb-0")}>
                            <p
                                className={cn(
                                    "text-sm font-medium",
                                    step.state === "pending" && "text-muted-foreground",
                                    step.state === "rejected" && "text-destructive",
                                )}
                            >
                                {t(`admissions.timeline.${step.key}`, { defaultValue: step.label })}
                            </p>
                            {!compact && (
                                <p className="text-xs text-muted-foreground">
                                    {step.date
                                        ? format(new Date(step.date), "PPp", { locale: dateFnsLocale() })
                                        : step.state === "current"
                                            ? t("admissions.timeline.current")
                                            : t("admissions.timeline.pending")}
                                </p>
                            )}
                        </div>
                    </li>
                );
            })}
        </ol>
    );
}
