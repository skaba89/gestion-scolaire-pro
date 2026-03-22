import { useTranslation } from "react-i18next";

export const SettingsHeader = () => {
    const { t } = useTranslation();

    return (
        <div>
            <h1 className="text-2xl font-display font-bold text-foreground">
                {t('settings.title')}
            </h1>
            <p className="text-muted-foreground">
                {t('settings.description')}
            </p>
        </div>
    );
};
