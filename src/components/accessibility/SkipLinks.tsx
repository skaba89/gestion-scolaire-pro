import { useTranslation } from "react-i18next";

export const SkipLinks = () => {
  const { t } = useTranslation();

  return (
    <div className="skip-links">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[9999] focus:bg-primary focus:text-primary-foreground focus:px-4 focus:py-2 focus:rounded-md focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
      >
        {t("accessibility.skipToContent", "Aller au contenu principal")}
      </a>
      <a
        href="#main-navigation"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-48 focus:z-[9999] focus:bg-primary focus:text-primary-foreground focus:px-4 focus:py-2 focus:rounded-md focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
      >
        {t("accessibility.skipToNav", "Aller à la navigation")}
      </a>
    </div>
  );
};
