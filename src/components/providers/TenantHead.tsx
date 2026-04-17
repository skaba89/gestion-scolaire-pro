import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useTenant } from "@/contexts/TenantContext";
import { useSettings } from "@/hooks/useSettings";

const PLATFORM_TITLE = "Academy Guinée";
const DEFAULT_FAVICON = "/favicon.ico";

/**
 * Dynamically sets the page <title> and favicon based on context:
 * - Landing / no tenant: "Academy Guinée"
 * - Inside a tenant (/:slug/*): the tenant slug (e.g. "uls")
 * - Favicon: tenant logo from settings, or default /favicon.ico
 */
export function TenantHead() {
  const { tenant } = useTenant();
  const { settings } = useSettings();
  const location = useLocation();

  // Update page title
  useEffect(() => {
    if (tenant?.slug) {
      // Inside a tenant context — show the slug as tab title
      document.title = tenant.slug;
    } else {
      // Landing page or no tenant — show platform name
      document.title = PLATFORM_TITLE;
    }
    return () => {
      document.title = PLATFORM_TITLE;
    };
  }, [tenant?.slug, location.pathname]);

  // Update favicon with tenant logo
  useEffect(() => {
    const faviconUrl = settings?.favicon_url || settings?.logo_url || tenant?.logo_url;

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

    if (faviconUrl) {
      updateFavicons(faviconUrl);
    } else {
      updateFavicons(DEFAULT_FAVICON);
    }

    return () => {
      updateFavicons(DEFAULT_FAVICON);
    };
  }, [settings?.favicon_url, settings?.logo_url, tenant?.logo_url]);

  return null;
}
