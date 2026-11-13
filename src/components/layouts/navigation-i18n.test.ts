import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Audit des langues (2026-11-13) : en anglais ou en arabe, les menus des
 * portails restaient en français (libellés écrits en dur). Cette garde
 * refuse tout libellé de menu en dur dans les layouts et toute clé de
 * traduction absente d'une des 5 langues.
 */

const root = process.cwd();
const read = (p: string) => readFileSync(resolve(root, p), "utf8");
const LOCALES = ["fr", "en", "es", "ar", "zh"] as const;
const locales = Object.fromEntries(
    LOCALES.map((l) => [l, JSON.parse(read(`src/i18n/locales/${l}.json`))]),
) as Record<(typeof LOCALES)[number], Record<string, unknown>>;

const FILES = [
    ...readdirSync(resolve(root, "src/components/layouts"))
        .filter((f) => f.endsWith("Layout.tsx"))
        .map((f) => `src/components/layouts/${f}`),
    "src/components/ThemeSwitcher.tsx",
    "src/components/LanguageSwitcher.tsx",
];

/** Noms propres affichés tels quels (marque, intitulé du rôle plateforme). */
const BRAND = new Set(["Academy Guinéenne", "SUPER ADMIN", "Super Admin"]);

const lookup = (tree: Record<string, unknown>, key: string): unknown =>
    key.split(".").reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], tree);

describe("portal navigation is translated", () => {
    it.each(FILES)("%s has no hard-coded menu label", (file) => {
        const source = read(file);
        const hardCoded = [
            ...source.matchAll(/\blabel:\s*"([^"]+)"/g),
            ...source.matchAll(/\blabel:\s*[\w.]+\s*\?\s*"([^"]+)"/g),
            ...source.matchAll(/\bportalName="([^"]+)"/g),
            ...source.matchAll(/<span[^>]*>([A-Za-zÀ-ÿ][^<{]*)<\/span>/g),
        ].map((m) => m[1]).filter((text) => !BRAND.has(text));
        expect(hardCoded).toEqual([]);
    });

    it.each(FILES)("%s uses only keys present in the 5 languages", (file) => {
        const keys = [...read(file).matchAll(/\bt\("([a-zA-Z]+\.[a-zA-Z.]+)"/g), ...read(file).matchAll(/labelKey: "([a-zA-Z.]+)"/g)]
            .map((m) => m[1]);
        const missing = keys.flatMap((key) =>
            LOCALES.filter((l) => typeof lookup(locales[l], key) !== "string").map((l) => `${l}:${key}`),
        );
        expect(missing).toEqual([]);
    });

    it("has the school and higher-education vocabulary in the 5 languages", () => {
        const fr = locales.fr.terminology as Record<string, Record<string, string>>;
        for (const l of LOCALES) {
            const tr = locales[l].terminology as Record<string, Record<string, string>>;
            for (const variant of ["school", "higherEd"]) {
                expect(Object.keys(tr[variant]).sort(), `${l}.${variant}`).toEqual(Object.keys(fr[variant]).sort());
            }
        }
    });
});
