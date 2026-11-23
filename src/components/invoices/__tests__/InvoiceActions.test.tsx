/**
 * FIN-EMAIL-01 (2026-11-23) : « Envoyer la facture par e-mail » n'envoyait rien (la route se
 * contentait d'une trace d'audit) mais affichait « Facture envoyée ». La route répond désormais
 * 501 : l'écran ne propose plus cette action ; PDF, WhatsApp et SMS restent disponibles.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

const { mockApiPost } = vi.hoisted(() => ({ mockApiPost: vi.fn() }));

vi.mock("@/api/client", () => ({
  apiClient: { post: mockApiPost, get: vi.fn() },
}));

vi.mock("@/contexts/TenantContext", () => ({
  useTenant: () => ({ tenant: { id: "tenant-1", name: "École", settings: { currency: "GNF" } } }),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { InvoiceActions } from "@/components/invoices/InvoiceActions";

const invoice = {
  id: "inv-1",
  invoice_number: "INV-2026-0001",
  total_amount: 150000,
  students: { phone: "+224 620 00 00 00" },
};

describe("InvoiceActions", () => {
  it("ne propose pas d'envoi par e-mail en affichage complet", () => {
    render(<InvoiceActions invoice={invoice} />);

    expect(screen.getByRole("button", { name: /pdf/i })).toBeInTheDocument();
    expect(screen.getByTitle("WhatsApp")).toBeInTheDocument();
    expect(screen.getByTitle("SMS")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /e-?mail/i })).not.toBeInTheDocument();
    expect(mockApiPost).not.toHaveBeenCalled();
  });

  it("ne propose pas d'envoi par e-mail dans le menu compact", async () => {
    const user = userEvent.setup();
    render(<InvoiceActions invoice={invoice} compact />);

    await user.click(screen.getByRole("button"));

    expect(await screen.findByText("Télécharger PDF")).toBeInTheDocument();
    expect(screen.getByText("WhatsApp")).toBeInTheDocument();
    expect(screen.queryByText(/e-?mail/i)).not.toBeInTheDocument();
    expect(mockApiPost).not.toHaveBeenCalled();
  });
});
