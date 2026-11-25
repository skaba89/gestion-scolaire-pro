/**
 * Lot Admissions (Q-A1) : « Inscrire » choisit la classe de l'élève. Pour un compte limité à des
 * cycles, la classe est obligatoire ; les classes proposées sont celles du niveau demandé.
 */
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGet } = vi.hoisted(() => ({ mockGet: vi.fn() }));
vi.mock("@/api/client", () => ({ apiClient: { get: mockGet } }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

import { ConvertAdmissionDialog } from "../ConvertAdmissionDialog";
import type { AdmissionApplication } from "@/queries/admissions";

const application = {
  id: "app-1", student_first_name: "Kadiatou", student_last_name: "Bah", level_id: "lvl-cp", status: "ACCEPTED",
} as unknown as AdmissionApplication;

function renderDialog(classRequired: boolean, onConfirm = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  render(
    <ConvertAdmissionDialog tenantId="t1" application={application} classRequired={classRequired}
      isPending={false} onOpenChange={vi.fn()} onConfirm={onConfirm} />,
    { wrapper },
  );
  return onConfirm;
}

describe("ConvertAdmissionDialog", () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockGet.mockResolvedValue({ data: [
      { id: "cls-cp-b", name: "CP B", level_id: "lvl-cp" },
      { id: "cls-6e", name: "6e A", level_id: "lvl-6e" },
      { id: "cls-cp-a", name: "CP A", level_id: "lvl-cp" },
    ] });
  });

  it("propose les classes du niveau demandé seulement", async () => {
    renderDialog(false);
    await waitFor(() => expect(screen.getByRole("option", { name: "CP A" })).toBeInTheDocument());
    expect(screen.getByRole("option", { name: "CP B" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "6e A" })).not.toBeInTheDocument();
  });

  it("compte limité à des cycles : la classe est obligatoire", async () => {
    const onConfirm = renderDialog(true);
    await waitFor(() => expect(screen.getByRole("option", { name: "CP A" })).toBeInTheDocument());
    const confirm = screen.getByRole("button", { name: "admissions.convertDialog.confirm" });
    expect(confirm).toBeDisabled();
    fireEvent.change(screen.getByLabelText("admissions.convertDialog.classLabel"), { target: { value: "cls-cp-a" } });
    expect(confirm).toBeEnabled();
    fireEvent.click(confirm);
    expect(onConfirm).toHaveBeenCalledWith("cls-cp-a");
  });

  it("compte complet : l'inscription sans classe reste possible", async () => {
    const onConfirm = renderDialog(false);
    await waitFor(() => expect(screen.getByRole("option", { name: "CP A" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "admissions.convertDialog.confirm" }));
    expect(onConfirm).toHaveBeenCalledWith(undefined);
  });
});
