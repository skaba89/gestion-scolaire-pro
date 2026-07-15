/** Tests de la whitelist de persistance offline (Phase 6, read-only MVP). */
import { describe, expect, it } from "vitest";

import {
  OFFLINE_CACHE_KEY,
  clearOfflineCache,
  shouldPersistQuery,
} from "@/lib/offline-persistence";

describe("shouldPersistQuery — liste blanche", () => {
  it.each([
    ["students"],
    ["teachers"],
    ["teacher-schedule"],
    ["classroom-students-attendance"],
    ["attendance-records"],
    ["academic-years"],
    ["homework"],
    ["parent-children"],
    ["public-tenant"],
  ])("autorise %s", (key) => {
    expect(shouldPersistQuery([key])).toBe(true);
  });

  it("autorise une clé whitelistée avec des paramètres", () => {
    expect(shouldPersistQuery(["students", { page: 1 }, "tenant-x"])).toBe(true);
  });
});

describe("shouldPersistQuery — données sensibles exclues", () => {
  it.each([
    ["grades"],
    ["teacher-assessments"],       // hors liste blanche
    ["assessment-grades"],
    ["parent-unpaid-invoices"],
    ["billing-subscription"],
    ["payments"],
    ["messages"],
    ["conversations"],
    ["mfa-status"],
    ["audit-logs"],
    ["cash-flow-forecasts"],
    ["students-at-risk"],          // IA — motif "risk" exclu
    ["notifications"],             // contenu potentiellement sensible
    ["saas-metrics"],
  ])("refuse %s", (key) => {
    expect(shouldPersistQuery([key])).toBe(false);
  });

  it("refuse une clé whitelistée qui muterait vers un motif sensible", () => {
    // Filet de sécurité : même préfixe autorisé + motif sensible → refus.
    expect(shouldPersistQuery(["students-grades"])).toBe(false);
  });

  it("refuse les clés non textuelles", () => {
    expect(shouldPersistQuery([{ scope: "students" }])).toBe(false);
    expect(shouldPersistQuery([42])).toBe(false);
    expect(shouldPersistQuery([])).toBe(false);
  });
});

describe("clearOfflineCache", () => {
  it("supprime l'entrée localStorage du cache offline", () => {
    window.localStorage.setItem(OFFLINE_CACHE_KEY, '{"clientState":{}}');
    clearOfflineCache();
    // Le mock localStorage du setup Vitest renvoie undefined (navigateur : null).
    expect(window.localStorage.getItem(OFFLINE_CACHE_KEY) ?? null).toBeNull();
  });
});
