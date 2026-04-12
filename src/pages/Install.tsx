import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Download,
  Smartphone,
  Monitor,
  CheckCircle,
  Share,
  Plus,
  Wifi,
  WifiOff,
  Bell,
  Zap,
  Shield,
  RefreshCw
} from "lucide-react";
import { useOfflineStorage } from "@/hooks/useOfflineStorage";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const Install = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const { isOnline, pendingItems } = useOfflineStorage();

  useEffect(() => {
    // Check if already installed
    const standalone = window.matchMedia("(display-mode: standalone)").matches;
    setIsStandalone(standalone);

    // Check if iOS
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent);
    setIsIOS(ios);

    // Listen for install prompt
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstall);
    window.addEventListener("appinstalled", handleAppInstalled);

    // Check for service worker updates
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then((registration) => {
        registration.addEventListener('updatefound', () => {
          setUpdateAvailable(true);
        });
      });
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;

    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;

    if (outcome === "accepted") {
      setIsInstalled(true);
    }
    setDeferredPrompt(null);
  };

  const handleUpdate = () => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then((registration) => {
        registration.update();
        window.location.reload();
      });
    }
  };

  if (isStandalone) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 p-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
              <CheckCircle className="h-8 w-8 text-green-600" />
            </div>
            <CardTitle className="text-2xl">Application installée !</CardTitle>
            <CardDescription>
              Vous utilisez déjà l'application en mode application.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Connection Status */}
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted">
              {isOnline ? (
                <>
                  <Wifi className="h-5 w-5 text-green-500" />
                  <div>
                    <p className="font-medium text-sm">Connecté</p>
                    <p className="text-xs text-muted-foreground">Toutes les fonctionnalités disponibles</p>
                  </div>
                </>
              ) : (
                <>
                  <WifiOff className="h-5 w-5 text-amber-500" />
                  <div>
                    <p className="font-medium text-sm">Mode hors-ligne</p>
                    <p className="text-xs text-muted-foreground">
                      {pendingItems.length > 0
                        ? `${pendingItems.length} élément(s) en attente de synchronisation`
                        : "Données en cache disponibles"
                      }
                    </p>
                  </div>
                </>
              )}
            </div>

            {/* Update Available */}
            {updateAvailable && (
              <Button onClick={handleUpdate} variant="outline" className="w-full">
                <RefreshCw className="h-4 w-4 mr-2" />
                Mettre à jour l'application
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 p-4">
      <div className="max-w-4xl mx-auto py-12">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-white mb-4">Installer l'application</h1>
          <p className="text-xl text-blue-200">
            Accédez rapidement à votre espace depuis votre écran d'accueil
          </p>

          {/* Connection Status Banner */}
          <div className={`inline-flex items-center gap-2 mt-4 px-4 py-2 rounded-full ${isOnline ? "bg-green-500/20 text-green-300" : "bg-amber-500/20 text-amber-300"
            }`}>
            {isOnline ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}
            <span className="text-sm font-medium">
              {isOnline ? "Connecté" : "Mode hors-ligne"}
            </span>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Android/Desktop Install */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="p-3 bg-green-100 rounded-lg">
                  <Smartphone className="h-6 w-6 text-green-600" />
                </div>
                <div>
                  <CardTitle>Android & Desktop</CardTitle>
                  <CardDescription>Chrome, Edge, Firefox</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {isInstalled ? (
                <div className="flex items-center gap-2 text-green-600">
                  <CheckCircle className="h-5 w-5" />
                  <span>Application installée avec succès !</span>
                </div>
              ) : deferredPrompt ? (
                <Button onClick={handleInstall} className="w-full" size="lg">
                  <Download className="h-5 w-5 mr-2" />
                  Installer maintenant
                </Button>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Cliquez sur le bouton d'installation dans la barre d'adresse de votre navigateur, ou :
                  </p>
                  <ol className="list-decimal list-inside space-y-2 text-sm">
                    <li>Ouvrez le menu du navigateur (⋮)</li>
                    <li>Sélectionnez "Installer l'application" ou "Ajouter à l'écran d'accueil"</li>
                    <li>Confirmez l'installation</li>
                  </ol>
                </div>
              )}
            </CardContent>
          </Card>

          {/* iOS Install */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="p-3 bg-blue-100 rounded-lg">
                  <Monitor className="h-6 w-6 text-blue-600" />
                </div>
                <div>
                  <CardTitle>iPhone & iPad</CardTitle>
                  <CardDescription>Safari uniquement</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Pour installer sur iOS, suivez ces étapes :
                </p>
                <ol className="space-y-4">
                  <li className="flex items-start gap-3">
                    <Badge variant="outline" className="mt-0.5">1</Badge>
                    <div>
                      <p className="font-medium">Ouvrez Safari</p>
                      <p className="text-sm text-muted-foreground">L'installation ne fonctionne qu'avec Safari</p>
                    </div>
                  </li>
                  <li className="flex items-start gap-3">
                    <Badge variant="outline" className="mt-0.5">2</Badge>
                    <div className="flex items-center gap-2">
                      <p className="font-medium">Appuyez sur</p>
                      <div className="p-1 bg-muted rounded">
                        <Share className="h-5 w-5" />
                      </div>
                      <p className="font-medium">Partager</p>
                    </div>
                  </li>
                  <li className="flex items-start gap-3">
                    <Badge variant="outline" className="mt-0.5">3</Badge>
                    <div className="flex items-center gap-2">
                      <p className="font-medium">Sélectionnez</p>
                      <div className="p-1 bg-muted rounded">
                        <Plus className="h-5 w-5" />
                      </div>
                      <p className="font-medium">"Sur l'écran d'accueil"</p>
                    </div>
                  </li>
                  <li className="flex items-start gap-3">
                    <Badge variant="outline" className="mt-0.5">4</Badge>
                    <p className="font-medium">Appuyez sur "Ajouter"</p>
                  </li>
                </ol>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Enhanced Features */}
        <Card className="mt-8">
          <CardHeader>
            <CardTitle>Pourquoi installer l'application ?</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="text-center">
                <div className="mx-auto w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-3">
                  <Download className="h-6 w-6 text-primary" />
                </div>
                <h3 className="font-medium mb-1">Accès rapide</h3>
                <p className="text-sm text-muted-foreground">
                  Lancez l'application directement depuis votre écran d'accueil
                </p>
              </div>
              <div className="text-center">
                <div className="mx-auto w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-3">
                  <WifiOff className="h-6 w-6 text-primary" />
                </div>
                <h3 className="font-medium mb-1">Mode hors-ligne</h3>
                <p className="text-sm text-muted-foreground">
                  Consultez vos données même sans connexion internet
                </p>
              </div>
              <div className="text-center">
                <div className="mx-auto w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-3">
                  <Bell className="h-6 w-6 text-primary" />
                </div>
                <h3 className="font-medium mb-1">Notifications</h3>
                <p className="text-sm text-muted-foreground">
                  Recevez des alertes en temps réel sur votre appareil
                </p>
              </div>
              <div className="text-center">
                <div className="mx-auto w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-3">
                  <Zap className="h-6 w-6 text-primary" />
                </div>
                <h3 className="font-medium mb-1">Performance</h3>
                <p className="text-sm text-muted-foreground">
                  Chargement ultra-rapide grâce au cache intelligent
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Offline Capabilities */}
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Fonctionnalités hors-ligne
            </CardTitle>
            <CardDescription>
              Ces fonctionnalités restent disponibles même sans connexion internet
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-3 gap-4">
              <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                <CheckCircle className="h-5 w-5 text-green-500 mt-0.5" />
                <div>
                  <p className="font-medium text-sm">Consultation des données</p>
                  <p className="text-xs text-muted-foreground">Accédez aux données déjà chargées</p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                <CheckCircle className="h-5 w-5 text-green-500 mt-0.5" />
                <div>
                  <p className="font-medium text-sm">Navigation dans l'app</p>
                  <p className="text-xs text-muted-foreground">Parcourez toutes les pages de l'application</p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                <CheckCircle className="h-5 w-5 text-green-500 mt-0.5" />
                <div>
                  <p className="font-medium text-sm">Synchronisation auto</p>
                  <p className="text-xs text-muted-foreground">Les modifications sont envoyées à la reconnexion</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Install;
