import { useState, useCallback, useEffect, useMemo } from "react";
import { useParams } from "react-router-dom";
import QRScanner from "@/components/badges/QRScanner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
    AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
    AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ScanLine, LogIn, LogOut, Settings, CheckCircle2, XCircle, BookX, WifiOff } from "lucide-react";
import {
    kioskPendingCount,
    recordKioskScan,
    syncKioskScans,
    type KioskScanData,
} from "./kioskQueue";

function tokenStorageKey(tenantSlug: string) {
    return `schoolflow:kiosk_token:${tenantSlug}`;
}

type ScanResult = {
    status: "success" | "pending" | "not_found" | "error";
    message: string;
    libraryOverdueTitles?: string[];
};

export default function KioskScanPage() {
    const { tenantSlug = "" } = useParams<{ tenantSlug: string }>();
    const storageKey = useMemo(() => tokenStorageKey(tenantSlug), [tenantSlug]);
    const [token, setToken] = useState<string | null>(() => localStorage.getItem(storageKey));
    const [tokenInput, setTokenInput] = useState("");
    const [direction, setDirection] = useState<"IN" | "OUT">("IN");
    const [lastResult, setLastResult] = useState<ScanResult | null>(null);
    const [resetOpen, setResetOpen] = useState(false);
    const [pendingCount, setPendingCount] = useState(0);
    const [isOnline, setIsOnline] = useState(() => navigator.onLine);

    const showSuccess = useCallback((data: KioskScanData) => {
        const base = `${data.student_first_name} ${data.student_last_name} — ${data.direction === "IN" ? "Entrée" : "Sortie"} enregistrée`;
        const courseNote = data.attendance_marked && data.course_name
            ? ` — présent(e) marqué(e) pour ${data.course_name}`
            : "";
        const overdueTitles = data.library_overdue ? data.library_overdue_titles : undefined;
        setLastResult({
            status: "success",
            message: `${base}${courseNote}`,
            libraryOverdueTitles: overdueTitles,
        });
        if (window.navigator.vibrate) window.navigator.vibrate(100);
        setTimeout(() => setLastResult(null), overdueTitles?.length ? 7000 : 3000);
    }, []);

    useEffect(() => {
        let active = true;
        const refreshPending = async () => {
            const count = await kioskPendingCount(tenantSlug);
            if (active) setPendingCount(count);
        };
        const synchronize = async () => {
            setIsOnline(navigator.onLine);
            if (!token || !navigator.onLine) {
                await refreshPending();
                return;
            }
            try {
                const count = await syncKioskScans(tenantSlug, token, undefined, showSuccess);
                if (active) setPendingCount(count);
            } catch {
                await refreshPending();
            }
        };
        void synchronize();
        window.addEventListener("online", synchronize);
        window.addEventListener("offline", synchronize);
        return () => {
            active = false;
            window.removeEventListener("online", synchronize);
            window.removeEventListener("offline", synchronize);
        };
    }, [showSuccess, tenantSlug, token]);

    const saveToken = () => {
        const trimmed = tokenInput.trim();
        if (!trimmed) return;
        localStorage.setItem(storageKey, trimmed);
        setToken(trimmed);
        setTokenInput("");
    };

    const resetDevice = () => {
        localStorage.removeItem(storageKey);
        setToken(null);
        setResetOpen(false);
        setLastResult(null);
    };

    const handleScan = useCallback(async (qrData: string) => {
        if (!token) return;
        try {
            const result = await recordKioskScan(tenantSlug, token, qrData, direction);
            setPendingCount(result.pending);
            if (result.status === "SYNCED" && result.data) {
                showSuccess(result.data);
                return;
            }
            if (result.status === "PENDING" || result.status === "SYNCING") {
                setLastResult({
                    status: "pending",
                    message: "Réseau indisponible : pointage conservé sur la tablette et envoyé automatiquement au retour d’Internet.",
                });
                if (window.navigator.vibrate) window.navigator.vibrate([80, 80, 80]);
            } else if (result.httpStatus === 401 || result.httpStatus === 403) {
                setLastResult({ status: "error", message: "Appareil non reconnu ou désactivé. Réinitialisez l'appareil." });
            } else if (result.httpStatus === 404) {
                setLastResult({ status: "not_found", message: "Élève introuvable pour ce code" });
            } else {
                setLastResult({ status: "error", message: "Pointage refusé par le serveur. Vérifiez l’appareil et le badge." });
            }
        } catch {
            setLastResult({ status: "error", message: "File locale pleine ou indisponible. Rétablissez Internet avant de continuer." });
        }
        setTimeout(() => setLastResult(null), 3000);
    }, [direction, showSuccess, tenantSlug, token]);

    if (!token) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
                <Card className="w-full max-w-sm">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <ScanLine className="h-5 w-5 text-primary" /> Configuration du kiosque
                        </CardTitle>
                        <CardDescription>
                            Collez le jeton fourni par l'administrateur pour activer cet appareil.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="kiosk-token">Jeton de l'appareil</Label>
                            <Input
                                id="kiosk-token"
                                value={tokenInput}
                                onChange={(e) => setTokenInput(e.target.value)}
                                placeholder="Collez le jeton ici"
                                autoFocus
                            />
                        </div>
                        <Button className="w-full" disabled={!tokenInput.trim()} onClick={saveToken}>
                            Activer l'appareil
                        </Button>
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-background flex flex-col p-4 gap-4">
            <div className="flex items-center justify-between">
                <h1 className="text-lg font-bold flex items-center gap-2">
                    <ScanLine className="h-5 w-5 text-primary" /> Kiosque de présence
                </h1>
                <Button variant="ghost" size="icon" onClick={() => setResetOpen(true)}>
                    <Settings className="h-5 w-5 text-muted-foreground" />
                </Button>
            </div>

            <div className="flex justify-center gap-2">
                <Button
                    variant={direction === "IN" ? "default" : "outline"}
                    className="flex-1 max-w-[160px] gap-2"
                    onClick={() => setDirection("IN")}
                >
                    <LogIn className="h-4 w-4" /> Entrée
                </Button>
                <Button
                    variant={direction === "OUT" ? "default" : "outline"}
                    className="flex-1 max-w-[160px] gap-2"
                    onClick={() => setDirection("OUT")}
                >
                    <LogOut className="h-4 w-4" /> Sortie
                </Button>
            </div>

            <div className="flex-1 flex items-center justify-center">
                <div className="w-full max-w-md">
                    <QRScanner
                        onScan={handleScan}
                        onClose={() => {}}
                        continuous
                        scanDelay={2500}
                    />
                </div>
            </div>

            {lastResult && (
                <div className="fixed inset-x-4 bottom-8 mx-auto max-w-md space-y-2 animate-in slide-in-from-bottom-4">
                    <div
                        className={`rounded-lg shadow-lg p-4 flex items-center gap-3 ${
                            lastResult.status === "success"
                                ? "bg-emerald-600 text-white"
                                : lastResult.status === "pending"
                                    ? "bg-amber-500 text-amber-950"
                                    : "bg-destructive text-destructive-foreground"
                        }`}
                    >
                        {lastResult.status === "success" ? (
                            <CheckCircle2 className="h-6 w-6 shrink-0" />
                        ) : lastResult.status === "pending" ? (
                            <WifiOff className="h-6 w-6 shrink-0" />
                        ) : (
                            <XCircle className="h-6 w-6 shrink-0" />
                        )}
                        <span className="font-medium">{lastResult.message}</span>
                    </div>
                    {!!lastResult.libraryOverdueTitles?.length && (
                        <div className="rounded-lg shadow-lg p-4 flex items-start gap-3 bg-amber-500 text-amber-950">
                            <BookX className="h-6 w-6 shrink-0 mt-0.5" />
                            <div>
                                <p className="font-semibold">Livre(s) en retard à la bibliothèque :</p>
                                <ul className="list-disc list-inside text-sm">
                                    {lastResult.libraryOverdueTitles.map((title) => (
                                        <li key={title}>{title}</li>
                                    ))}
                                </ul>
                            </div>
                        </div>
                    )}
                </div>
            )}

            <div className="flex justify-center">
                <Badge variant="outline" className="gap-1 text-muted-foreground">
                    {!isOnline && <WifiOff className="h-3 w-3" />}
                    Mode {direction === "IN" ? "Entrée" : "Sortie"} actif
                    {pendingCount > 0 ? ` — ${pendingCount} en attente` : " — synchronisé"}
                </Badge>
            </div>

            <AlertDialog open={resetOpen} onOpenChange={setResetOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Réinitialiser cet appareil ?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Le jeton enregistré sur cet appareil sera supprimé localement. Il
                            faudra le saisir à nouveau pour réutiliser le kiosque (l'appareil
                            restera actif côté serveur tant qu'il n'est pas révoqué par un
                            administrateur).
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Annuler</AlertDialogCancel>
                        <AlertDialogAction onClick={resetDevice}>Réinitialiser</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
