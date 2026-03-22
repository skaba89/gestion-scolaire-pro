import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { QRCodeSVG } from "qrcode.react";
import { Download, Trash2, AlertTriangle } from "lucide-react";
import { BadgeRenderer } from "@/components/badges/BadgeTemplates";

interface StudentBadge {
    id: string;
    student_id: string;
    badge_code: string;
    qr_code_data: string;
    status: "ACTIVE" | "INACTIVE" | "LOST" | "EXPIRED";
    issued_at: string;
    student?: {
        first_name: string;
        last_name: string;
        registration_number?: string | null;
        photo_url?: string | null;
    };
    classroomName?: string;
    academicYear?: string;
}

interface BadgeDetailDialogProps {
    badge: StudentBadge | null;
    onClose: () => void;
    onUpdateStatus: (id: string, status: any) => void;
    onDelete: (id: string) => void;
    onDownload: (badge: StudentBadge) => void;
    statusLabels: Record<string, string>;
    statusColors: Record<string, string>;
}

export function BadgeDetailDialog({
    badge,
    onClose,
    onUpdateStatus,
    onDelete,
    onDownload,
    statusLabels,
    statusColors,
}: BadgeDetailDialogProps) {
    if (!badge) return null;

    return (
        <Dialog open={!!badge} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>Détails du badge</DialogTitle>
                    <DialogDescription>
                        Visualisation et gestion du badge de {badge.student?.first_name} {badge.student?.last_name}
                    </DialogDescription>
                </DialogHeader>

                <div className="flex flex-col items-center space-y-6 pt-4">
                    <div className="border p-2 rounded-lg bg-white">
                        <QRCodeSVG
                            id={`qr-${badge.id}`}
                            value={badge.qr_code_data}
                            size={200}
                            level="H"
                            includeMargin={true}
                        />
                    </div>

                    <div className="w-full space-y-4">
                        <div className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                                <p className="text-muted-foreground">Code Badge</p>
                                <p className="font-mono font-bold">{badge.badge_code}</p>
                            </div>
                            <div>
                                <p className="text-muted-foreground">Statut Actuel</p>
                                <Badge className={statusColors[badge.status]}>
                                    {statusLabels[badge.status]}
                                </Badge>
                            </div>
                            <div>
                                <p className="text-muted-foreground">Matricule</p>
                                <p className="font-medium">{badge.student?.registration_number || "-"}</p>
                            </div>
                            <div>
                                <p className="text-muted-foreground">Classe</p>
                                <p className="font-medium">{badge.classroomName || "Non assignée"}</p>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <p className="text-sm font-medium">Modifier le statut</p>
                            <Select
                                value={badge.status}
                                onValueChange={(value: any) => onUpdateStatus(badge.id, value)}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Changer le statut" />
                                </SelectTrigger>
                                <SelectContent>
                                    {Object.entries(statusLabels).map(([value, label]) => (
                                        <SelectItem key={value} value={value}>
                                            {label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="flex gap-2 pt-2">
                            <Button className="flex-1" onClick={() => onDownload(badge)}>
                                <Download className="h-4 w-4 mr-2" />
                                Télécharger PNG
                            </Button>

                            <AlertDialog>
                                <AlertDialogTrigger asChild>
                                    <Button variant="destructive" size="icon">
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                    <AlertDialogHeader>
                                        <AlertDialogTitle className="flex items-center gap-2">
                                            <AlertTriangle className="h-5 w-5 text-destructive" />
                                            Supprimer le badge ?
                                        </AlertDialogTitle>
                                        <AlertDialogDescription>
                                            Cette action est irréversible. Le badge ne pourra plus être utilisé pour le pointage.
                                        </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                        <AlertDialogCancel>Annuler</AlertDialogCancel>
                                        <AlertDialogAction
                                            onClick={() => onDelete(badge.id)}
                                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                        >
                                            Supprimer définitivement
                                        </AlertDialogAction>
                                    </AlertDialogFooter>
                                </AlertDialogContent>
                            </AlertDialog>
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
