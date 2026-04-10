import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { User, FileText, Play, ArrowUpCircle, Check, X, CheckCircle2, History } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

interface AlumniRequestDetailDialogProps {
    request: any | null;
    onClose: () => void;
    profilesMap: Record<string, any>;
    documentTypes: any[];
    statusLabels: Record<string, any>;
    requestHistory: any[];
    onAction: (action: string, notes?: string, approved?: boolean) => void;
}

export function AlumniRequestDetailDialog({
    request,
    onClose,
    profilesMap,
    documentTypes,
    statusLabels,
    requestHistory,
    onAction
}: AlumniRequestDetailDialogProps) {
    if (!request) return null;

    const alumni = profilesMap[request.alumni_id];
    const docType = documentTypes.find(t => t.value === request.document_type);
    const status = statusLabels[request.status];

    return (
        <Dialog open={!!request} onOpenChange={onClose}>
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <FileText className="w-5 h-5" />
                        Détails de la demande
                    </DialogTitle>
                </DialogHeader>
                <div className="space-y-6">
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm text-muted-foreground">Demandeur</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                                    <User className="w-5 h-5 text-primary" />
                                </div>
                                <div>
                                    <p className="font-semibold">{alumni?.first_name} {alumni?.last_name}</p>
                                    <p className="text-sm text-muted-foreground">{alumni?.email}</p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <Label className="text-muted-foreground">Type de document</Label>
                            <p className="font-medium">{docType?.label}</p>
                        </div>
                        <div>
                            <Label className="text-muted-foreground">Statut</Label>
                            <Badge className={status?.color}>
                                {status?.icon}
                                <span className="ml-1">{status?.label}</span>
                            </Badge>
                        </div>
                        <div>
                            <Label className="text-muted-foreground">Date de soumission</Label>
                            <p>{request.created_at ? format(new Date(request.created_at), "PPP", { locale: fr }) : "-"}</p>
                        </div>
                        <div>
                            <Label className="text-muted-foreground">Mode de livraison</Label>
                            <p className="capitalize">{request.delivery_method}</p>
                        </div>
                    </div>

                    {request.document_description && (
                        <div>
                            <Label className="text-muted-foreground">Description</Label>
                            <p>{request.document_description}</p>
                        </div>
                    )}

                    <div>
                        <Label className="text-muted-foreground">Motif</Label>
                        <p>{request.purpose}</p>
                    </div>

                    {request.delivery_address && (
                        <div>
                            <Label className="text-muted-foreground">Adresse de livraison</Label>
                            <p>{request.delivery_address}</p>
                        </div>
                    )}

                    <Separator />

                    <div className="space-y-4">
                        <Label className="text-muted-foreground">Actions</Label>

                        {request.status === "pending" && (
                            <Button onClick={() => onAction("start")}>
                                <Play className="w-4 h-4 mr-2" />
                                Démarrer le traitement
                            </Button>
                        )}

                        {request.status === "in_progress" && (
                            <div className="space-y-3">
                                <Textarea
                                    id="secretariat_notes"
                                    placeholder="Notes pour le validateur..."
                                    rows={3}
                                />
                                <Button onClick={() => {
                                    const notes = (document.getElementById("secretariat_notes") as HTMLTextAreaElement).value;
                                    onAction("request_validation", notes);
                                }}>
                                    <ArrowUpCircle className="w-4 h-4 mr-2" />
                                    Soumettre pour validation
                                </Button>
                            </div>
                        )}

                        {request.status === "awaiting_validation" && (
                            <div className="space-y-3">
                                {request.secretariat_notes && (
                                    <div className="p-3 rounded-lg bg-muted">
                                        <Label className="text-muted-foreground text-xs">Notes du secrétariat</Label>
                                        <p className="text-sm">{request.secretariat_notes}</p>
                                    </div>
                                )}
                                <Textarea
                                    id="validation_notes"
                                    placeholder="Notes de validation..."
                                    rows={2}
                                />
                                <div className="flex gap-2">
                                    <Button onClick={() => {
                                        const notes = (document.getElementById("validation_notes") as HTMLTextAreaElement).value;
                                        onAction("validate", notes, true);
                                    }} className="bg-green-600 hover:bg-green-700">
                                        <Check className="w-4 h-4 mr-2" />
                                        Approuver
                                    </Button>
                                    <Button variant="destructive" onClick={() => {
                                        const notes = (document.getElementById("validation_notes") as HTMLTextAreaElement).value;
                                        onAction("validate", notes, false);
                                    }}>
                                        <X className="w-4 h-4 mr-2" />
                                        Rejeter
                                    </Button>
                                </div>
                            </div>
                        )}

                        {request.status === "validated" && (
                            <Button onClick={() => onAction("complete")}>
                                <CheckCircle2 className="w-4 h-4 mr-2" />
                                Marquer comme livré
                            </Button>
                        )}
                    </div>

                    <Separator />

                    <div>
                        <Label className="text-muted-foreground mb-2 block flex items-center gap-2">
                            <History className="w-4 h-4" />
                            Historique
                        </Label>
                        <ScrollArea className="h-48">
                            <div className="space-y-3">
                                {requestHistory.map((history) => (
                                    <div key={history.id} className="flex items-start gap-3 text-sm">
                                        <div className="w-2 h-2 rounded-full bg-primary mt-1.5" />
                                        <div>
                                            <p className="font-medium capitalize">{history.action.replace("_", " ")}</p>
                                            {history.notes && <p className="text-muted-foreground">{history.notes}</p>}
                                            <p className="text-xs text-muted-foreground">
                                                {format(new Date(history.created_at), "PPp", { locale: fr })}
                                                {history.performed_by && profilesMap[history.performed_by] &&
                                                    ` • ${profilesMap[history.performed_by].first_name} ${profilesMap[history.performed_by].last_name}`}
                                            </p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </ScrollArea>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
