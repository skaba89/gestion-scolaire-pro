import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/api/client";
import { useTenant } from "@/contexts/TenantContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import {
    AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
    AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ScanLine, Plus, Copy, Trash2, Tablet, Check, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

interface KioskDevice {
    id: string;
    label: string;
    is_active: boolean;
    last_used_at: string | null;
    created_at: string;
}

export default function KioskDevices() {
    const { tenant } = useTenant();
    const queryClient = useQueryClient();
    const [createOpen, setCreateOpen] = useState(false);
    const [label, setLabel] = useState("");
    const [createdToken, setCreatedToken] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);
    const [revokeTarget, setRevokeTarget] = useState<KioskDevice | null>(null);

    const { data: devices, isLoading } = useQuery<KioskDevice[]>({
        queryKey: ["kiosk-devices"],
        queryFn: async () => {
            const { data } = await apiClient.get("/kiosk/devices/");
            return data;
        },
    });

    const createMutation = useMutation({
        mutationFn: async (label: string) => {
            const { data } = await apiClient.post("/kiosk/devices/", { label });
            return data;
        },
        onSuccess: (data) => {
            setCreatedToken(data.token);
            queryClient.invalidateQueries({ queryKey: ["kiosk-devices"] });
        },
        onError: () => toast.error("Erreur lors de la création de l'appareil"),
    });

    const revokeMutation = useMutation({
        mutationFn: async (id: string) => {
            await apiClient.delete(`/kiosk/devices/${id}/`);
        },
        onSuccess: () => {
            toast.success("Appareil révoqué");
            queryClient.invalidateQueries({ queryKey: ["kiosk-devices"] });
            setRevokeTarget(null);
        },
        onError: () => toast.error("Erreur lors de la révocation"),
    });

    const kioskUrl = tenant?.slug ? `${window.location.origin}/kiosk/${tenant.slug}` : "";

    const resetCreateDialog = () => {
        setCreateOpen(false);
        setLabel("");
        setCreatedToken(null);
        setCopied(false);
    };

    const copyToken = () => {
        if (!createdToken) return;
        navigator.clipboard.writeText(createdToken);
        setCopied(true);
        toast.success("Jeton copié");
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-2">
                        <ScanLine className="h-6 w-6 text-primary" />
                        Appareils kiosque
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        Tablettes ou téléphones dédiés au scan des présences sans connexion
                        d'un membre du personnel. Chaque appareil utilise un jeton propre,
                        révocable à tout moment.
                    </p>
                </div>
                <Button onClick={() => setCreateOpen(true)} className="gap-2">
                    <Plus className="h-4 w-4" /> Ajouter un appareil
                </Button>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Appareils enregistrés</CardTitle>
                    <CardDescription>
                        Une fois le jeton configuré sur l'appareil (page {" "}
                        <code className="text-xs bg-muted px-1 py-0.5 rounded">/kiosk/{tenant?.slug || "..."}</code>),
                        il reste connecté jusqu'à révocation.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <div className="text-center py-8 text-muted-foreground">Chargement...</div>
                    ) : !devices || devices.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground italic">
                            Aucun appareil enregistré pour le moment.
                        </div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Nom</TableHead>
                                    <TableHead>Statut</TableHead>
                                    <TableHead>Dernière utilisation</TableHead>
                                    <TableHead>Créé le</TableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {devices.map((device) => (
                                    <TableRow key={device.id}>
                                        <TableCell className="font-medium flex items-center gap-2">
                                            <Tablet className="h-4 w-4 text-muted-foreground" />
                                            {device.label}
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant={device.is_active ? "default" : "outline"}>
                                                {device.is_active ? "Actif" : "Révoqué"}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-sm text-muted-foreground">
                                            {device.last_used_at
                                                ? format(new Date(device.last_used_at), "dd MMM yyyy à HH:mm", { locale: fr })
                                                : "Jamais"}
                                        </TableCell>
                                        <TableCell className="text-sm text-muted-foreground">
                                            {format(new Date(device.created_at), "dd MMM yyyy", { locale: fr })}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            {device.is_active && (
                                                <Button
                                                    size="sm" variant="ghost"
                                                    className="text-destructive hover:text-destructive"
                                                    onClick={() => setRevokeTarget(device)}
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>

            {/* Create dialog */}
            <Dialog open={createOpen} onOpenChange={(open) => !open && resetCreateDialog()}>
                <DialogContent>
                    {!createdToken ? (
                        <>
                            <DialogHeader>
                                <DialogTitle>Nouvel appareil kiosque</DialogTitle>
                                <DialogDescription>
                                    Donnez un nom pour identifier cet appareil (ex : "Tablette Entrée principale").
                                </DialogDescription>
                            </DialogHeader>
                            <div className="space-y-2 py-2">
                                <Label htmlFor="kiosk-label">Nom de l'appareil</Label>
                                <Input
                                    id="kiosk-label" value={label}
                                    onChange={(e) => setLabel(e.target.value)}
                                    placeholder="Tablette Entrée principale"
                                    autoFocus
                                />
                            </div>
                            <DialogFooter>
                                <Button variant="outline" onClick={resetCreateDialog}>Annuler</Button>
                                <Button
                                    disabled={!label.trim() || createMutation.isPending}
                                    onClick={() => createMutation.mutate(label.trim())}
                                >
                                    Créer
                                </Button>
                            </DialogFooter>
                        </>
                    ) : (
                        <>
                            <DialogHeader>
                                <DialogTitle className="flex items-center gap-2 text-amber-600">
                                    <AlertTriangle className="h-5 w-5" /> Jeton d'appareil
                                </DialogTitle>
                                <DialogDescription>
                                    Ce jeton ne sera plus jamais affiché. Copiez-le et saisissez-le
                                    maintenant sur l'appareil, sur la page {" "}
                                    <code className="text-xs bg-muted px-1 py-0.5 rounded">/kiosk/{tenant?.slug}</code>.
                                </DialogDescription>
                            </DialogHeader>
                            <div className="flex items-center gap-2 py-2">
                                <code className="flex-1 text-xs bg-muted p-3 rounded break-all">{createdToken}</code>
                                <Button size="icon" variant="outline" onClick={copyToken}>
                                    {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                                </Button>
                            </div>
                            {kioskUrl && (
                                <p className="text-xs text-muted-foreground">
                                    URL de l'appareil : <code className="bg-muted px-1 py-0.5 rounded">{kioskUrl}</code>
                                </p>
                            )}
                            <DialogFooter>
                                <Button onClick={resetCreateDialog}>J'ai noté le jeton, fermer</Button>
                            </DialogFooter>
                        </>
                    )}
                </DialogContent>
            </Dialog>

            {/* Revoke confirmation */}
            <AlertDialog open={!!revokeTarget} onOpenChange={(open) => !open && setRevokeTarget(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Révoquer « {revokeTarget?.label} » ?</AlertDialogTitle>
                        <AlertDialogDescription>
                            L'appareil ne pourra plus enregistrer de présences. Cette action est
                            irréversible — il faudra créer un nouvel appareil pour le remplacer.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Annuler</AlertDialogCancel>
                        <AlertDialogAction
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            onClick={() => revokeTarget && revokeMutation.mutate(revokeTarget.id)}
                        >
                            Révoquer
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
