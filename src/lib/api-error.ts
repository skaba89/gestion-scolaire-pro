/**
 * Message lisible d'une erreur renvoyée par l'API (client axios).
 *
 * FastAPI renvoie `detail` sous forme de texte (HTTPException) ou de liste
 * d'erreurs de validation (422) : afficher la liste telle quelle donnait
 * « [object Object] ».
 */
export function apiErrorDetail(error: unknown): string {
  const err = error as { response?: { data?: { detail?: unknown } }; message?: string } | null;
  const detail = err?.response?.data?.detail;
  if (typeof detail === "string" && detail) return detail;
  if (Array.isArray(detail) && detail.length > 0) {
    return detail
      .map((d) => (typeof d === "string" ? d : (d as { msg?: string })?.msg))
      .filter(Boolean)
      .join(" ; ");
  }
  return err?.message || "Erreur inconnue";
}
