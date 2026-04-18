import { useEffect, useMemo } from "react";
import { useLocation } from "react-router-dom";
import { useTenant } from "@/contexts/TenantContext";
import { useSettings } from "@/hooks/useSettings";
import { resolveUploadUrl } from "@/utils/url";

const PLATFORM_TITLE = "Academy Guinée";
const DEFAULT_FAVICON = "/favicon.ico";

/** Routes that are NOT tenant-scoped (platform-level pages) */
const PLATFORM_PREFIXES = ["/super-admin", "/auth", "/"];

/**
 * Dynamically sets the page <title> and favicon based on context:
 * - Platform pages (/super-admin, /, /auth): "Academy Guinée" + default favicon
 * - Inside a tenant (/:slug/admin, /:slug/teacher, etc.): slug as title + tenant logo
 */
export function TenantHead() {
  const { tenant } = useTenant();
  const { settings } = useSettings();
  const location = useLocation();

  // Determine if we are inside a tenant-scoped route based on the URL path
  const isInTenantRoute = useMemo(() => {
    const path = location.pathname;
    // Platform-level routes are NOT tenant-scoped
    if (path === "/" || path === "") return false;
    if (path.startsWith("/super-admin")) return false;
    if (path === "/auth" || path === "/login") return false;
    // Tenant routes follow the pattern /:slug/something
    // A slug segment followed by /admin, /teacher, /student, /parent, /auth, etc.
    const segments = path.split("/").filter(Boolean);
    return segments.length >= 2;
  }, [location.pathname]);

  // Update page title
  useEffect(() => {
    if (isInTenantRoute && tenant?.slug) {
      document.title = tenant.slug;
    } else {
      document.title = PLATFORM_TITLE;
    }
    return () => {
      document.title = PLATFORM_TITLE;
    };
  }, [tenant?.slug, isInTenantRoute]);

  // Update favicon with tenant logo (only on tenant routes)
  useEffect(() => {
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

    if (isInTenantRoute) {
      const rawUrl = settings?.favicon_url || settings?.logo_url || tenant?.logo_url;
      const faviconUrl = rawUrl ? resolveUploadUrl(rawUrl) : DEFAULT_FAVICON;
      updateFavicons(faviconUrl);
    } else {
      updateFavicons(DEFAULT_FAVICON);
    }

    return () => {
      updateFavicons(DEFAULT_FAVICON);
    };
  }, [settings?.favicon_url, settings?.logo_url, tenant?.logo_url, isInTenantRoute]);

  return null;
}
