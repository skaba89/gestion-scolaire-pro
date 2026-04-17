import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useTenant } from "@/contexts/TenantContext";
import { useSettings } from "@/hooks/useSettings";
import { resolveUploadUrl } from "@/utils/url";

const PLATFORM_TITLE = "Academy Guinée";
const DEFAULT_FAVICON = "/favicon.ico";

/**
 * Dynamically sets the page <title> and favicon based on context:
 * - Landing / no tenant: "Academy Guinée" + default favicon
 * - Inside a tenant (/:slug/*): slug as title + tenant logo as favicon
 */
export function TenantHead() {
  const { tenant } = useTenant();
  const { settings } = useSettings();
  const location = useLocation();

  // Update page title
  useEffect(() => {
    if (tenant?.slug) {
      document.title = tenant.slug;
    } else {
      document.title = PLATFORM_TITLE;
    }
    return () => {
      document.title = PLATFORM_TITLE;
    };
  }, [tenant?.slug, location.pathname]);

  // Update favicon with tenant logo
  useEffect(() => {
    const rawUrl = settings?.favicon_url || settings?.logo_url || tenant?.logo_url;
    const faviconUrl = rawUrl ? resolveUploadUrl(rawUrl) : DEFAULT_FAVICON;

    const updateFavicons = (url: string) => {
      const existingLinks = document.querySelectorAll<HTMLLinkElement>(
        'link[rel="icon"], link[rel="apple-touch-icon"]'
      );
      if (existingLinks.length > 0) {
        existingLinks.forEach((link) => {
          link.href = url;
        });
      } else {
        const link = document.createElement("link");
        link.rel = "icon";
        link.href = url;
        document.head.appendChild(link);
      }
    };

    updateFavicons(faviconUrl);

    return () => {
      updateFavicons(DEFAULT_FAVICON);
    };
  }, [settings?.favicon_url, settings?.logo_url, tenant?.logo_url]);

  return null;
}
