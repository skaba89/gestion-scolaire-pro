import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { EmployeeDialog } from "./EmployeeDialog";
import type { Employee } from "@/types/humanResources";

vi.mock("@/hooks/useHumanResources", () => ({
    useHumanResources: () => ({ useLastEmployeeNumber: () => ({ data: "EMP-007" }) }),
}));

const employee: Employee = {
    id: "employee-a", employee_number: "EMP-003",
    first_name: "Fatoumata", last_name: "Diallo", hire_date: "2025-09-01", is_active: true,
    email: null, phone: null, job_title: null, department: null, date_of_birth: null,
    place_of_birth: null, nationality: null, social_security_number: null,
    address: null, city: null, postal_code: null, country: null, bank_name: null,
    bank_iban: null, bank_bic: null, emergency_contact_name: null, emergency_contact_phone: null,
};

describe("Employee retention workflow", () => {
    it("submits deactivation while preserving the employee identity", () => {
        const onSubmit = vi.fn();
        render(<EmployeeDialog open onOpenChange={vi.fn()} employee={employee} onSubmit={onSubmit} />);
        fireEvent.click(screen.getByRole("switch", { name: "Employé actif" }));
        fireEvent.click(screen.getByRole("button", { name: "Mettre à jour" }));
        expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
            id: "employee-a", employee_number: "EMP-003", is_active: false,
        }));
    });

    it("keeps an inactive record inactive when editing other information", () => {
        const onSubmit = vi.fn();
        render(<EmployeeDialog open onOpenChange={vi.fn()} employee={{ ...employee, is_active: false }} onSubmit={onSubmit} />);
        expect(screen.getByRole("switch", { name: "Employé actif" })).not.toBeChecked();
        fireEvent.change(screen.getByLabelText("Prénom *"), { target: { value: "Aïssatou" } });
        fireEvent.click(screen.getByRole("button", { name: "Mettre à jour" }));
        expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ first_name: "Aïssatou", is_active: false }));
    });
});
