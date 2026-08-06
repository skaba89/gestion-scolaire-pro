import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/api/client";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Mail, MailOpen, Loader2, Inbox, Trash2, Download } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";
import { toast } from "sonner";

interface Submission {
  id: string;
  page_id: string | null;
  name: string;
  email: string;
  phone: string | null;
  subject: string | null;
  message: string;
  is_read: boolean;
  created_at: string;
}

/**
 * Messages received through any page's "contact_form" widget
 * (POST /tenants/public/{slug}/submit-form/) — previously that form only
 * ever set a local "submitted" flag and threw the message away; this page
 * is where those submissions actually land now that the endpoint exists.
 */
export default function PublicFormSubmissions() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<"all" | "unread">("all");

  const { data: submissions = [], isLoading } = useQuery({
    queryKey: ["public-form-submissions", filter],
    queryFn: async () => {
      const params = filter === "unread" ? { is_read: false } : {};
      const response = await apiClient.get<Submission[]>("/public-pages/submissions/", { params });
      return response.data;
    },
    staleTime: 30 * 1000,
  });

  const markReadMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiClient.patch(`/public-pages/submissions/${id}/mark-read/`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["public-form-submissions"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/public-pages/submissions/${id}/`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["public-form-submissions"] });
      toast.success("Message supprimé.");
    },
    onError: () => {
      toast.error("Impossible de supprimer ce message.");
    },
  });

  const [exporting, setExporting] = useState(false);
  const handleExport = async () => {
    setExporting(true);
    try {
      const response = await apiClient.get("/public-pages/submissions/export/", {
        responseType: "blob",
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;
      link.download = "messages.csv";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      toast.error("Impossible d'exporter les messages.");
    } finally {
      setExporting(false);
    }
  };

  const unreadCount = submissions.filter((s) => !s.is_read).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Inbox className="w-6 h-6 text-primary" />
          Messages reçus
        </h1>
        <p className="text-muted-foreground text-sm">
          Messages envoyés via les formulaires de contact de vos pages publiques.
        </p>
      </div>

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex gap-2">
          <Button
            size="sm"
            variant={filter === "all" ? "default" : "outline"}
            onClick={() => setFilter("all")}
          >
            Tous
          </Button>
          <Button
            size="sm"
            variant={filter === "unread" ? "default" : "outline"}
            onClick={() => setFilter("unread")}
          >
            Non lus {unreadCount > 0 && `(${unreadCount})`}
          </Button>
        </div>
        <Button size="sm" variant="outline" onClick={handleExport} disabled={exporting}>
          {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          Exporter (CSV)
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : submissions.length === 0 ? (
        <p className="text-center text-muted-foreground py-10">
          {filter === "unread" ? "Aucun message non lu." : "Aucun message reçu pour le moment."}
        </p>
      ) : (
        <div className="space-y-3">
          {submissions.map((s) => (
            <Card key={s.id} className={!s.is_read ? "border-primary/40 bg-primary/[0.02]" : undefined}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      {s.is_read ? (
                        <MailOpen className="w-4 h-4 text-muted-foreground" />
                      ) : (
                        <Mail className="w-4 h-4 text-primary" />
                      )}
                      {s.subject || "(sans sujet)"}
                      {!s.is_read && <Badge className="text-[10px]">Nouveau</Badge>}
                    </CardTitle>
                    <CardDescription className="mt-1">
                      {s.name} · {s.email}
                      {s.phone && ` · ${s.phone}`}
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {formatDistanceToNow(new Date(s.created_at), { addSuffix: true, locale: fr })}
                    </span>
                    {!s.is_read && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => markReadMutation.mutate(s.id)}
                        disabled={markReadMutation.isPending}
                      >
                        Marquer comme lu
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      onClick={() => {
                        if (window.confirm("Supprimer ce message définitivement ?")) {
                          deleteMutation.mutate(s.id);
                        }
                      }}
                      disabled={deleteMutation.isPending}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm whitespace-pre-line">{s.message}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
