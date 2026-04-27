import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/api/client";
import { useAuth } from "@/contexts/AuthContext";
import { useTenant } from "@/contexts/TenantContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { 
  PenTool, 
  Plus, 
  FileText, 
  Send,
  CheckCircle2,
  Clock,
  User,
  Mail,
  Eye
} from "lucide-react";

export default function ElectronicSignatures() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { tenant } = useTenant();
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const [formData, setFormData] = useState({
    document_type: "authorization",
    title: "",
    description: "",
    content: "",
  });
  const [signatories, setSignatories] = useState<{ email: string; name: string; role: string }[]>([
    { email: "", name: "", role: "" },
  ]);

  const { data: documents, isLoading } = useQuery({
    queryKey: ["electronic-documents", tenant?.id],
    queryFn: async () => {
      const { data } = await apiClient.get("/communication/electronic-documents/", {
        params: {
          ordering: "-created_at",
          expand: "creator,signatories",
        },
      });

      return data;
    },
    enabled: !!tenant?.id,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const { data: doc } = await apiClient.post("/communication/electronic-documents/", {
        tenant_id: tenant?.id,
        document_type: formData.document_type,
        title: formData.title,
        description: formData.description,
        content: formData.content,
        created_by: user?.id,
        status: "pending_signatures",
      });

      const signatoriesData = signatories
        .filter(s => s.email && s.name)
        .map((s, i) => ({
          document_id: (doc as any).id,
          email: s.email,
          name: s.name,
          role: s.role,
          signing_order: i + 1,
        }));

      if (signatoriesData.length > 0) {
        await apiClient.post("/communication/document-signatories/", signatoriesData);
      }

      return doc;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["electronic-documents"] });
      setIsOpen(false);
      setFormData({ document_type: "authorization", title: "", description: "", content: "" });
      setSignatories([{ email: "", name: "", role: "" }]);
      toast.success(t("electronicSignatures.created"));
    },
    onError: () => {
      toast.error(t("electronicSignatures.createError"));
    },
  });

  const addSignatory = () => {
    setSignatories([...signatories, { email: "", name: "", role: "" }]);
  };

  const updateSignatory = (index: number, field: string, value: string) => {
    const updated = [...signatories];
    updated[index] = { ...updated[index], [field]: value };
    setSignatories(updated);
  };

  const removeSignatory = (index: number) => {
    setSignatories(signatories.filter((_, i) => i !== index));
  };

  const getStatusBadge = (status: string) => {
    const configs: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; label: string }> = {
      draft: { variant: "outline", label: t("electronicSignatures.statusDraft") },
      pending_signatures: { variant: "default", label: t("electronicSignatures.statusPending") },
      partially_signed: { variant: "secondary", label: t("electronicSignatures.statusPartial") },
      completed: { variant: "secondary", label: t("electronicSignatures.statusCompleted") },
      cancelled: { variant: "destructive", label: t("electronicSignatures.statusCancelled") },
      expired: { variant: "destructive", label: t("electronicSignatures.statusExpired") },
    };
    const config = configs[status] || configs.draft;
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const getSignatoryStatus = (status: string) => {
    const configs: Record<string, { icon: any; label: string; className: string }> = {
      pending: { icon: Clock, label: t("electronicSignatures.sigPending"), className: "text-muted-foreground" },
      viewed: { icon: Eye, label: t("electronicSignatures.sigViewed"), className: "text-blue-600" },
      signed: { icon: CheckCircle2, label: t("electronicSignatures.sigSigned"), className: "text-green-600" },
      declined: { icon: null, label: t("electronicSignatures.sigDeclined"), className: "text-red-600" },
    };
    const config = configs[status] || configs.pending;
    const Icon = config.icon;
    return (
      <span className={`flex items-center gap-1 ${config.className}`}>
        {Icon && <Icon className="h-3 w-3" />}
        {config.label}
      </span>
    );
  };

  const calculateSignatureProgress = (signatories: any[]) => {
    if (!signatories?.length) return 0;
    const signed = signatories.filter(s => s.status === "signed").length;
    return Math.round((signed / signatories.length) * 100);
  };

  const documentTypes = useMemo(() => [
    { value: "authorization", label: t("electronicSignatures.typeAuthorization") },
    { value: "consent", label: t("electronicSignatures.typeConsent") },
    { value: "contract", label: t("electronicSignatures.typeContract") },
    { value: "certificate", label: t("electronicSignatures.typeCertificate") },
    { value: "report", label: t("electronicSignatures.typeReport") },
    { value: "other", label: t("electronicSignatures.typeOther") },
  ], [t]);

  const pendingDocs = documents?.filter(d => ["pending_signatures", "partially_signed"].includes(d.status)) || [];
  const completedDocs = documents?.filter(d => d.status === "completed") || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <PenTool className="h-8 w-8 text-primary" />
            {t("electronicSignatures.pageTitle")}
          </h1>
          <p className="text-muted-foreground">
            {t("electronicSignatures.pageSubtitle")}
          </p>
        </div>
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              {t("electronicSignatures.newDocument")}
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{t("electronicSignatures.createDocTitle")}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t("electronicSignatures.docType")}</Label>
                  <Select
                    value={formData.document_type}
                    onValueChange={(value) => setFormData({ ...formData, document_type: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {documentTypes.map((type) => (
                        <SelectItem key={type.value} value={type.value}>
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>{t("electronicSignatures.title")}</Label>
                  <Input
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    placeholder={t("electronicSignatures.titlePlaceholder")}
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <Label>{t("electronicSignatures.description")}</Label>
                <Textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder={t("electronicSignatures.descPlaceholder")}
                  rows={2}
                />
              </div>

              <div className="space-y-2">
                <Label>{t("electronicSignatures.content")}</Label>
                <Textarea
                  value={formData.content}
                  onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                  placeholder={t("electronicSignatures.contentPlaceholder")}
                  rows={6}
                />
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>{t("electronicSignatures.signatories")}</Label>
                  <Button type="button" variant="outline" size="sm" onClick={addSignatory}>
                    <Plus className="h-4 w-4 mr-1" />
                    {t("electronicSignatures.add")}
                  </Button>
                </div>
                {signatories.map((sig, index) => (
                  <div key={index} className="grid grid-cols-4 gap-2 items-end">
                    <div className="space-y-1">
                      <Label className="text-xs">{t("electronicSignatures.name")}</Label>
                      <Input
                        value={sig.name}
                        onChange={(e) => updateSignatory(index, "name", e.target.value)}
                        placeholder="Jean Dupont"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">{t("electronicSignatures.email")}</Label>
                      <Input
                        type="email"
                        value={sig.email}
                        onChange={(e) => updateSignatory(index, "email", e.target.value)}
                        placeholder="email@example.com"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">{t("electronicSignatures.role")}</Label>
                      <Input
                        value={sig.role}
                        onChange={(e) => updateSignatory(index, "role", e.target.value)}
                        placeholder="Parent"
                      />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeSignatory(index)}
                      disabled={signatories.length === 1}
                    >
                      ×
                    </Button>
                  </div>
                ))}
              </div>

              <Button
                onClick={() => createMutation.mutate()}
                disabled={
                  !formData.title || 
                  !formData.content || 
                  !signatories.some(s => s.email && s.name) ||
                  createMutation.isPending
                }
                className="w-full"
              >
                <Send className="h-4 w-4 mr-2" />
                {t("electronicSignatures.createAndSend")}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{documents?.length || 0}</div>
            <p className="text-sm text-muted-foreground">{t("electronicSignatures.totalDocs")}</p>
          </CardContent>
        </Card>
        <Card className="border-orange-500/50">
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-orange-600">{pendingDocs.length}</div>
            <p className="text-sm text-muted-foreground">{t("electronicSignatures.pending")}</p>
          </CardContent>
        </Card>
        <Card className="border-green-500/50">
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-green-600">{completedDocs.length}</div>
            <p className="text-sm text-muted-foreground">{t("electronicSignatures.completed")}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">
              {documents?.reduce((acc, d) => acc + (d.signatories?.length || 0), 0) || 0}
            </div>
            <p className="text-sm text-muted-foreground">{t("electronicSignatures.totalSignatures")}</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="pending" className="space-y-4">
        <TabsList>
          <TabsTrigger value="pending">{t("electronicSignatures.tabPending", { count: pendingDocs.length })}</TabsTrigger>
          <TabsTrigger value="completed">{t("electronicSignatures.tabCompleted", { count: completedDocs.length })}</TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="space-y-4">
          {pendingDocs.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>{t("electronicSignatures.noPending")}</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {pendingDocs.map((doc: any) => (
                <Card key={doc.id}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg">{doc.title}</CardTitle>
                      {getStatusBadge(doc.status)}
                    </div>
                    <CardDescription>
                      {documentTypes.find(t => t.value === doc.document_type)?.label}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span>{t("electronicSignatures.sigProgress")}</span>
                        <span>{calculateSignatureProgress(doc.signatories)}%</span>
                      </div>
                      <Progress value={calculateSignatureProgress(doc.signatories)} />
                    </div>
                    
                    <div className="space-y-2">
                      <p className="text-sm font-medium">{t("electronicSignatures.signatories")}:</p>
                      {doc.signatories?.map((sig: any) => (
                        <div key={sig.id} className="flex items-center justify-between text-sm">
                          <span className="flex items-center gap-2">
                            <User className="h-3 w-3" />
                            {sig.name}
                            {sig.role && <span className="text-xs text-muted-foreground">({sig.role})</span>}
                          </span>
                          {getSignatoryStatus(sig.status)}
                        </div>
                      ))}
                    </div>

                    <div className="text-xs text-muted-foreground">
                      Créé le {format(new Date(doc.created_at), "d MMMM yyyy", { locale: fr })}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="completed">
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("electronicSignatures.colDocument")}</TableHead>
                  <TableHead>{t("electronicSignatures.colType")}</TableHead>
                  <TableHead>{t("electronicSignatures.colSignatories")}</TableHead>
                  <TableHead>{t("electronicSignatures.colDate")}</TableHead>
                  <TableHead>{t("electronicSignatures.colStatus")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {completedDocs.map((doc: any) => (
                  <TableRow key={doc.id}>
                    <TableCell className="font-medium">{doc.title}</TableCell>
                    <TableCell>
                      {documentTypes.find(t => t.value === doc.document_type)?.label}
                    </TableCell>
                    <TableCell>
                      {doc.signatories?.filter((s: any) => s.status === "signed").length} / {doc.signatories?.length}
                    </TableCell>
                    <TableCell>
                      {format(new Date(doc.created_at), "d MMM yyyy", { locale: fr })}
                    </TableCell>
                    <TableCell>{getStatusBadge(doc.status)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
