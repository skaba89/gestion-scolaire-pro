/**
 * Régression : une erreur 422 faisait planter TOUTE l'application.
 *
 * FastAPI renvoie `detail` sous forme de tableau d'objets Pydantic sur une
 * erreur de validation. ~140 endroits font `toast(err.response?.data?.detail)`;
 * passer cet objet à React lève « Objects are not valid as a React child »
 * (erreur #31) → écran « Une erreur est survenue ». `normalizeApiDetail`
 * garantit qu'on ne renvoie JAMAIS autre chose qu'une chaîne (ou undefined).
 */
import { describe, expect, it } from "vitest";

import { normalizeApiDetail } from "@/api/client";

describe("normalizeApiDetail", () => {
  it("laisse passer une chaîne (HTTPException FastAPI)", () => {
    expect(normalizeApiDetail("Établissement non trouvé")).toBe("Établissement non trouvé");
  });

  it("réduit un tableau d'erreurs 422 Pydantic en message lisible avec le champ", () => {
    const detail = [
      {
        type: "uuid_parsing",
        loc: ["body", "academic_year_id"],
        msg: "Input should be a valid UUID",
        input: "",
        ctx: { error: "invalid length" },
      },
    ];
    const result = normalizeApiDetail(detail);
    expect(typeof result).toBe("string");
    expect(result).toContain("academic_year_id");
    expect(result).toContain("Input should be a valid UUID");
  });

  it("joint plusieurs erreurs de validation", () => {
    const detail = [
      { loc: ["body", "email"], msg: "value is not a valid email address" },
      { loc: ["body", "name"], msg: "Field required" },
    ];
    const result = normalizeApiDetail(detail);
    expect(result).toContain("email");
    expect(result).toContain("name");
    expect(result).toContain("—");
  });

  it("gère un objet d'erreur unique sans planter", () => {
    const result = normalizeApiDetail({ loc: ["body", "amount"], msg: "must be positive" });
    expect(result).toBe("amount : must be positive");
  });

  it("ne renvoie jamais un objet brut (sinon React #31)", () => {
    const weird = { unexpected: { nested: true } };
    const result = normalizeApiDetail(weird);
    expect(typeof result).toBe("string");
  });

  it("renvoie undefined si detail est absent, laissant le fallback s'appliquer", () => {
    expect(normalizeApiDetail(undefined)).toBeUndefined();
    expect(normalizeApiDetail(null)).toBeUndefined();
  });
});
