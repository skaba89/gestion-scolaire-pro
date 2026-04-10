import { useState, useCallback } from "react";
import { useTenant } from "@/contexts/TenantContext";
import { useStudentLabel } from "@/hooks/useStudentLabel";
import { apiClient } from "@/api/client";
import QRScanner from "@/components/badges/QRScanner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
    Clock,
    UserCheck,
    ArrowLeft,
    Vibrate,
    ScanLine,
    History
} from "lucide-react";
import { useTenantNavigate } from "@/hooks/useTenantNavigate";
import { toast } from "sonner";

interface ScanLog {
    id: string;
    studentName: string;
    timestamp: Date;
    status: "success" | "already_present" | "not_found";
}

export default function QrScanPage() {
    const { tenant } = useTenant();
    const navigate = useTenantNavigate();
    const { studentLabel } = useStudentLabel();
    const [scanLogs, setScanLogs] = useState<ScanLog[]>([]);
    const [isScanning, setIsScanning] = useState(true);

    const handleScan = useCallback(async (qrData: string) => {
        try {
            // Simplified student identification: QRs in this system 
            // usually contain the student ID or registration number.
            // Let's assume registration number for better searchability.

            const response = await apiClient.get<any>("/students/", {
                params: { search: qrData }
            });
            const students = response.data?.results || response.data || [];
            const student = students.find(
                (s: any) => s.id === qrData || s.registration_number === qrData
            ) || (students.length === 1 ? students[0] : null);

            if (!student) {
                const newLog: ScanLog = {
                    id: qrData,
                    studentName: "Inconnu (" + qrData + ")",
                    timestamp: new Date(),
                    status: "not_found"
                };
                setScanLogs(prev => [newLog, ...prev.slice(0, 19)]);
                toast.error("Étudiant non trouvé");
                return;
            }

            // Log attendance via API
            await apiClient.post("/school-life/check-ins/", {
                student_id: student.id,
                tenant_id: tenant?.id,
                method: "QR_SCAN"
            });

            const newLog: ScanLog = {
                id: student.id,
                studentName: `${student.first_name} ${student.last_name}`,
                timestamp: new Date(),
                status: "success"
            };

            setScanLogs(prev => [newLog, ...prev.slice(0, 19)]);
            toast.success(`Présence enregistrée: ${student.first_name}`);

            // Haptic feedback (simulated for web, works on some browsers)
            if (window.navigator.vibrate) {
                window.navigator.vibrate(100);
            }
        } catch (err) {
            toast.error("Erreur de traitement");
        }
    }, [tenant?.id, toast]);

    return (
        <div className="flex flex-col h-[calc(100vh-4rem)] md:h-full gap-4 pb-4">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Button variant="ghost" size="icon" onClick={() => navigate("/admin")}>
                        <ArrowLeft className="h-5 w-5" />
                    </Button>
                    <div>
                        <h1 className="text-xl font-bold flex items-center gap-2">
                            <ScanLine className="h-6 w-6 text-primary" />
                            Scan Présence
                        </h1>
                        <p className="text-xs text-muted-foreground italic">Optimisé pour mobile</p>
                    </div>
                </div>
                <Badge variant="outline" className="gap-1 animate-pulse border-primary/50 text-primary">
                    <span className="w-2 h-2 bg-primary rounded-full" />
                    Live
                </Badge>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 flex-1 overflow-hidden">
                {/* Scanner Section */}
                <Card className="flex flex-col overflow-hidden border-2 border-primary/10 shadow-lg">
                    <CardHeader className="bg-muted/50 pb-2">
                        <CardTitle className="text-sm font-medium uppercase tracking-wider flex items-center gap-2">
                            <UserCheck className="h-4 w-4" /> Scanner des Badges
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="flex-1 flex flex-col p-4 justify-center">
                        <div className="max-w-md mx-auto w-full">
                            <QRScanner
                                onScan={handleScan}
                                onClose={() => setIsScanning(false)}
                                continuous={true}
                                scanDelay={2500}
                            />
                        </div>
                    </CardContent>
                </Card>

                {/* History Section */}
                <Card className="flex flex-col overflow-hidden shadow-md">
                    <CardHeader className="border-b bg-muted/30">
                        <CardTitle className="text-sm font-medium uppercase tracking-wider flex items-center gap-2">
                            <History className="h-4 w-4" /> Historique de Session
                        </CardTitle>
                        <CardDescription>Les 20 derniers scans de cette session</CardDescription>
                    </CardHeader>
                    <CardContent className="p-0 flex-1 overflow-hidden">
                        <ScrollArea className="h-full">
                            <div className="p-4 space-y-3">
                                {scanLogs.length === 0 ? (
                                    <div className="text-center py-12 text-muted-foreground italic">
                                        Aucun scan pour le moment...
                                    </div>
                                ) : (
                                    scanLogs.map((log, index) => (
                                        <div
                                            key={`${log.id}-${index}`}
                                            className="flex items-center justify-between p-3 rounded-lg border bg-card/50 hover:bg-muted/50 transition-colors animate-in slide-in-from-right-2 duration-300"
                                        >
                                            <div className="flex flex-col">
                                                <span className="font-semibold text-sm">{log.studentName}</span>
                                                <div className="flex items-center gap-2 text-[10px] text-muted-foreground uppercase">
                                                    <Clock className="h-3 w-3" />
                                                    {log.timestamp.toLocaleTimeString()}
                                                </div>
                                            </div>
                                            <Badge
                                                variant={log.status === "success" ? "default" : "destructive"}
                                                className="text-[10px]"
                                            >
                                                {log.status === "success" ? "Validé" : "Erreur"}
                                            </Badge>
                                        </div>
                                    ))
                                )}
                            </div>
                        </ScrollArea>
                    </CardContent>
                </Card>
            </div>

            {/* Bottom Actions for Mobile */}
            <div className="flex justify-center md:hidden pt-2">
                <Button
                    variant="outline"
                    className="w-full rounded-full gap-2 text-muted-foreground"
                    onClick={() => setScanLogs([])}
                >
                    Réinitialiser session
                </Button>
            </div>
        </div>
    );
}
