/**
 * Libellé et style du statut d'un paiement (historique des paiements).
 *
 * Défaut corrigé (audit 2026-11-03, FIN-02) : tout paiement non annulé
 * s'affichait « Validé » — y compris un Mobile Money encore en attente ou un
 * paiement échoué. Seul un paiement COMPLETED est un encaissement.
 */
export type PaymentStatusVariant = "default" | "secondary" | "destructive" | "outline";

const STATUS: Record<string, { label: string; variant: PaymentStatusVariant }> = {
  COMPLETED: { label: "Encaissé", variant: "secondary" },
  PENDING: { label: "En attente", variant: "outline" },
  FAILED: { label: "Échoué", variant: "destructive" },
  REFUNDED: { label: "Remboursé", variant: "outline" },
  REVERSED: { label: "Annulé", variant: "destructive" },
};

export function paymentStatusLabel(status?: string | null): { label: string; variant: PaymentStatusVariant } {
  if (!status) return { label: "-", variant: "outline" };
  // Valeur inconnue : affichée telle quelle, jamais présentée comme encaissée.
  return STATUS[status.toUpperCase()] ?? { label: status, variant: "outline" };
}

/** Seul un paiement encaissé compte comme de l'argent reçu. */
export const isCollected = (status?: string | null) => (status ?? "").toUpperCase() === "COMPLETED";
