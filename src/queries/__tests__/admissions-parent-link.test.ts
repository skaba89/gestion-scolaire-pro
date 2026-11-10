/** A3 : le message après conversion dit ce qui a été fait pour le parent. */
import { describe, it, expect, beforeAll } from "vitest";
import i18n from "@/i18n/config";
import { parentLinkMessage } from "@/queries/admissions";

describe("parentLinkMessage (A3)", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("fr");
  });

  it("explains a linked existing parent", () => {
    expect(parentLinkMessage({ status: "linked" })).toContain("rattaché");
  });

  it("points to Pending users for a newly created account", () => {
    expect(parentLinkMessage({ status: "created" })).toContain("Utilisateurs en attente");
  });

  it.each(["not_permitted", "no_email", "invalid_email", "email_in_use"] as const)(
    "gives a translated reason when skipped (%s)",
    (reason) => {
      const message = parentLinkMessage({ status: "skipped", reason });
      expect(message).toMatch(/^Le parent n'a pas été rattaché/);
      expect(message).not.toContain("admissions.parentLink");
    },
  );

  it("says nothing for a re-enrollment or an older API", () => {
    expect(parentLinkMessage(undefined)).toBeNull();
  });
});
