import { QrCode } from "lucide-react";
import { useTranslation } from "react-i18next";

export const SessionAttendanceHeader = () => {
    const { t } = useTranslation();
    return (
        <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
                <QrCode className="h-8 w-8" />
                {t("teacherPortal.qr.title")}
            </h1>
            <p className="text-muted-foreground">
                {t("teacherPortal.qr.subtitle")}
            </p>
        </div>
    );
};
