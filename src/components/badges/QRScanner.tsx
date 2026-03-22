import { useEffect, useRef, useState, useCallback } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Camera, CameraOff, AlertTriangle, CheckCircle2 } from "lucide-react";

interface QRScannerProps {
  onScan: (data: string) => void;
  onClose: () => void;
  continuous?: boolean;
  scanDelay?: number; // Delay between scans of the SAME code in ms
}

export default function QRScanner({ onScan, onClose, continuous = false, scanDelay = 3000 }: QRScannerProps) {
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastScan, setLastScan] = useState<{ data: string; time: number } | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const startScanner = async () => {
    try {
      setError(null);

      if (!scannerRef.current) {
        scannerRef.current = new Html5Qrcode("qr-reader");
      }

      const cameras = await Html5Qrcode.getCameras();

      if (cameras.length === 0) {
        setError("Aucune caméra détectée");
        return;
      }

      const preferredCamera = cameras.find(c =>
        c.label.toLowerCase().includes("back") ||
        c.label.toLowerCase().includes("arrière")
      ) || cameras[0];

      await scannerRef.current.start(
        preferredCamera.id,
        {
          fps: 15,
          qrbox: { width: 280, height: 280 },
          aspectRatio: 1,
        },
        (decodedText) => {
          handleScan(decodedText);
        },
        () => {
          // Scanning...
        }
      );

      setIsScanning(true);
    } catch (err: any) {
      console.error("Error starting scanner:", err);
      if (err.message?.includes("Permission denied") || err.name === "NotAllowedError") {
        setError("Accès à la caméra refusé.");
      } else {
        setError("Impossible de démarrer le scanner.");
      }
    }
  };

  const handleScan = useCallback((data: string) => {
    const now = Date.now();

    // Throttle: ignore if it's the same code scanned within scanDelay
    if (lastScan && lastScan.data === data && now - lastScan.time < scanDelay) {
      return;
    }

    setLastScan({ data, time: now });
    setShowSuccess(true);
    onScan(data);

    // Visual feedback duration
    setTimeout(() => setShowSuccess(false), 800);

    if (!continuous) {
      stopScanner();
    }
  }, [continuous, lastScan, onScan, scanDelay]);

  const stopScanner = async () => {
    if (scannerRef.current && isScanning) {
      try {
        await scannerRef.current.stop();
        setIsScanning(false);
      } catch (err) {
        console.error("Error stopping scanner:", err);
      }
    }
  };

  useEffect(() => {
    return () => {
      if (scannerRef.current?.isScanning) {
        scannerRef.current.stop().catch(console.error);
      }
    };
  }, []);

  return (
    <div className="space-y-4 relative">
      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="relative overflow-hidden rounded-lg border-2 border-primary/20 bg-muted">
        <div
          id="qr-reader"
          ref={containerRef}
          className="w-full aspect-square"
        />

        {/* Visual Feedback Overlay */}
        {showSuccess && (
          <div className="absolute inset-0 bg-green-500/20 flex items-center justify-center animate-in fade-in zoom-in duration-300">
            <div className="bg-white rounded-full p-4 shadow-xl ring-4 ring-green-500 animate-bounce">
              <CheckCircle2 className="h-12 w-12 text-green-500" />
            </div>
          </div>
        )}

        {/* Scan Area Indicators */}
        <div className="absolute inset-0 pointer-events-none border-[40px] border-black/40">
          <div className="w-full h-full border-2 border-primary/60 border-dashed" />
        </div>
      </div>

      <div className="flex gap-2">
        {!isScanning ? (
          <Button onClick={startScanner} className="flex-1 h-12 text-lg">
            <Camera className="h-5 w-5 mr-2" />
            Activer le Lecteur
          </Button>
        ) : (
          <Button onClick={stopScanner} variant="outline" className="flex-1 h-12 text-lg">
            <CameraOff className="h-5 w-5 mr-2" />
            Pause
          </Button>
        )}
        <Button variant="ghost" onClick={onClose} className="h-12">
          Fermer
        </Button>
      </div>

      <p className="text-sm text-center text-muted-foreground flex items-center justify-center gap-2">
        {continuous ? (
          <span className="flex items-center gap-1.5 text-emerald-600 font-medium">
            <span className="w-2 h-2 bg-emerald-500 rounded-full animate-ping" />
            Mode Multi-Scan Actif
          </span>
        ) : (
          "Placez le QR code face à la caméra"
        )}
      </p>
    </div>
  );
}
