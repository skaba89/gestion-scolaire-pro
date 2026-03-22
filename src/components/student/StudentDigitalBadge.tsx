import { QRCodeSVG } from "qrcode.react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogDescription
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { QrCode, User, School, Download } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useTenant } from "@/contexts/TenantContext";

interface StudentDigitalBadgeProps {
    student: {
        id: string;
        first_name: string;
        last_name: string;
        registration_number?: string;
        photo_url?: string;
    };
    className?: string;
}

export const StudentDigitalBadge = ({ student, className }: StudentDigitalBadgeProps) => {
    const { tenant } = useTenant();

    const handleDownload = () => {
        const svg = document.getElementById("student-qr-code");
        if (!svg) return;

        const svgData = new XMLSerializer().serializeToString(svg);
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        const img = new Image();

        img.onload = () => {
            canvas.width = img.width;
            canvas.height = img.height;
            ctx?.drawImage(img, 0, 0);
            const pngFile = canvas.toDataURL("image/png");
            const downloadLink = document.createElement("a");
            downloadLink.download = `badge_${student.registration_number || student.id}.png`;
            downloadLink.href = pngFile;
            downloadLink.click();
        };

        img.src = "data:image/svg+xml;base64," + btoa(svgData);
    };

    return (
        <Dialog>
            <DialogTrigger asChild>
                <Button
                    variant="outline"
                    className={`flex items-center gap-2 border-primary/20 hover:border-primary/50 hover:bg-primary/5 transition-all shadow-sm rounded-xl px-6 py-6 h-auto ${className}`}
                >
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
                        <QrCode className="w-6 h-6" />
                    </div>
                    <div className="text-left">
                        <p className="font-bold text-sm">Mon Badge Numérique</p>
                        <p className="text-xs text-muted-foreground">Scanner pour pointage</p>
                    </div>
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md bg-gradient-to-br from-background to-muted/30 border-primary/20">
                <DialogHeader>
                    <DialogTitle className="text-center font-display text-2xl font-bold">Badge Scolaire</DialogTitle>
                    <DialogDescription className="text-center">
                        Présentez ce code au scanner lors de vos entrées et sorties.
                    </DialogDescription>
                </DialogHeader>

                <div className="flex flex-col items-center justify-center py-6 space-y-6">
                    {/* Virtual Card */}
                    <div className="w-full max-w-[300px] bg-card border shadow-xl rounded-3xl overflow-hidden relative group">
                        <div className="absolute top-0 left-0 w-full h-24 bg-primary/10 -z-10" />

                        <div className="p-6 flex flex-col items-center space-y-4">
                            {/* Photo & Logo Header */}
                            <div className="flex justify-between w-full items-start">
                                <div className="bg-primary/10 p-2 rounded-xl">
                                    {tenant?.logo_url ? (
                                        <img src={tenant.logo_url} alt="School Logo" className="w-8 h-8 object-contain" />
                                    ) : (
                                        <School className="w-6 h-6 text-primary" />
                                    )}
                                </div>
                                <Badge variant="outline" className="text-[10px] uppercase font-bold tracking-wider">
                                    Élève Officiel
                                </Badge>
                            </div>

                            {/* Student Photo */}
                            <div className="w-24 h-24 rounded-2xl border-4 border-background shadow-lg overflow-hidden bg-muted">
                                {student.photo_url ? (
                                    <img src={student.photo_url} alt="Student" className="w-full h-full object-cover" />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center bg-primary/5">
                                        <User className="w-12 h-12 text-primary/20" />
                                    </div>
                                )}
                            </div>

                            {/* Identity */}
                            <div className="text-center">
                                <h3 className="text-xl font-bold font-display uppercase tracking-tight">
                                    {student.first_name} {student.last_name}
                                </h3>
                                {student.registration_number && (
                                    <p className="text-sm font-mono text-muted-foreground font-bold mt-1">
                                        ID: {student.registration_number}
                                    </p>
                                )}
                            </div>

                            {/* QR Code */}
                            <div className="bg-white p-4 rounded-2xl shadow-inner border border-muted/50">
                                <QRCodeSVG
                                    id="student-qr-code"
                                    value={student.id}
                                    size={150}
                                    level="H"
                                    includeMargin={false}
                                />
                            </div>

                            {/* Footer */}
                            <p className="text-[10px] text-muted-foreground italic text-center">
                                Propriété de {tenant?.name || "l'établissement"} • {new Date().getFullYear()}
                            </p>
                        </div>
                    </div>

                    <div className="flex w-full gap-3">
                        <Button onClick={handleDownload} variant="secondary" className="flex-1 gap-2">
                            <Download className="w-4 h-4" /> Enregistrer
                        </Button>
                        <Button onClick={() => window.print()} variant="outline" className="flex-1 gap-2">
                            Imprimer
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
};
