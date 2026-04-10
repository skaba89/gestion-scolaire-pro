import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2 } from "lucide-react";

interface ClubMembersDialogProps {
    club: any | null;
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    members: any[];
    nonMembers: any[];
    onAddMember: (studentId: string) => void;
    onRemoveMember: (membershipId: string) => void;
}

export function ClubMembersDialog({
    club,
    isOpen,
    onOpenChange,
    members,
    nonMembers,
    onAddMember,
    onRemoveMember,
}: ClubMembersDialogProps) {
    if (!club) return null;

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>Membres de {club.name}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                    <div className="flex gap-2">
                        <Select onValueChange={onAddMember}>
                            <SelectTrigger className="flex-1">
                                <SelectValue placeholder="Ajouter un membre..." />
                            </SelectTrigger>
                            <SelectContent>
                                {nonMembers.map((s) => (
                                    <SelectItem key={s.id} value={s.id}>
                                        {s.first_name} {s.last_name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-2 max-h-60 overflow-y-auto">
                        {members.map((m: any) => (
                            <div key={m.id} className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
                                <div className="flex items-center gap-2">
                                    <Avatar className="h-8 w-8">
                                        <AvatarFallback className="text-xs">
                                            {m.student?.first_name?.[0]}{m.student?.last_name?.[0]}
                                        </AvatarFallback>
                                    </Avatar>
                                    <span className="text-sm">
                                        {m.student?.first_name} {m.student?.last_name}
                                    </span>
                                </div>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-destructive"
                                    onClick={() => onRemoveMember(m.id)}
                                >
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                            </div>
                        ))}
                        {members.length === 0 && (
                            <p className="text-sm text-muted-foreground text-center py-4">
                                Aucun membre inscrit
                            </p>
                        )}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
