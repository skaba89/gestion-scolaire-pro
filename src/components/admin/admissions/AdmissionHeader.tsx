import { useTranslation } from "react-i18next";

export const AdmissionHeader = () => {
    const { t } = useTranslation();
    return (
        <div>
            <h1 className="text-2xl font-display font-bold text-foreground">{t("admissions.header.title")}</h1>
            <p className="text-muted-foreground">{t("admissions.header.subtitle")}</p>
        </div>
    );
};
