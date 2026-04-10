import { useState } from "react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface ReconnectModalProps {
    open: boolean;
    onReconnect: () => void;
    onCancel: () => void;
}

export function ReconnectModal({ open, onReconnect, onCancel }: ReconnectModalProps) {
    return (
        <AlertDialog open={open}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <div className="flex items-center gap-2 text-amber-600">
                        <AlertTriangle className="h-5 w-5" />
                        <AlertDialogTitle>Session expirée</AlertDialogTitle>
                    </div>
                    <AlertDialogDescription className="space-y-2">
                        <p>Votre session a expiré pendant le processus d'inscription.</p>
                        <p className="font-medium">Votre progression a été sauvegardée automatiquement.</p>
                        <p>Veuillez vous reconnecter pour continuer.</p>
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel onClick={onCancel}>Annuler</AlertDialogCancel>
                    <AlertDialogAction onClick={onReconnect} className="gap-2">
                        <RefreshCw className="h-4 w-4" />
                        Se reconnecter
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}

interface ResumeModalProps {
    open: boolean;
    savedStep: number;
    onResume: () => void;
    onStartFresh: () => void;
}

export function ResumeModal({ open, savedStep, onResume, onStartFresh }: ResumeModalProps) {
    return (
        <AlertDialog open={open}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Reprendre l'inscription ?</AlertDialogTitle>
                    <AlertDialogDescription className="space-y-2">
                        <p>Nous avons détecté une inscription en cours.</p>
                        <p className="font-medium">
                            Dernière étape complétée : Étape {savedStep - 1}/4
                        </p>
                        <p>Souhaitez-vous reprendre où vous vous étiez arrêté ?</p>
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel onClick={onStartFresh}>
                        Recommencer
                    </AlertDialogCancel>
                    <AlertDialogAction onClick={onResume}>
                        Reprendre
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}
