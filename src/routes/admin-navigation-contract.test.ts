import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("admin navigation integrity", () => {
    it("never exposes a sidebar link without a matching admin route", () => {
        const nav = source("src/components/layouts/AdminLayout.tsx");
        const routes = source("src/routes/AdminRoutes.tsx");
        const registered = new Set(
            [...routes.matchAll(/<Route\s+path="([^"]+)"/g)].map(match => match[1]),
        );
        const menuDestinations = new Set(
            [...nav.matchAll(/getTenantUrl\("\/admin\/([^"]+)"\)/g)].map(match => match[1]),
        );
        expect(menuDestinations.size).toBeGreaterThan(40);
        const missing = [...menuDestinations].filter(dest => !registered.has(dest));
        expect(missing).toEqual([]);
    });

    it("keeps the sensitive early warning page registered and linked for management", () => {
        const nav = source("src/components/layouts/AdminLayout.tsx");
        const routes = source("src/routes/AdminRoutes.tsx");
        expect(routes).toContain('const EarlyWarnings = lazy(() => import("@/pages/admin/EarlyWarnings"))');
        expect(routes).toContain('<Route path="early-warnings" element={<EarlyWarnings />} />');
        expect(nav).toContain('getTenantUrl("/admin/early-warnings")');
        expect(nav).toContain('["TENANT_ADMIN", "DIRECTOR", "SUPER_ADMIN"]');
    });
});
