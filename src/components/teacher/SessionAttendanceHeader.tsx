import { QrCode } from "lucide-react";

export const SessionAttendanceHeader = () => {
    return (
        <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
                <QrCode className="h-8 w-8" />
                Pointage par QR Code
            </h1>
            <p className="text-muted-foreground">
                Scanner les badges QR pour enregistrer la présence pendant un cours
            </p>
        </div>
    );
};
