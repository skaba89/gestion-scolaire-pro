import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import { useAuth } from '@/contexts/AuthContext';
import { useTenant } from '@/contexts/TenantContext';
import { gdprService, DeletionRequest, DeletionAction } from '@/lib/gdpr-service';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Shield, Search, Trash2, FileText, AlertTriangle, CheckCircle } from 'lucide-react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';

interface UserLegalData {
    user_id: string;
    legal_data: {
        invoices: { count: number; retention_period: string; legal_basis: string };
        payments: { count: number; retention_period: string; legal_basis: string };
        grades: { count: number; retention_period: string; legal_basis: string };
        attendance: { count: number; retention_period: string; legal_basis: string };
    };
    can_be_fully_deleted: boolean;
    message: string;
}

export default function AdminRGPDPanel() {
    const { t } = useTranslation();
    const { user, hasRole } = useAuth();
    const { tenant } = useTenant();
    const queryClient = useQueryClient();

    const isAdmin = hasRole('SUPER_ADMIN') || hasRole('TENANT_ADMIN') || hasRole('DIRECTOR');

    const [searchEmail, setSearchEmail] = useState('');
    const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [anonymizeDialogOpen, setAnonymizeDialogOpen] = useState(false);
    const [anonymizeReason, setAnonymizeReason] = useState('');
    const [isAnonymizing, setIsAnonymizing] = useState(false);
    const [isGeneratingReport, setIsGeneratingReport] = useState(false);
    const [activeTab, setActiveTab] = useState('requests');

    const { data: stats = { totalConsents: 0, anonymizedUsers: 0, pendingRequests: 0, complianceRisks: 0, totalExports: 0 } } = useQuery({
        queryKey: ['rgpd', 'stats'],
        queryFn: () => gdprService.getStats(),
        enabled: isAdmin,
        staleTime: 2 * 60 * 1000,
    });

    const { data: pendingRequests = [] } = useQuery({
        queryKey: ['rgpd', 'pending-requests'],
        queryFn: () => gdprService.getPendingRequests(),
        enabled: isAdmin,
        staleTime: 60 * 1000,
    });

    const { data: exportHistory = [] } = useQuery({
        queryKey: ['rgpd', 'export-history'],
        queryFn: async () => {
            const response = await apiClient.get('/rgpd/export-history');
            return response.data || [];
        },
        enabled: isAdmin,
        staleTime: 2 * 60 * 1000,
    });

    const { data: retentionRisks = [] } = useQuery({
        queryKey: ['rgpd', 'retention-risks'],
        queryFn: async () => {
            const response = await apiClient.get('/rgpd/retention-risks');
            return response.data || [];
        },
        enabled: isAdmin,
        staleTime: 5 * 60 * 1000,
    });

    const { data: legalData = null } = useQuery({
        queryKey: ['rgpd', 'legal-data', selectedUserId],
        queryFn: () => gdprService.checkLegalRetention(selectedUserId!),
        enabled: !!selectedUserId,
        staleTime: 60 * 1000,
    });

    // Process deletion request
    const handleProcessRequest = async (requestId: string, action: DeletionAction, reason?: string) => {
        setIsAnonymizing(true);
        try {
            await gdprService.processRequest(requestId, action, reason);
            toast.success(action === 'APPROVE' ? t("rgpd.anonymized") : t("rgpd.rejected"));
            queryClient.invalidateQueries({ queryKey: ['rgpd', 'pending-requests'] });
            queryClient.invalidateQueries({ queryKey: ['rgpd', 'stats'] });
        } catch (error: unknown) {
            toast.error(t("rgpd.processError"), {
                description: error instanceof Error ? error.message : t("rgpd.unknownError")
            });
        } finally {
            setIsAnonymizing(false);
        }
    };

    // Search user by email
    const handleSearchUser = async () => {
        if (!searchEmail) return;
        setIsLoading(true);
        try {
            const response = await apiClient.get('/rgpd/search', { params: { email: searchEmail } });
            if (response.data) {
                setSelectedUserId(response.data.id);
            } else {
                toast.error(t("rgpd.userNotFound"));
            }
        } catch {
            toast.error(t("rgpd.searchError"));
        } finally {
            setIsLoading(false);
        }
    };

    if (!isAdmin) {
        return (
            <div className="container max-w-4xl py-8">
                <Card>
                    <CardContent className="pt-6">
                        <p className="text-center text-muted-foreground">
                            {t("rgpd.adminOnly")}
                        </p>
                    </CardContent>
                </Card>
            </div>
        );
    }

    // Anonymize user (direct)
    const handleAnonymizeUser = async () => {
        if (!selectedUserId || !anonymizeReason) return;

        setIsAnonymizing(true);
        try {
            const response = await apiClient.post(`/rgpd/direct-delete/${selectedUserId}`, {
                reason: anonymizeReason,
            });

            toast.success('Utilisateur anonymisé avec succès', {
                description: response.data?.message || 'Anonymisation terminée',
            });

            setAnonymizeDialogOpen(false);
            setAnonymizeReason('');
            setSelectedUserId(null);
            setLegalData(null);
            setSearchEmail('');
            loadGlobalStats();
        } catch (error: any) {
            toast.error('Erreur lors de l\'anonymisation', {
                description: error.message,
            });
        } finally {
            setIsAnonymizing(false);
        }
    };

    const handleGenerateReport = async () => {
        setIsGeneratingReport(true);
        try {
            const logs = await gdprService.getComplianceAuditLogs();
            await gdprService.generateComplianceReportPDF(logs, tenant?.name);
            toast.success('Rapport de conformité généré');
        } catch (error: any) {
            toast.error('Erreur lors de la génération du rapport', {
                description: error.message,
            });
        } finally {
            setIsGeneratingReport(false);
        }
    };

    return (
        <div className="container max-w-6xl py-8 space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold flex items-center gap-2">
                        <Shield className="h-8 w-8 text-primary" />
                        {t("rgpd.pageTitle")}
                    </h1>
                    <p className="text-muted-foreground mt-2">
                        {t("rgpd.pageSubtitle")}
                    </p>
                </div>
                <Button
                    onClick={handleGenerateReport}
                    disabled={isGeneratingReport}
                    className="gap-2"
                >
                    <FileText className="h-4 w-4" />
                    {isGeneratingReport ? t("rgpd.generating") : t("rgpd.generateReport")}
                </Button>
            </div>

            {/* Compliance Dashboard */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">{t("rgpd.activeConsents")}</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats.totalConsents}</div>
                        <p className="text-xs text-muted-foreground">{t("rgpd.activeConsentsDesc")}</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">{t("rgpd.anonymizedAccounts")}</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats.anonymizedUsers}</div>
                        <p className="text-xs text-muted-foreground">{t("rgpd.anonymizedAccountsDesc")}</p>
                    </CardContent>
                </Card>
                <Card className={stats.pendingRequests > 0 ? "border-orange-500" : ""}>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">{t("rgpd.pendingRequests")}</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats.pendingRequests}</div>
                        <p className="text-xs text-muted-foreground">{t("rgpd.pendingRequestsDesc")}</p>
                    </CardContent>
                </Card>
                <Card className={stats.complianceRisks > 0 ? "border-red-500" : ""}>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">{t("rgpd.retentionRisks")}</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats.complianceRisks}</div>
                        <p className="text-xs text-muted-foreground">{t("rgpd.retentionRisksDesc")}</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">{t("rgpd.dataExports")}</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats.totalExports}</div>
                        <p className="text-xs text-muted-foreground">{t("rgpd.dataExportsDesc")}</p>
                    </CardContent>
                </Card>
            </div>

            {/* Data Tables / Action Center */}
            <Card>
                <CardHeader>
                    <CardTitle>{t("rgpd.complianceCenter")}</CardTitle>
                    <CardDescription>{t("rgpd.complianceCenterDesc")}</CardDescription>
                </CardHeader>
                <CardContent>
                    <Tabs value={activeTab} onValueChange={setActiveTab}>
                        <TabsList className="grid w-full grid-cols-3">
                            <TabsTrigger value="requests">{t("rgpd.tabRequests", { count: pendingRequests.length })}</TabsTrigger>
                            <TabsTrigger value="exports">{t("rgpd.tabExports", { count: exportHistory.length })}</TabsTrigger>
                            <TabsTrigger value="risks">{t("rgpd.tabRisks", { count: retentionRisks.length })}</TabsTrigger>
                        </TabsList>

                        <TabsContent value="requests" className="space-y-4 pt-4">
                            {pendingRequests.length === 0 ? (
                                <div className="text-center py-8 text-muted-foreground border rounded-lg border-dashed">
                                    {t("rgpd.noPendingRequests")}
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {pendingRequests.map((req) => (
                                        <div key={req.id} className="flex flex-col md:flex-row md:items-center justify-between p-4 border rounded-lg bg-background gap-4">
                                            <div className="space-y-1">
                                                <p className="font-medium">
                                                    {req.user?.first_name} {req.user?.last_name}
                                                </p>
                                                <p className="text-sm text-muted-foreground">{req.user?.email}</p>
                                                <p className="text-xs bg-muted p-2 rounded mt-2 truncate max-w-md italic">
                                                    "{req.reason || 'Aucune raison fournie'}"
                                                </p>
                                            </div>
                                            <div className="flex gap-2 shrink-0">
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() => {
                                                        const reason = prompt(t("rgpd.rejectReasonPrompt"));
                                                        if (reason) handleProcessRequest(req.id, 'REJECT', reason);
                                                    }}
                                                    disabled={isAnonymizing}
                                                >
                                                    {t("rgpd.reject")}
                                                </Button>
                                                <Button
                                                    variant="destructive"
                                                    size="sm"
                                                    onClick={() => {
                                                        if (confirm(t("rgpd.confirmAnonymize"))) {
                                                            handleProcessRequest(req.id, 'APPROVE');
                                                        }
                                                    }}
                                                    disabled={isAnonymizing}
                                                >
                                                    <Trash2 className="h-4 w-4 mr-2" />
                                                    {isAnonymizing ? t("rgpd.processing") : t("rgpd.approveDeletion")}
                                                </Button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </TabsContent>

                        <TabsContent value="exports" className="pt-4">
                            <div className="border rounded-lg overflow-hidden">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>{t("rgpd.colDate")}</TableHead>
                                            <TableHead>{t("rgpd.colTarget")}</TableHead>
                                            <TableHead>{t("rgpd.colRequester")}</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {exportHistory.length === 0 ? (
                                            <TableRow>
                                                <TableCell colSpan={3} className="text-center py-8 text-muted-foreground">
                                                    {t("rgpd.noExportHistory")}
                                                </TableCell>
                                            </TableRow>
                                        ) : (
                                            exportHistory.map((item) => (
                                                <TableRow key={item.id}>
                                                    <TableCell className="text-xs">
                                                        {new Date(item.export_date).toLocaleString()}
                                                    </TableCell>
                                                    <TableCell>
                                                        <div className="text-sm font-medium">{item.first_name} {item.last_name}</div>
                                                        <div className="text-xs text-muted-foreground">{item.user_email}</div>
                                                    </TableCell>
                                                    <TableCell className="text-xs font-mono">
                                                        {item.requester_email || 'Système'}
                                                    </TableCell>
                                                </TableRow>
                                            ))
                                        )}
                                    </TableBody>
                                </Table>
                            </div>
                        </TabsContent>

                        <TabsContent value="risks" className="pt-4">
                            <div className="border rounded-lg overflow-hidden">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>{t("rgpd.colUser")}</TableHead>
                                            <TableHead>{t("rgpd.colCreation")}</TableHead>
                                            <TableHead>{t("rgpd.colDeadline")}</TableHead>
                                            <TableHead>{t("rgpd.colStatus")}</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {retentionRisks.length === 0 ? (
                                            <TableRow>
                                                <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                                                    {t("rgpd.noRetentionRisks")}
                                                </TableCell>
                                            </TableRow>
                                        ) : (
                                            retentionRisks.map((risk) => (
                                                <TableRow key={risk.user_id}>
                                                    <TableCell>
                                                        <div className="text-sm font-medium">{risk.email}</div>
                                                        <div className="text-xs text-muted-foreground">ID: {risk.user_id.substring(0, 8)}</div>
                                                    </TableCell>
                                                    <TableCell className="text-xs">
                                                        {new Date(risk.account_created_at).toLocaleDateString()}
                                                    </TableCell>
                                                    <TableCell className="text-xs font-medium">
                                                        {new Date(risk.retention_end_date).toLocaleDateString()}
                                                    </TableCell>
                                                    <TableCell>
                                                        <Badge variant={risk.compliance_status === 'EXPIRED' ? 'destructive' : 'outline'} className="text-[10px] py-0">
                                                            {risk.compliance_status}
                                                        </Badge>
                                                    </TableCell>
                                                </TableRow>
                                            ))
                                        )}
                                    </TableBody>
                                </Table>
                            </div>
                        </TabsContent>
                    </Tabs>
                </CardContent>
            </Card>

            {/* Search User */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Search className="h-5 w-5" />
                        {t("rgpd.searchUser")}
                    </CardTitle>
                    <CardDescription>
                        {t("rgpd.searchUserDesc")}
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="flex gap-2">
                        <Input
                            placeholder="email@example.com"
                            value={searchEmail}
                            onChange={(e) => setSearchEmail(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSearchUser()}
                        />
                        <Button onClick={handleSearchUser} disabled={isLoading}>
                            <Search className="h-4 w-4 mr-2" />
                            {t("rgpd.search")}
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {/* Legal Data Display */}
            {isLoading && (
                <Card>
                    <CardContent className="pt-6 space-y-4">
                        <Skeleton className="h-4 w-full" />
                        <Skeleton className="h-4 w-3/4" />
                        <Skeleton className="h-4 w-1/2" />
                    </CardContent>
                </Card>
            )}

            {legalData && !isLoading && (
                <>
                    {/* Legal Data Summary */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <FileText className="h-5 w-5" />
                                {t("rgpd.legalData")}
                            </CardTitle>
                            <CardDescription>
                                {t("rgpd.legalDataDesc")}
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {/* Invoices */}
                                <div className="border rounded-lg p-4 space-y-2">
                                    <div className="flex items-center justify-between">
                                        <h3 className="font-semibold">{t("rgpd.invoices")}</h3>
                                        <Badge variant="secondary">{legalData.legal_data.invoices.count}</Badge>
                                    </div>
                                    <p className="text-sm text-muted-foreground">
                                        Conservation : {legalData.legal_data.invoices.retention_period}
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                        {legalData.legal_data.invoices.legal_basis}
                                    </p>
                                </div>

                                {/* Payments */}
                                <div className="border rounded-lg p-4 space-y-2">
                                    <div className="flex items-center justify-between">
                                        <h3 className="font-semibold">{t("rgpd.payments")}</h3>
                                        <Badge variant="secondary">{legalData.legal_data.payments.count}</Badge>
                                    </div>
                                    <p className="text-sm text-muted-foreground">
                                        Conservation : {legalData.legal_data.payments.retention_period}
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                        {legalData.legal_data.payments.legal_basis}
                                    </p>
                                </div>

                                {/* Grades */}
                                <div className="border rounded-lg p-4 space-y-2">
                                    <div className="flex items-center justify-between">
                                        <h3 className="font-semibold">{t("rgpd.grades")}</h3>
                                        <Badge variant="secondary">{legalData.legal_data.grades.count}</Badge>
                                    </div>
                                    <p className="text-sm text-muted-foreground">
                                        Conservation : {legalData.legal_data.grades.retention_period}
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                        {legalData.legal_data.grades.legal_basis}
                                    </p>
                                </div>

                                {/* Attendance */}
                                <div className="border rounded-lg p-4 space-y-2">
                                    <div className="flex items-center justify-between">
                                        <h3 className="font-semibold">{t("rgpd.attendance")}</h3>
                                        <Badge variant="secondary">{legalData.legal_data.attendance.count}</Badge>
                                    </div>
                                    <p className="text-sm text-muted-foreground">
                                        Conservation : {legalData.legal_data.attendance.retention_period}
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                        {legalData.legal_data.attendance.legal_basis}
                                    </p>
                                </div>
                            </div>

                            <div className="mt-4 p-4 bg-muted rounded-lg">
                                <p className="text-sm flex items-center gap-2">
                                    {legalData.can_be_fully_deleted ? (
                                        <>
                                            <CheckCircle className="h-4 w-4 text-green-600" />
                                            <span>{t("rgpd.fullDeletionPossible")}</span>
                                        </>
                                    ) : (
                                        <>
                                            <AlertTriangle className="h-4 w-4 text-orange-600" />
                                            <span>{legalData.message}</span>
                                        </>
                                    )}
                                </p>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Anonymize Action */}
                    <Card className="border-destructive">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-destructive">
                                <Trash2 className="h-5 w-5" />
                                {t("rgpd.anonymizeUser")}
                            </CardTitle>
                            <CardDescription>
                                {t("rgpd.anonymizeUserDesc")}
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Button
                                variant="destructive"
                                onClick={() => setAnonymizeDialogOpen(true)}
                                className="gap-2"
                            >
                                <Trash2 className="h-4 w-4" />
                                {t("rgpd.anonymizeThisUser")}
                            </Button>
                        </CardContent>
                    </Card>
                </>
            )}

            {/* Anonymize Confirmation Dialog */}
            <Dialog open={anonymizeDialogOpen} onOpenChange={setAnonymizeDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle className="text-destructive">{t("rgpd.confirmAnonymizeTitle")}</DialogTitle>
                        <DialogDescription>
                            {t("rgpd.confirmAnonymizeDesc")}
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="reason">{t("rgpd.anonymizeReason")}</Label>
                            <Textarea
                                id="reason"
                                value={anonymizeReason}
                                onChange={(e) => setAnonymizeReason(e.target.value)}
                                placeholder={t("rgpd.anonymizeReasonPlaceholder")}
                                rows={3}
                            />
                            <p className="text-xs text-muted-foreground">
                                {t("rgpd.anonymizeReasonHelp")}
                            </p>
                        </div>
                    </div>

                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => {
                                setAnonymizeDialogOpen(false);
                                setAnonymizeReason('');
                            }}
                        >
                            {t("rgpd.cancel")}
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={handleAnonymizeUser}
                            disabled={!anonymizeReason || isAnonymizing}
                        >
                            {isAnonymizing ? t("rgpd.anonymizing") : t("rgpd.confirmAnonymizeBtn")}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
