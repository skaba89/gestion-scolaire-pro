import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
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
      const { data, error } = await supabase
        .from("electronic_documents")
        .select(`
          *,
          creator:created_by (first_name, last_name),
          signatories:document_signatories (
            id, email, name, role, status, signed_at, signing_order
          )
        `)
        .eq("tenant_id", tenant?.id)
        .order("created_at", { ascending: false });
      
      if (error) throw error;
      return data;
    },
    enabled: !!tenant?.id,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const { data: doc, error: docError } = await supabase
        .from("electronic_documents")
        .insert({
          tenant_id: tenant?.id,
          document_type: formData.document_type,
          title: formData.title,
          description: formData.description,
          content: formData.content,
          created_by: user?.id,
          status: "pending_signatures",
        })
        .select()
        .single();
      
      if (docError) throw docError;

      const signatoriesData = signatories
        .filter(s => s.email && s.name)
        .map((s, i) => ({
          document_id: doc.id,
          email: s.email,
          name: s.name,
          role: s.role,
          signing_order: i + 1,
        }));

      if (signatoriesData.length > 0) {
        const { error: sigError } = await supabase
          .from("document_signatories")
          .insert(signatoriesData);
        
        if (sigError) throw sigError;
      }

      return doc;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["electronic-documents"] });
      setIsOpen(false);
      setFormData({ document_type: "authorization", title: "", description: "", content: "" });
      setSignatories([{ email: "", name: "", role: "" }]);
      toast.success("Document créé et envoyé pour signature");
    },
    onError: () => {
      toast.error("Erreur lors de la création du document");
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
      draft: { variant: "outline", label: "Brouillon" },
      pending_signatures: { variant: "default", label: "En attente" },
      partially_signed: { variant: "secondary", label: "Partiellement signé" },
      completed: { variant: "secondary", label: "Complété" },
      cancelled: { variant: "destructive", label: "Annulé" },
      expired: { variant: "destructive", label: "Expiré" },
    };
    const config = configs[status] || configs.draft;
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const getSignatoryStatus = (status: string) => {
    const configs: Record<string, { icon: any; label: string; className: string }> = {
      pending: { icon: Clock, label: "En attente", className: "text-muted-foreground" },
      viewed: { icon: Eye, label: "Vu", className: "text-blue-600" },
      signed: { icon: CheckCircle2, label: "Signé", className: "text-green-600" },
      declined: { icon: null, label: "Refusé", className: "text-red-600" },
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

  const documentTypes = [
    { value: "authorization", label: "Autorisation parentale" },
    { value: "consent", label: "Consentement" },
    { value: "contract", label: "Contrat" },
    { value: "certificate", label: "Certificat" },
    { value: "report", label: "Rapport" },
    { value: "other", label: "Autre" },
  ];

  const pendingDocs = documents?.filter(d => ["pending_signatures", "partially_signed"].includes(d.status)) || [];
  const completedDocs = documents?.filter(d => d.status === "completed") || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <PenTool className="h-8 w-8 text-primary" />
            Signatures Électroniques
          </h1>
          <p className="text-muted-foreground">
            Créez et gérez vos documents avec signatures électroniques
          </p>
        </div>
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Nouveau document
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Créer un document à signer</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Type de document</Label>
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
                  <Label>Titre</Label>
                  <Input
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    placeholder="Autorisation de sortie scolaire"
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Brève description du document..."
                  rows={2}
                />
              </div>

              <div className="space-y-2">
                <Label>Contenu du document</Label>
                <Textarea
                  value={formData.content}
                  onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                  placeholder="Rédigez le contenu complet du document ici..."
                  rows={6}
                />
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Signataires</Label>
                  <Button type="button" variant="outline" size="sm" onClick={addSignatory}>
                    <Plus className="h-4 w-4 mr-1" />
                    Ajouter
                  </Button>
                </div>
                {signatories.map((sig, index) => (
                  <div key={index} className="grid grid-cols-4 gap-2 items-end">
                    <div className="space-y-1">
                      <Label className="text-xs">Nom</Label>
                      <Input
                        value={sig.name}
                        onChange={(e) => updateSignatory(index, "name", e.target.value)}
                        placeholder="Jean Dupont"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Email</Label>
                      <Input
                        type="email"
                        value={sig.email}
                        onChange={(e) => updateSignatory(index, "email", e.target.value)}
                        placeholder="email@example.com"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Rôle</Label>
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
                Créer et envoyer pour signature
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
            <p className="text-sm text-muted-foreground">Total documents</p>
          </CardContent>
        </Card>
        <Card className="border-orange-500/50">
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-orange-600">{pendingDocs.length}</div>
            <p className="text-sm text-muted-foreground">En attente</p>
          </CardContent>
        </Card>
        <Card className="border-green-500/50">
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-green-600">{completedDocs.length}</div>
            <p className="text-sm text-muted-foreground">Complétés</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">
              {documents?.reduce((acc, d) => acc + (d.signatories?.length || 0), 0) || 0}
            </div>
            <p className="text-sm text-muted-foreground">Signatures totales</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="pending" className="space-y-4">
        <TabsList>
          <TabsTrigger value="pending">En attente ({pendingDocs.length})</TabsTrigger>
          <TabsTrigger value="completed">Complétés ({completedDocs.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="space-y-4">
          {pendingDocs.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Aucun document en attente de signature</p>
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
                        <span>Progression des signatures</span>
                        <span>{calculateSignatureProgress(doc.signatories)}%</span>
                      </div>
                      <Progress value={calculateSignatureProgress(doc.signatories)} />
                    </div>
                    
                    <div className="space-y-2">
                      <p className="text-sm font-medium">Signataires:</p>
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
                  <TableHead>Document</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Signataires</TableHead>
                  <TableHead>Date de création</TableHead>
                  <TableHead>Statut</TableHead>
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
