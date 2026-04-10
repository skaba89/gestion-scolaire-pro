import { useState, useEffect } from 'react';
import { apiClient } from '@/api/client';
import { useAuth } from '@/contexts/AuthContext';
import { gdprService, DeletionRequest } from '@/lib/gdpr-service';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { Download, Trash2, Shield, FileText, AlertTriangle, CheckCircle } from 'lucide-react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function RGPDSettings() {
    const { user, profile } = useAuth();
    const [isExporting, setIsExporting] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [confirmText, setConfirmText] = useState('');
    const [exportHistory, setExportHistory] = useState<any[]>([]);

    const handleExportData = async () => {
        if (!user) return;

        setIsExporting(true);
        try {
            const data = await gdprService.exportUserData(user.id);
            gdprService.downloadDataAsJson(data as Record<string, unknown>, `mes-donnees-schoolflow-${new Date().toISOString().split('T')[0]}.json`);
            toast.success('Vos données ont été exportées avec succès', { description: 'Le fichier JSON a été téléchargé' });
            loadExportHistory();
        } catch (error: any) {
            toast.error('Erreur lors de l\'export', { description: error?.response?.data?.detail || error.message || 'Une erreur est survenue' });
        } finally {
            setIsExporting(false);
        }
    };

    const loadExportHistory = async () => {
        if (!user) return;
        try {
            const { data } = await apiClient.get('/settings/audit-logs/', {
                params: { user_id: user.id, action: 'RGPD_DATA_EXPORT', limit: 10 },
            });
            setExportHistory(Array.isArray(data) ? data : []);
        } catch (error: any) {
            toast.error("Impossible de charger l'historique des exports", {
                description: error?.response?.data?.detail || error.message || 'Veuillez réessayer plus tard',
            });
        }
    };

    const [deletionRequests, setDeletionRequests] = useState<DeletionRequest[]>([]);

    const loadDeletionRequests = async () => {
        if (!user) return;
        try {
            const data = await gdprService.getMyDeletionRequests();
            setDeletionRequests(data);
        } catch (error: any) {
            toast.error("Impossible de charger les demandes de suppression", {
                description: error?.response?.data?.detail || error.message || 'Veuillez réessayer plus tard',
            });
        }
    };

    const handleDeleteAccount = async () => {
        if (!user || confirmText !== 'SUPPRIMER') return;

        setIsDeleting(true);
        try {
            await gdprService.requestDeletion('User request - RGPD Article 17');
            toast.success('Demande de suppression envoyée', { description: 'Un administrateur examinera votre demande sous 48h' });
            setDeleteDialogOpen(false);
            setConfirmText('');
            loadDeletionRequests();
        } catch (error: any) {
            toast.error('Erreur lors de la demande', { description: error?.response?.data?.detail || error.message || 'Une erreur est survenue' });
        } finally {
            setIsDeleting(false);
        }
    };

    useEffect(() => {
        loadExportHistory();
        loadDeletionRequests();
    }, [user]);

    return (
        <div className="container max-w-4xl py-8 space-y-6">
            <div>
                <h1 className="text-3xl font-bold flex items-center gap-2">
                    <Shield className="h-8 w-8 text-primary" />
                    Mes Données RGPD
                </h1>
                <p className="text-muted-foreground mt-2">
                    Gérez vos données personnelles conformément au Règlement Général sur la Protection des Données
                </p>
            </div>

            <Separator />

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Download className="h-5 w-5" />
                        Exporter mes données
                    </CardTitle>
                    <CardDescription>
                        Téléchargez une copie complète de toutes vos données personnelles (Article 20 RGPD)
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <Alert>
                        <FileText className="h-4 w-4" />
                        <AlertDescription>
                            L'export inclut : profil, rôles, données académiques, factures, messages, historique de connexion, et consentements.
                        </AlertDescription>
                    </Alert>

                    <div className="flex items-center justify-between">
                        <div>
                            <p className="font-medium">Format : JSON</p>
                            <p className="text-sm text-muted-foreground">Fichier lisible et réutilisable</p>
                        </div>
                        <Button onClick={handleExportData} disabled={isExporting} className="gap-2">
                            <Download className="h-4 w-4" />
                            {isExporting ? 'Export en cours...' : 'Exporter mes données'}
                        </Button>
                    </div>

                    {exportHistory.length > 0 && (
                        <div className="mt-4 pt-4 border-t">
                            <p className="text-sm font-medium mb-2">Historique des exports</p>
                            <div className="space-y-2">
                                {exportHistory.slice(0, 5).map((export_item: any, index: number) => (
                                    <div key={index} className="flex items-center justify-between text-sm">
                                        <span className="text-muted-foreground">{new Date(export_item.created_at).toLocaleDateString('fr-FR', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                                        <span className="text-xs text-muted-foreground">{export_item.new_values?.export_size_kb ? `${Math.round(export_item.new_values.export_size_kb)} KB` : '-'}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <CheckCircle className="h-5 w-5" />
                        Conservation des données
                    </CardTitle>
                    <CardDescription>
                        Durées de conservation légales de vos données
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="space-y-3">
                        <div className="flex justify-between items-center"><span className="text-sm">Factures et paiements</span><span className="text-sm font-medium">10 ans</span></div>
                        <Separator />
                        <div className="flex justify-between items-center"><span className="text-sm">Notes et présences</span><span className="text-sm font-medium">Permanent</span></div>
                        <Separator />
                        <div className="flex justify-between items-center"><span className="text-sm">Messages et notifications</span><span className="text-sm font-medium">Supprimable</span></div>
                        <Separator />
                        <div className="flex justify-between items-center"><span className="text-sm">Historique de connexion</span><span className="text-sm font-medium">5 ans</span></div>
                    </div>
                    <Alert className="mt-4">
                        <AlertDescription className="text-xs">Base légale : Code de commerce Art. L123-22 (factures), Code de l'éducation Art. D211-10 (notes)</AlertDescription>
                    </Alert>
                </CardContent>
            </Card>

            <Card className="border-destructive">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-destructive">
                        <Trash2 className="h-5 w-5" />
                        Supprimer mon compte
                    </CardTitle>
                    <CardDescription>
                        Demander l'anonymisation de vos données personnelles (Article 17 RGPD)
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <Alert variant="destructive">
                        <AlertTriangle className="h-4 w-4" />
                        <AlertDescription>
                            <strong>Action irréversible :</strong> Vos données personnelles seront anonymisées.
                            Les données légales (factures, notes) seront conservées de manière anonyme.
                        </AlertDescription>
                    </Alert>

                    <div className="space-y-2 text-sm">
                        <p className="font-medium">Ce qui sera anonymisé :</p>
                        <ul className="list-disc list-inside space-y-1 text-muted-foreground ml-4">
                            <li>Nom, prénom, email, téléphone</li>
                            <li>Adresse et informations personnelles</li>
                            <li>Messages et notifications</li>
                            <li>Historique de connexion (sauf 10 derniers)</li>
                        </ul>
                    </div>

                    <div className="space-y-2 text-sm">
                        <p className="font-medium">Ce qui sera conservé (anonymisé) :</p>
                        <ul className="list-disc list-inside space-y-1 text-muted-foreground ml-4">
                            <li>Factures et paiements (obligation légale 10 ans)</li>
                            <li>Notes et présences (obligation légale permanente)</li>
                            <li>Audit logs critiques</li>
                        </ul>
                    </div>

                    {deletionRequests.length > 0 && (
                        <Alert className={deletionRequests[0].status === 'PENDING' ? "bg-muted" : ""}>
                            <AlertTriangle className="h-4 w-4" />
                            <AlertDescription className="flex items-center justify-between">
                                <span>
                                    Demande de suppression : <strong>{deletionRequests[0].status}</strong>
                                    {deletionRequests[0].status === 'PENDING' && " (en attente de validation)"}
                                    {deletionRequests[0].status === 'REJECTED' && ` - Motif : ${deletionRequests[0].rejection_reason}`}
                                </span>
                                <span className="text-xs text-muted-foreground">{new Date(deletionRequests[0].requested_at).toLocaleDateString()}</span>
                            </AlertDescription>
                        </Alert>
                    )}

                    <Button variant="destructive" onClick={() => setDeleteDialogOpen(true)} className="gap-2 w-full" disabled={deletionRequests.some(r => r.status === 'PENDING')}>
                        <Trash2 className="h-4 w-4" />
                        {deletionRequests.some(r => r.status === 'PENDING') ? 'Demande en cours de traitement' : 'Demander la suppression de mon compte'}
                    </Button>
                </CardContent>
            </Card>

            <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle className="text-destructive">Confirmer la suppression</DialogTitle>
                        <DialogDescription>Cette action est irréversible. Vos données personnelles seront définitivement anonymisées.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertDescription>Pour confirmer, tapez <strong>SUPPRIMER</strong> ci-dessous</AlertDescription></Alert>
                        <div className="space-y-2"><Label htmlFor="confirm">Confirmation</Label><Input id="confirm" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder="Tapez SUPPRIMER" className="font-mono" /></div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => { setDeleteDialogOpen(false); setConfirmText(''); }}>Annuler</Button>
                        <Button variant="destructive" onClick={handleDeleteAccount} disabled={confirmText !== 'SUPPRIMER' || isDeleting}>{isDeleting ? 'Envoi en cours...' : 'Confirmer la suppression'}</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
