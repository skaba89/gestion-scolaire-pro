/**
 * Messages reçus (2026-11-25) : répondre à un visiteur, historique et statut des réponses, filtre
 * « Sans réponse ».
 */
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { apiGet, apiPost } = vi.hoisted(() => ({ apiGet: vi.fn(), apiPost: vi.fn() }));
vi.mock("@/api/client", () => ({ apiClient: { get: apiGet, post: apiPost, patch: vi.fn(), delete: vi.fn() } }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "fr" } }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import PublicFormSubmissions, { isAnswered, type Submission } from "../PublicFormSubmissions";

const base = { page_id: null, phone: null, is_read: true, created_at: new Date().toISOString() };
const MESSAGES: Submission[] = [
  { ...base, id: "m1", name: "Mamadou", email: "m@example.com", subject: "Inscription", message: "Bonjour",
    replies: [{ id: "r1", author_name: "Aïcha Camara", body: "Les inscriptions ouvrent le 1er juin.", status: "SENT", created_at: base.created_at }] },
  { ...base, id: "m2", name: "Fatou", email: "f@example.com", subject: "Frais", message: "Quels frais ?",
    replies: [{ id: "r2", author_name: "Aïcha Camara", body: "Tentative", status: "FAILED", created_at: base.created_at }] },
];

function renderInbox() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return render(<PublicFormSubmissions />, { wrapper });
}

describe("Messages reçus — réponses", () => {
  beforeEach(() => {
    apiGet.mockReset(); apiPost.mockReset();
    apiGet.mockResolvedValue({ data: MESSAGES });
    apiPost.mockResolvedValue({ data: {} });
  });

  it("seule une réponse effectivement envoyée compte comme réponse", () => {
    expect(isAnswered(MESSAGES[0])).toBe(true);
    expect(isAnswered(MESSAGES[1])).toBe(false);
  });

  it("affiche l'historique avec le statut de chaque réponse", async () => {
    renderInbox();
    await waitFor(() => expect(screen.getByText("Les inscriptions ouvrent le 1er juin.")).toBeInTheDocument());
    expect(screen.getByText("contactInbox.statusSent")).toBeInTheDocument();
    expect(screen.getByText("contactInbox.statusFailed")).toBeInTheDocument();
  });

  it("le filtre « Sans réponse » ne garde que les messages sans réponse envoyée", async () => {
    renderInbox();
    await waitFor(() => expect(screen.getByText("Inscription")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /contactInbox.filterUnanswered/ }));
    expect(screen.queryByText("Inscription")).not.toBeInTheDocument();
    expect(screen.getByText("Frais")).toBeInTheDocument();
  });

  it("envoie la réponse saisie au serveur", async () => {
    renderInbox();
    await waitFor(() => expect(screen.getByText("Frais")).toBeInTheDocument());
    // Deuxième message (« Frais ») : son bouton Répondre est le second de la liste.
    fireEvent.click(screen.getAllByRole("button", { name: "contactInbox.reply" })[1]);
    const dialog = await screen.findByRole("dialog");
    const send = within(dialog).getByRole("button", { name: "contactInbox.send" });
    expect(send).toBeDisabled();
    fireEvent.change(within(dialog).getByLabelText("contactInbox.replyLabel"), { target: { value: "  Les frais sont affichés sur notre site.  " } });
    fireEvent.click(send);
    await waitFor(() => expect(apiPost).toHaveBeenCalledWith(
      "/public-pages/submissions/m2/reply/",
      { message: "Les frais sont affichés sur notre site." },
    ));
  });
});
