import type { AppRole } from "@/lib/types";

/** Payment reminders contain family invoices and belong on the parent portal only. */
export function canLoadPaymentReminders(roles: AppRole[]): boolean {
  return roles.includes("PARENT");
}
