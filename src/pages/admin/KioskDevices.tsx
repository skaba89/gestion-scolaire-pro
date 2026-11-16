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
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
    AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ScanLine, Plus, Copy, Trash2, Tablet, Check, AlertTriangle, DoorOpen } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { dateFnsLocale } from "@/lib/locale";
import { Trans, useTranslation } from "react-i18next";

interface KioskDevice {
    id: string;
    label: string;
    is_active: boolean;
    room_id: string | null;
    last_used_at: string | null;
    created_at: string;
}

interface Room {
    id: string;
    name: string;
}

export default function KioskDevices() {
    const { t } = useTranslation();
    const { tenant } = useTenant();
    const queryClient = useQueryClient();
    const [createOpen, setCreateOpen] = useState(false);
    const [label, setLabel] = useState("");
    const [roomId, setRoomId] = useState<string>("");
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

    // Le nom de salle n'est pas renvoyé par /kiosk/devices/ (seulement
    // room_id) — on fait la correspondance côté client plutôt que
    // d'étendre la réponse backend pour un simple affichage.
    const { data: rooms } = useQuery<Room[]>({
        queryKey: ["rooms-for-kiosk"],
        queryFn: async () => {
            const { data } = await apiClient.get("/rooms/", { params: { ordering: "name" } });
            return data;
        },
    });
    const roomNameById = new Map((rooms ?? []).map((r) => [r.id, r.name]));

    const createMutation = useMutation({
        mutationFn: async ({ label, room_id }: { label: string; room_id: string | null }) => {
            const { data } = await apiClient.post("/kiosk/devices/", { label, room_id });
            return data;
        },
        onSuccess: (data) => {
            setCreatedToken(data.token);
            queryClient.invalidateQueries({ queryKey: ["kiosk-devices"] });
        },
        onError: () => toast.error(t("teachingAdmin.erreurLorsDeLaCreation")),
    });

    const revokeMutation = useMutation({
        mutationFn: async (id: string) => {
            await apiClient.delete(`/kiosk/devices/${id}/`);
        },
        onSuccess: () => {
            toast.success(t("teachingAdmin.appareilRevoque"));
            queryClient.invalidateQueries({ queryKey: ["kiosk-devices"] });
            setRevokeTarget(null);
        },
        onError: () => toast.error(t("teachingAdmin.erreurLorsDeLaRevocation")),
    });

    const kioskUrl = tenant?.slug ? `${window.location.origin}/kiosk/${tenant.slug}` : "";

    const resetCreateDialog = () => {
        setCreateOpen(false);
        setLabel("");
        setRoomId("");
        setCreatedToken(null);
        setCopied(false);
    };

    const copyToken = () => {
        if (!createdToken) return;
        navigator.clipboard.writeText(createdToken);
        setCopied(true);
        toast.success(t("teachingAdmin.jetonCopie"));
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-2">
                        <ScanLine className="h-6 w-6 text-primary" />
                        {t("teachingAdmin.appareilsKiosque")}
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        {t("teachingAdmin.kioskSubtitle")}
                    </p>
                </div>
                <Button onClick={() => setCreateOpen(true)} className="gap-2">
                    <Plus className="h-4 w-4" /> {t("teachingAdmin.addDevice")}
                </Button>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="text-base">{t("teachingAdmin.appareilsEnregistres")}</CardTitle>
                    <CardDescription>
                        <Trans
                            i18nKey="teachingAdmin.kioskTokenHint"
                            values={{ slug: tenant?.slug || "..." }}
                            components={{ code: <code className="text-xs bg-muted px-1 py-0.5 rounded" /> }}
                        />
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <div className="text-center py-8 text-muted-foreground">{t("teachingAdmin.chargement")}</div>
                    ) : !devices || devices.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground italic">
                            {t("teachingAdmin.aucunAppareilEnregistrePourLe")}
                        </div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>{t("teachingAdmin.nom")}</TableHead>
                                    <TableHead>{t("teachingAdmin.salle")}</TableHead>
                                    <TableHead>{t("teachingAdmin.statut")}</TableHead>
                                    <TableHead>{t("teachingAdmin.derniereUtilisation")}</TableHead>
                                    <TableHead>{t("teachingAdmin.creeLe")}</TableHead>
                                    <TableHead className="text-right">{t("teachingAdmin.actions")}</TableHead>
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
                                            {device.room_id ? (
                                                <span className="inline-flex items-center gap-1 text-sm">
                                                    <DoorOpen className="h-3.5 w-3.5 text-muted-foreground" />
                                                    {roomNameById.get(device.room_id) ?? t("teachingAdmin.salleInconnue")}
                                                </span>
                                            ) : (
                                                <span className="text-sm text-muted-foreground italic">{t("teachingAdmin.entreeGenerale")}</span>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant={device.is_active ? "default" : "outline"}>
                                                {device.is_active ? "Actif" : t("teachingAdmin.revoque")}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-sm text-muted-foreground">
                                            {device.last_used_at
                                                ? format(new Date(device.last_used_at), "dd MMM yyyy à HH:mm", { locale: dateFnsLocale() })
                                                : "Jamais"}
                                        </TableCell>
                                        <TableCell className="text-sm text-muted-foreground">
                                            {format(new Date(device.created_at), "dd MMM yyyy", { locale: dateFnsLocale() })}
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
                                <DialogTitle>{t("teachingAdmin.nouvelAppareilKiosque")}</DialogTitle>
                                <DialogDescription>
                                    {t("teachingAdmin.deviceNameHint")}
                                </DialogDescription>
                            </DialogHeader>
                            <div className="space-y-4 py-2">
                                <div className="space-y-2">
                                    <Label htmlFor="kiosk-label">{t("teachingAdmin.nomDeLAppareil")}</Label>
                                    <Input
                                        id="kiosk-label" value={label}
                                        onChange={(e) => setLabel(e.target.value)}
                                        placeholder={t("teachingAdmin.tabletteEntreePrincipale")}
                                        autoFocus
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="kiosk-room">{t("teachingAdmin.roomOptional")}</Label>
                                    <Select value={roomId || "__none__"} onValueChange={(v) => setRoomId(v === "__none__" ? "" : v)}>
                                        <SelectTrigger id="kiosk-room">
                                            <SelectValue placeholder={t("teachingAdmin.entreeGeneraleDeLEtablissement")} />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="__none__">{t("teachingAdmin.mainEntranceNoRoom")}</SelectItem>
                                            {(rooms ?? []).map((room) => (
                                                <SelectItem key={room.id} value={room.id}>{room.name}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <p className="text-xs text-muted-foreground">
                                        {t("teachingAdmin.roomHint")}
                                    </p>
                                </div>
                            </div>
                            <DialogFooter>
                                <Button variant="outline" onClick={resetCreateDialog}>{t("teachingAdmin.annuler")}</Button>
                                <Button
                                    disabled={!label.trim() || createMutation.isPending}
                                    onClick={() => createMutation.mutate({ label: label.trim(), room_id: roomId || null })}
                                >
                                    {t("teachingAdmin.creer")}
                                </Button>
                            </DialogFooter>
                        </>
                    ) : (
                        <>
                            <DialogHeader>
                                <DialogTitle className="flex items-center gap-2 text-amber-600">
                                    <AlertTriangle className="h-5 w-5" /> {t("teachingAdmin.deviceToken")}
                                </DialogTitle>
                                <DialogDescription>
                                    <Trans
                                        i18nKey="teachingAdmin.tokenOnce"
                                        values={{ slug: tenant?.slug ?? "" }}
                                        components={{ code: <code className="text-xs bg-muted px-1 py-0.5 rounded" /> }}
                                    />
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
                                    <Trans
                                        i18nKey="teachingAdmin.deviceUrl"
                                        values={{ url: kioskUrl }}
                                        components={{ code: <code className="bg-muted px-1 py-0.5 rounded" /> }}
                                    />
                                </p>
                            )}
                            <DialogFooter>
                                <Button onClick={resetCreateDialog}>{t("teachingAdmin.jAiNoteLeJeton")}</Button>
                            </DialogFooter>
                        </>
                    )}
                </DialogContent>
            </Dialog>

            {/* Revoke confirmation */}
            <AlertDialog open={!!revokeTarget} onOpenChange={(open) => !open && setRevokeTarget(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>{t("teachingAdmin.revokeTitle", { label: revokeTarget?.label ?? "" })}</AlertDialogTitle>
                        <AlertDialogDescription>
                            {t("teachingAdmin.revokeHint")}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>{t("teachingAdmin.annuler")}</AlertDialogCancel>
                        <AlertDialogAction
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            onClick={() => revokeTarget && revokeMutation.mutate(revokeTarget.id)}
                        >
                            {t("teachingAdmin.revoquer")}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
