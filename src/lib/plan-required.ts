/**
 * Refus « abonnement requis » de l'API (HTTP 402 de `require_plan`).
 *
 * Le corps renvoyé par `http_exception_handler` porte `error: "PLAN_REQUIRED"`.
 * Sans traitement, les assistants IA affichaient le code brut « PLAN_REQUIRED »
 * suivi d'un message d'erreur générique (en anglais pour ChatBot).
 */

/** Levée par les appels `fetch` (flux du ChatBot) qui reçoivent un 402. */
export class PlanRequiredError extends Error {
  constructor() {
    super("PLAN_REQUIRED");
    this.name = "PlanRequiredError";
  }
}

/** Vrai pour une erreur axios 402 / PLAN_REQUIRED ou une PlanRequiredError. */
export function isPlanRequiredError(error: unknown): boolean {
  if (error instanceof PlanRequiredError) return true;
  const response = (error as { response?: { status?: number; data?: { error?: unknown } } } | null)?.response;
  return response?.status === 402 || response?.data?.error === "PLAN_REQUIRED";
}
