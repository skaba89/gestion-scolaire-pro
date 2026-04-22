import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { 
  useAlumniDocumentRequests, 
  useCreateDocumentRequest, 
  useCancelDocumentRequest 
} from "@/queries/alumni";
import { apiClient } from "@/api/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { 
  FileText, 
  Plus, 
  Clock, 
  CheckCircle2, 
  XCircle, 
  Loader2,
  Send,
  AlertCircle,
  History,
  Mail,
  MapPin,
  Building
} from "lucide-react";

const DOCUMENT_TYPES = [
  { value: "transcript", label: "Relevé de notes" },
  { value: "diploma", label: "Diplôme" },
  { value: "certificate", label: "Certificat de scolarité" },
  { value: "attestation", label: "Attestation" },
  { value: "other", label: "Autre document" },
];

const STATUS_LABELS: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  pending: { label: "En attente", color: "bg-yellow-100 text-yellow-800", icon: <Clock className="w-3 h-3" /> },
  in_progress: { label: "En cours", color: "bg-blue-100 text-blue-800", icon: <Loader2 className="w-3 h-3" /> },
  awaiting_validation: { label: "En validation", color: "bg-purple-100 text-purple-800", icon: <AlertCircle className="w-3 h-3" /> },
  validated: { label: "Validé", color: "bg-green-100 text-green-800", icon: <CheckCircle2 className="w-3 h-3" /> },
  rejected: { label: "Rejeté", color: "bg-red-100 text-red-800", icon: <XCircle className="w-3 h-3" /> },
  completed: { label: "Terminé", color: "bg-emerald-100 text-emerald-800", icon: <CheckCircle2 className="w-3 h-3" /> },
  cancelled: { label: "Annulé", color: "bg-gray-100 text-gray-800", icon: <XCircle className="w-3 h-3" /> },
};

