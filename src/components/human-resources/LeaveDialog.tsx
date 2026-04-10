import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Employee, LEAVE_TYPE_LABELS } from "@/types/humanResources";

interface LeaveDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    employees: Employee[];
    onSubmit: (data: any) => void;
    isSubmitting?: boolean;
}

export function LeaveDialog({ open, onOpenChange, employees, onSubmit, isSubmitting }: LeaveDialogProps) {
    const [form, setForm] = useState({
        employee_id: "",
        leave_type: "CONGE_PAYE",
        start_date: new Date().toISOString().split('T')[0],
        end_date: "",
        reason: ""
    });

    useEffect(() => {
        if (open) {
            setForm({
                employee_id: "",
                leave_type: "CONGE_PAYE",
                start_date: new Date().toISOString().split('T')[0],
                end_date: "",
                reason: ""
            });
        }
    }, [open]);

    const handleSubmit = () => {
        onSubmit(form);
    };

    const isInvalid = !form.employee_id || !form.start_date || !form.end_date;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Nouvelle demande de congé</DialogTitle>
                    <DialogDescription>Enregistrez une demande de congé</DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="space-y-2">
                        <Label htmlFor="employee_id">Employé *</Label>
                        <Select value={form.employee_id} onValueChange={(v) => setForm({ ...form, employee_id: v })}>
                            <SelectTrigger id="employee_id">
                                <SelectValue placeholder="Sélectionner un employé" />
                            </SelectTrigger>
                            <SelectContent>
                                {employees.filter(e => e.is_active).map((emp) => (
                                    <SelectItem key={emp.id} value={emp.id}>{emp.first_name} {emp.last_name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="leave_type">Type de congé *</Label>
                        <Select value={form.leave_type} onValueChange={(v) => setForm({ ...form, leave_type: v })}>
                            <SelectTrigger id="leave_type">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {Object.entries(LEAVE_TYPE_LABELS).map(([key, label]) => (
                                    <SelectItem key={key} value={key}>{label}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="start_date">Date de début *</Label>
                            <Input
                                id="start_date"
                                type="date"
                                value={form.start_date}
                                onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="end_date">Date de fin *</Label>
                            <Input
                                id="end_date"
                                type="date"
                                value={form.end_date}
                                onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                            />
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="reason">Motif</Label>
                        <Textarea
                            id="reason"
                            value={form.reason}
                            onChange={(e) => setForm({ ...form, reason: e.target.value })}
                        />
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Annuler</Button>
                    <Button
                        onClick={handleSubmit}
                        disabled={isInvalid || isSubmitting}
                    >
                        Enregistrer
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
