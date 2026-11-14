import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/contexts/TenantContext", () => ({
  useTenant: () => ({ tenant: { name: "École témoin", type: "mixed", slug: "temoin", email: "" } }),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? ({
      "educationModules.title": "Modules pédagogiques",
      "educationCycles.title": "Cycles pédagogiques",
    } as Record<string, string>)[key] ?? key,
  }),
}));

vi.mock("@/components/settings/EducationModuleSettings", () => ({ EducationModuleSettings: () => null }));
vi.mock("@/components/settings/EducationCycleSettings", () => ({ EducationCycleSettings: () => null }));
vi.mock("@/components/settings/EstablishmentSettings", () => ({ default: () => null }));
vi.mock("@/components/settings/NotificationSettings", () => ({ default: () => null }));
vi.mock("@/components/settings/GradingSettings", () => ({ default: () => null }));
vi.mock("@/components/settings/AttendanceSettings", () => ({ default: () => null }));
vi.mock("@/components/settings/FinanceSettings", () => ({ default: () => null }));
vi.mock("@/components/settings/RoleManagement", () => ({ default: () => null }));
vi.mock("@/components/settings/ScheduleSettings", () => ({ default: () => null }));
vi.mock("@/components/settings/MatriculeSettings", () => ({ default: () => null }));
vi.mock("@/components/settings/PushNotificationSettings", () => ({ PushNotificationSettings: () => null }));
vi.mock("@/components/settings/SignatureSettings", () => ({ default: () => null }));
vi.mock("@/components/accessibility/AccessibilitySettings", () => ({ AccessibilitySettings: () => null }));
vi.mock("@/components/settings/SaaSSettings", () => ({ default: () => null }));
vi.mock("@/components/settings/BrandingSettings", () => ({ BrandingSettings: () => null }));
vi.mock("@/components/settings/SystemSettings", () => ({ SystemSettings: () => null }));
vi.mock("@/components/settings/LanguageSwitcher", () => ({ LanguageSwitcher: () => null }));
vi.mock("@/components/settings/MenuSettings", () => ({ MenuSettings: () => null }));
vi.mock("@/components/settings/SecuritySettings", () => ({ SecuritySettings: () => null }));
vi.mock("@/components/settings/PrivacySettings", () => ({ PrivacySettings: () => null }));
vi.mock("@/components/settings/SettingsHeader", () => ({ SettingsHeader: () => null }));
vi.mock("../Users", () => ({ default: () => null }));

import Settings from "../Settings";

describe("paramètres sur petit écran", () => {
  it("conserve un nom accessible quand le libellé visuel d'un onglet est masqué", () => {
    render(<Settings />);

    expect(screen.getByRole("tab", { name: "Cycles pédagogiques" })).toHaveAttribute(
      "aria-label",
      "Cycles pédagogiques",
    );
  });
});