export default function AlumniDocumentRequests() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<any>(null);

  // Form state
  const [documentType, setDocumentType] = useState("");
  const [documentDescription, setDocumentDescription] = useState("");
  const [purpose, setPurpose] = useState("");
  const [urgency, setUrgency] = useState("normal");
  const [deliveryMethod, setDeliveryMethod] = useState("email");
  const [deliveryAddress, setDeliveryAddress] = useState("");

  // Fetch requests using hook
  const { data: requests, isLoading } = useAlumniDocumentRequests();

  // Fetch request history (direct call or hook)
  const { data: requestHistory } = useQuery({
    queryKey: ["request-history", selectedRequest?.id],
    queryFn: async () => {
      if (!selectedRequest?.id) return [];
      const response = await apiClient.get(`/alumni/document-requests/${selectedRequest.id}/history/`);
      return response.data;
    },
    enabled: !!selectedRequest?.id,
  });

  // Hooks for mutations
  const createRequest = useCreateDocumentRequest();
  const cancelRequest = useCancelDocumentRequest();

  const handleCreateRequest = () => {
    createRequest.mutate({
      document_type: documentType,
      document_description: documentDescription,
      purpose,
      urgency,
      delivery_method: deliveryMethod,
      delivery_address: deliveryMethod !== "email" ? deliveryAddress : null,
    }, {
      onSuccess: () => {
        setIsDialogOpen(false);
        resetForm();
      }
    });
  };


  const resetForm = () => {
    setDocumentType("");
    setDocumentDescription("");
    setPurpose("");
    setUrgency("normal");
    setDeliveryMethod("email");
    setDeliveryAddress("");
  };

  const activeRequests = requests?.filter(r => !["completed", "cancelled", "rejected"].includes(r.status)) || [];
  const historyRequests = requests?.filter(r => ["completed", "cancelled", "rejected"].includes(r.status)) || [];

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Mes demandes de documents</h1>
          <p className="text-muted-foreground">
            Soumettez et suivez vos demandes de documents administratifs
          </p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              Nouvelle demande
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Nouvelle demande de document</DialogTitle>
              <DialogDescription>
                Remplissez le formulaire pour soumettre votre demande
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label>Type de document *</Label>
                <Select value={documentType} onValueChange={setDocumentType}>
                  <SelectTrigger>
                    <SelectValue placeholder="Sélectionnez le type" />
                  </SelectTrigger>
                  <SelectContent>
                    {DOCUMENT_TYPES.map(type => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Description détaillée</Label>
                <Textarea
                  value={documentDescription}
                  onChange={(e) => setDocumentDescription(e.target.value)}
                  placeholder="Précisez le document demandé (année, filière, etc.)"
                  rows={3}
                />
              </div>

              <div className="space-y-2">
                <Label>Motif de la demande *</Label>
                <Textarea
                  value={purpose}
                  onChange={(e) => setPurpose(e.target.value)}
                  placeholder="Pourquoi avez-vous besoin de ce document ?"
                  rows={2}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Urgence</Label>
                  <Select value={urgency} onValueChange={setUrgency}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="normal">Normal</SelectItem>
                      <SelectItem value="urgent">Urgent</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Mode de livraison</Label>
                  <Select value={deliveryMethod} onValueChange={setDeliveryMethod}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="email">
                        <span className="flex items-center gap-2">
                          <Mail className="w-4 h-4" /> Email
                        </span>
                      </SelectItem>
                      <SelectItem value="mail">
                        <span className="flex items-center gap-2">
                          <MapPin className="w-4 h-4" /> Courrier
                        </span>
                      </SelectItem>
                      <SelectItem value="pickup">
                        <span className="flex items-center gap-2">
                          <Building className="w-4 h-4" /> Retrait sur place
                        </span>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {deliveryMethod !== "email" && (
                <div className="space-y-2">
                  <Label>Adresse de livraison</Label>
                  <Textarea
                    value={deliveryAddress}
                    onChange={(e) => setDeliveryAddress(e.target.value)}
                    placeholder="Adresse complète"
                    rows={2}
                  />
                </div>
              )}

              <Button
                onClick={handleCreateRequest}
                disabled={!documentType || !purpose || createRequest.isPending}
                className="w-full"
              >
                {createRequest.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Send className="w-4 h-4 mr-2" />
                )}
                Soumettre la demande
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Tabs defaultValue="active">
        <TabsList>
          <TabsTrigger value="active" className="flex items-center gap-2">
            <Clock className="w-4 h-4" />
            En cours ({activeRequests.length})
          </TabsTrigger>
          <TabsTrigger value="history" className="flex items-center gap-2">
            <History className="w-4 h-4" />
            Historique ({historyRequests.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="active" className="mt-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          ) : activeRequests.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <FileText className="w-12 h-12 text-muted-foreground/50 mb-4" />
                <h3 className="font-semibold text-lg">Aucune demande en cours</h3>
                <p className="text-muted-foreground mt-1">
                  Cliquez sur "Nouvelle demande" pour soumettre votre première demande
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4">
              {activeRequests.map((request) => (
                <RequestCard
                  key={request.id}
                  request={request}
                  onSelect={() => setSelectedRequest(request)}
                  onCancel={() => cancelRequest.mutate(request.id)}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          {historyRequests.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <History className="w-12 h-12 text-muted-foreground/50 mb-4" />
                <h3 className="font-semibold text-lg">Aucun historique</h3>
                <p className="text-muted-foreground mt-1">
                  Les demandes terminées apparaîtront ici
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4">
              {historyRequests.map((request) => (
                <RequestCard
                  key={request.id}
                  request={request}
                  onSelect={() => setSelectedRequest(request)}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Request Detail Dialog */}
      <Dialog open={!!selectedRequest} onOpenChange={() => setSelectedRequest(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Détails de la demande</DialogTitle>
          </DialogHeader>
          {selectedRequest && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground">Type de document</Label>
                  <p className="font-medium">
                    {DOCUMENT_TYPES.find(t => t.value === selectedRequest.document_type)?.label}
                  </p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Statut</Label>
                  <Badge className={STATUS_LABELS[selectedRequest.status]?.color}>
                    {STATUS_LABELS[selectedRequest.status]?.icon}
                    <span className="ml-1">{STATUS_LABELS[selectedRequest.status]?.label}</span>
                  </Badge>
                </div>
                <div>
                  <Label className="text-muted-foreground">Date de soumission</Label>
                  <p>{format(new Date(selectedRequest.created_at), "PPP", { locale: fr })}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Mode de livraison</Label>
                  <p className="capitalize">{selectedRequest.delivery_method}</p>
                </div>
              </div>

              {selectedRequest.document_description && (
                <div>
                  <Label className="text-muted-foreground">Description</Label>
                  <p>{selectedRequest.document_description}</p>
                </div>
              )}

              <div>
                <Label className="text-muted-foreground">Motif</Label>
                <p>{selectedRequest.purpose}</p>
              </div>

              {selectedRequest.validation_notes && (
                <div className="p-3 rounded-lg bg-muted">
                  <Label className="text-muted-foreground">Note du validateur</Label>
                  <p>{selectedRequest.validation_notes}</p>
                </div>
              )}

              <Separator />

              <div>
                <Label className="text-muted-foreground mb-2 block">Historique</Label>
                <ScrollArea className="h-48">
                  <div className="space-y-3">
                    {requestHistory?.map((history: any) => (
                      <div key={history.id} className="flex items-start gap-3 text-sm">
                        <div className="w-2 h-2 rounded-full bg-primary mt-1.5" />
                        <div>
                          <p className="font-medium">{history.action}</p>
                          {history.notes && <p className="text-muted-foreground">{history.notes}</p>}
                          <p className="text-xs text-muted-foreground">
                            {format(new Date(history.created_at), "PPp", { locale: fr })}
                            {history.performer && ` • ${history.performer.first_name} ${history.performer.last_name}`}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function RequestCard({ 
  request, 
  onSelect, 
  onCancel 
}: { 
  request: any; 
  onSelect: () => void; 
  onCancel?: () => void;
}) {
  const status = STATUS_LABELS[request.status];
  const docType = DOCUMENT_TYPES.find(t => t.value === request.document_type);

  return (
    <Card className="hover:shadow-md transition-shadow cursor-pointer" onClick={onSelect}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <FileText className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold">{docType?.label || request.document_type}</h3>
              <p className="text-sm text-muted-foreground line-clamp-1">
                {request.purpose}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Soumis le {format(new Date(request.created_at), "PPP", { locale: fr })}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge className={status?.color}>
              {status?.icon}
              <span className="ml-1">{status?.label}</span>
            </Badge>
            {request.urgency === "urgent" && (
              <Badge variant="destructive">Urgent</Badge>
            )}
          </div>
        </div>
        {onCancel && request.status === "pending" && (
          <div className="mt-3 flex justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                onCancel();
              }}
            >
              <XCircle className="w-4 h-4 mr-1" />
              Annuler
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
