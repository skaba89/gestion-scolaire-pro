import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import { AIChatWidget } from "@/components/ai/AIChatWidget";
import { ChatBot } from "@/components/chat/ChatBot";

const mockHasRole = vi.fn();
const mockChatWithAI = vi.fn();
const mockToastError = vi.fn();

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "fr" } }),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ profile: { id: "u1", first_name: "Fanta", last_name: "Diallo" }, hasRole: mockHasRole }),
}));

vi.mock("@/contexts/TenantContext", () => ({
  useTenant: () => ({ tenant: { id: "t1", name: "École Test", slug: "ecole-test" } }),
}));

vi.mock("@/hooks/useSettings", () => ({
  useSettings: () => ({ settings: {} }),
}));

vi.mock("@/queries/ai", () => ({
  chatWithAI: (...args: unknown[]) => mockChatWithAI(...args),
}));

vi.mock("sonner", () => ({
  toast: { error: (...args: unknown[]) => mockToastError(...args), success: vi.fn() },
}));

const plan402 = { response: { status: 402, data: { error: "PLAN_REQUIRED", message: "Plan requis" } } };

beforeEach(() => {
  vi.clearAllMocks();
  Element.prototype.scrollIntoView = vi.fn();
});

function renderAt(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe("AIChatWidget — 402 abonnement requis", () => {
  async function sendMessage() {
    fireEvent.click(screen.getByRole("button", { name: "aiChat.open" }));
    fireEvent.change(screen.getByLabelText("aiChat.inputLabel"), { target: { value: "Bonjour" } });
    fireEvent.click(screen.getByRole("button", { name: "aiChat.send" }));
    return screen.findByText(/planRequired\.aiAssistant/);
  }

  it("affiche le message d'abonnement, sans erreur ni toast", async () => {
    mockHasRole.mockReturnValue(false);
    mockChatWithAI.mockRejectedValue(plan402);
    renderAt(<AIChatWidget />);

    await sendMessage();
    expect(screen.queryByText(/PLAN_REQUIRED/)).toBeNull();
    expect(screen.queryByText(/aiChat\.(errorPrefix|retryError)/)).toBeNull();
    expect(mockToastError).not.toHaveBeenCalled();
    expect(screen.queryByRole("link", { name: "planRequired.viewPlans" })).toBeNull();
  });

  it("propose « Voir les offres » au TENANT_ADMIN, vers la facturation de l'établissement", async () => {
    mockHasRole.mockImplementation((role: string) => role === "TENANT_ADMIN");
    mockChatWithAI.mockRejectedValue(plan402);
    renderAt(<AIChatWidget />);

    await sendMessage();
    expect(screen.getByRole("link", { name: "planRequired.viewPlans" })).toHaveAttribute(
      "href",
      "/ecole-test/admin/billing",
    );
  });

  it("n'envoie pas la bulle d'abonnement dans l'historique suivant", async () => {
    mockHasRole.mockReturnValue(false);
    mockChatWithAI.mockRejectedValueOnce(plan402).mockResolvedValueOnce({ response: "ok" });
    renderAt(<AIChatWidget />);

    await sendMessage();
    fireEvent.change(screen.getByLabelText("aiChat.inputLabel"), { target: { value: "Encore" } });
    fireEvent.click(screen.getByRole("button", { name: "aiChat.send" }));
    await screen.findByText("ok");

    const history = mockChatWithAI.mock.calls[1][1] as { content: string }[];
    expect(history.every((m) => m.content !== "")).toBe(true);
  });
});

describe("ChatBot — 402 abonnement requis", () => {
  it("affiche le message d'abonnement au lieu de « PLAN_REQUIRED »", async () => {
    mockHasRole.mockReturnValue(false);
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: "PLAN_REQUIRED" }), { status: 402 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    renderAt(<ChatBot />);

    fireEvent.click(screen.getByRole("button", { name: "chatbot.open" }));
    fireEvent.change(screen.getByLabelText("chatbot.inputLabel"), { target: { value: "Bonjour" } });
    fireEvent.click(screen.getByRole("button", { name: "chatbot.send" }));

    await screen.findByText(/planRequired\.aiAssistant/);
    expect(screen.queryByText(/Sorry, an error occurred/)).toBeNull();
    expect(mockToastError).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
