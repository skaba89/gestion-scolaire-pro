/**
 * PUBLIC-DOMAIN-01 : l'identifiant de l'URL fait foi. Sur un hôte de plateforme absent de la liste
 * connue (academy-guineenne.org en production), « /ecole/<slug> » cherchait l'école par domaine
 * et affichait « Établissement introuvable ».
 */
import { describe, expect, it } from "vitest";
import { customDomainFor } from "@/lib/customDomain";

describe("customDomainFor", () => {
  it("un identifiant dans l'URL l'emporte toujours, quel que soit l'hôte", () => {
    expect(customDomainFor("academy-guineenne.org", "uls")).toBeUndefined();
    expect(customDomainFor("www.ecole-a.gn", "ecole-a")).toBeUndefined();
  });

  it("sans identifiant, un hôte inconnu est un domaine personnalisé", () => {
    expect(customDomainFor("www.ecole-a.gn")).toBe("www.ecole-a.gn");
    expect(customDomainFor("WWW.Ecole-A.gn")).toBe("www.ecole-a.gn");
  });

  it("sans identifiant, les hôtes de la plateforme et des hébergeurs ne sont jamais des domaines d'école", () => {
    for (const host of ["localhost", "127.0.0.1", "schoolflow.pro", "app.schoolflow.pro",
      "gestion-scolaire-pro-9on3.onrender.com", "preview.netlify.app", "x.vercel.app", "staging-schoolflow.example"]) {
      expect(customDomainFor(host), host).toBeUndefined();
    }
    expect(customDomainFor("")).toBeUndefined();
  });
});
