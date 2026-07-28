import { useState, useCallback, useMemo } from "react";
import { useParams } from "react-router-dom";
import axios from "axios";
import { apiClient } from "@/api/client";
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
import { ScanLine, LogIn, LogOut, Settings, CheckCircle2, XCircle } from "lucide-react";

function tokenStorageKey(tenantSlug: string) {
    return `schoolflow:kiosk_token:${tenantSlug}`;
}

// Deliberately NOT using apiClient here: apiClient's response interceptor
// treats any 401 as an expired staff session and dispatches a logout/
// redirect-to-/auth event. A kiosk has no staff session — a 401 here just
// means the device token is missing/revoked, and must never bounce the
// kiosk to a login screen it can't use.
const kioskAxios = axios.create({ baseURL: apiClient.defaults.baseURL, timeout: 15_000 });

type ScanResult = {
    status: "success" | "not_found" | "error";
    message: string;
};

export default function KioskScanPage() {
    const { tenantSlug = "" } = useParams<{ tenantSlug: string }>();
    const storageKey = useMemo(() => tokenStorageKey(tenantSlug), [tenantSlug]);
    const [token, setToken] = useState<string | null>(() => localStorage.getItem(storageKey));
    const [tokenInput, setTokenInput] = useState("");
    const [direction, setDirection] = useState<"IN" | "OUT">("IN");
    const [lastResult, setLastResult] = useState<ScanResult | null>(null);
    const [resetOpen, setResetOpen] = useState(false);

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
            const { data } = await kioskAxios.post(
                "/kiosk/scan/",
                { qr_payload: qrData, direction },
                { headers: { "X-Kiosk-Token": token } },
            );
            setLastResult({
                status: "success",
                message: `${data.student_first_name} ${data.student_last_name} — ${data.direction === "IN" ? "Entrée" : "Sortie"} enregistrée`,
            });
            if (window.navigator.vibrate) window.navigator.vibrate(100);
        } catch (err: any) {
            const httpStatus = err?.response?.status;
            if (httpStatus === 401 || httpStatus === 403) {
                setLastResult({ status: "error", message: "Appareil non reconnu ou désactivé. Réinitialisez l'appareil." });
            } else if (httpStatus === 404) {
                setLastResult({ status: "not_found", message: "Élève introuvable pour ce code" });
            } else {
                setLastResult({ status: "error", message: "Erreur de connexion, réessayez" });
            }
        } finally {
            setTimeout(() => setLastResult(null), 3000);
        }
    }, [token, direction]);

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
                <div
                    className={`fixed inset-x-4 bottom-8 mx-auto max-w-md rounded-lg shadow-lg p-4 flex items-center gap-3 animate-in slide-in-from-bottom-4 ${
                        lastResult.status === "success" ? "bg-emerald-600 text-white" : "bg-destructive text-destructive-foreground"
                    }`}
                >
                    {lastResult.status === "success" ? (
                        <CheckCircle2 className="h-6 w-6 shrink-0" />
                    ) : (
                        <XCircle className="h-6 w-6 shrink-0" />
                    )}
                    <span className="font-medium">{lastResult.message}</span>
                </div>
            )}

            <div className="flex justify-center">
                <Badge variant="outline" className="gap-1 text-muted-foreground">
                    Mode {direction === "IN" ? "Entrée" : "Sortie"} actif
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
