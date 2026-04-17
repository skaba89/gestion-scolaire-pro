import { useEffect } from "react";
import { useTenant } from "@/contexts/TenantContext";
import { useSettings } from "@/hooks/useSettings";

const DEFAULT_TITLE = "EduManager - Plateforme de Gestion Scolaire";
const DEFAULT_FAVICON = "/favicon.ico";

/**
 * Dynamically sets the page <title> and favicon based on the current tenant.
 * - Title: "{tenant.name} — {tenant.slug}" or default if no tenant
 * - Favicon: tenant logo_url (from settings) or default /favicon.ico
 */
export function TenantHead() {
  const { tenant } = useTenant();
  const { settings } = useSettings();

  // Update page title
  useEffect(() => {
    if (tenant?.name) {
      const slug = tenant.slug ? ` — ${tenant.slug}` : "";
      document.title = `${tenant.name}${slug}`;
    } else {
      document.title = DEFAULT_TITLE;
    }
    return () => {
      document.title = DEFAULT_TITLE;
    };
  }, [tenant?.name, tenant?.slug]);

  // Update favicon
  useEffect(() => {
    const faviconUrl = settings?.favicon_url || settings?.logo_url || tenant?.logo_url;
    if (!faviconUrl) return;

    // Update existing favicon link elements
    const existingLinks = document.querySelectorAll<HTMLLinkElement>(
      'link[rel="icon"], link[rel="apple-touch-icon"]'
    );

    if (existingLinks.length > 0) {
      existingLinks.forEach((link) => {
        link.href = faviconUrl;
      });
    } else {
      // Create a new favicon link if none exists
      const link = document.createElement("link");
      link.rel = "icon";
      link.href = faviconUrl;
      document.head.appendChild(link);
    }

    return () => {
      // Restore default favicon on cleanup
      const links = document.querySelectorAll<HTMLLinkElement>('link[rel="icon"]');
      links.forEach((link) => {
        link.href = DEFAULT_FAVICON;
      });
    };
  }, [settings?.favicon_url, settings?.logo_url, tenant?.logo_url]);

  return null;
}
