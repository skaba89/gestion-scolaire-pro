import { useState, useEffect } from "react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";

interface Subject {
    id: string;
    name: string;
}

interface Room {
    id: string;
    name: string;
}

interface ScheduleFormDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSubmit: (data: any) => void;
    isPending: boolean;
    subjects: Subject[];
    rooms: Room[];
    days: { value: number, label: string }[];
    timeSlots: string[];
}

export const ScheduleFormDialog = ({
    open,
    onOpenChange,
    onSubmit,
    isPending,
    subjects,
    rooms,
    days,
    timeSlots,
}: ScheduleFormDialogProps) => {
    const [formData, setFormData] = useState({
        subject_id: "",
        day_of_week: 1,
        start_time: "08:00",
        end_time: "09:00",
        room_id: "",
    });

    useEffect(() => {
        if (!open) {
            setFormData({
                subject_id: "",
                day_of_week: 1,
                start_time: "08:00",
                end_time: "09:00",
                room_id: "",
            });
        }
    }, [open]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSubmit(formData);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="rounded-2xl border-none shadow-2xl">
                <DialogHeader>
                    <DialogTitle className="text-2xl font-display font-bold">Nouveau créneau</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4 py-4">
                    <div className="space-y-2">
                        <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Matière</Label>
                        <Select
                            value={formData.subject_id}
                            onValueChange={(v) => setFormData(prev => ({ ...prev, subject_id: v }))}
                            required
                        >
                            <SelectTrigger className="rounded-xl h-11 border-muted-foreground/20">
                                <SelectValue placeholder="Sélectionner une matière" />
                            </SelectTrigger>
                            <SelectContent className="rounded-xl border-none shadow-xl">
                                {subjects.map((subject) => (
                                    <SelectItem key={subject.id} value={subject.id}>{subject.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Jour</Label>
                            <Select
                                value={String(formData.day_of_week)}
                                onValueChange={(v) => setFormData(prev => ({ ...prev, day_of_week: Number(v) }))}
                                required
                            >
                                <SelectTrigger className="rounded-xl h-11 border-muted-foreground/20">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="rounded-xl border-none shadow-xl">
                                    {days.map((day) => (
                                        <SelectItem key={day.value} value={String(day.value)}>{day.label}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Salle (Optionnel)</Label>
                            <Select
                                value={formData.room_id}
                                onValueChange={(v) => setFormData(prev => ({ ...prev, room_id: v }))}
                            >
                                <SelectTrigger className="rounded-xl h-11 border-muted-foreground/20">
                                    <SelectValue placeholder="Choisir" />
                                </SelectTrigger>
                                <SelectContent className="rounded-xl border-none shadow-xl">
                                    {rooms.map((room) => (
                                        <SelectItem key={room.id} value={room.id}>{room.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Début</Label>
                            <Select
                                value={formData.start_time}
                                onValueChange={(v) => setFormData(prev => ({ ...prev, start_time: v }))}
                                required
                            >
                                <SelectTrigger className="rounded-xl h-11 border-muted-foreground/20">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="rounded-xl border-none shadow-xl">
                                    {timeSlots.map((time) => (
                                        <SelectItem key={time} value={time}>{time}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Fin</Label>
                            <Select
                                value={formData.end_time}
                                onValueChange={(v) => setFormData(prev => ({ ...prev, end_time: v }))}
                                required
                            >
                                <SelectTrigger className="rounded-xl h-11 border-muted-foreground/20">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="rounded-xl border-none shadow-xl">
                                    {timeSlots.map((time) => (
                                        <SelectItem key={time} value={time}>{time}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <Button type="submit" className="w-full h-12 rounded-xl text-md font-bold shadow-colored" disabled={isPending}>
                        Ajouter au planning
                    </Button>
                </form>
            </DialogContent>
        </Dialog>
    );
};
