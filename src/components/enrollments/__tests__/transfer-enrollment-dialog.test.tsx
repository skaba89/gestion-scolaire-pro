import { beforeAll, describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TransferEnrollmentDialog } from "@/components/enrollments/transfer-enrollment-dialog";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

// jsdom n'implémente pas ces API utilisées par le Select Radix.
beforeAll(() => {
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.releasePointerCapture ??= () => undefined;
  Element.prototype.scrollIntoView ??= () => undefined;
});

const classes = [{ id: "class-2", name: "6e B" }];

describe("TransferEnrollmentDialog (A5)", () => {
  it("disables confirmation until a class is chosen, then sends it", async () => {
    const onConfirm = vi.fn().mockResolvedValue(true);
    const onOpenChange = vi.fn();
    render(<TransferEnrollmentDialog open onOpenChange={onOpenChange} studentName="Bah Aïcha"
      classes={classes} isPending={false} onConfirm={onConfirm} />);

    const confirm = screen.getByRole("button", { name: "enrollments.transfer.confirm" });
    expect(confirm).toBeDisabled();

    await userEvent.click(screen.getByRole("combobox"));
    await userEvent.click(await screen.findByRole("option", { name: "6e B" }));
    await userEvent.click(confirm);

    expect(onConfirm).toHaveBeenCalledWith("class-2");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("stays open when the transfer is refused", async () => {
    const onConfirm = vi.fn().mockResolvedValue(false);
    const onOpenChange = vi.fn();
    render(<TransferEnrollmentDialog open onOpenChange={onOpenChange} studentName="Bah Aïcha"
      classes={classes} isPending={false} onConfirm={onConfirm} />);

    await userEvent.click(screen.getByRole("combobox"));
    await userEvent.click(await screen.findByRole("option", { name: "6e B" }));
    await userEvent.click(screen.getByRole("button", { name: "enrollments.transfer.confirm" }));

    expect(onConfirm).toHaveBeenCalledWith("class-2");
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("explains when no other class exists", () => {
    render(<TransferEnrollmentDialog open onOpenChange={vi.fn()} studentName="Bah Aïcha"
      classes={[]} isPending={false} onConfirm={vi.fn()} />);
    expect(screen.getByText("enrollments.transfer.noOtherClass")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "enrollments.transfer.confirm" })).toBeDisabled();
  });
});
