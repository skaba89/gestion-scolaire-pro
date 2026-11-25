import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { apiClient } from "@/api/client";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Mail, MailOpen, Loader2, Inbox, Trash2, Download, Reply, AlertTriangle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ar, enUS, es, fr, zhCN } from "date-fns/locale";
import { toast } from "sonner";
import { isAnswered, type Submission } from "@/lib/contactInbox";

const DATE_LOCALES = { fr, en: enUS, es, ar, zh: zhCN } as const;

type Filter = "all" | "unread" | "unanswered";


/**
 * Messages reçus par les formulaires de contact des pages publiques
 * (POST /tenants/public/{slug}/submit-form/). Depuis le 2026-11-25 : réponse par e-mail au
 * visiteur (POST /public-pages/submissions/{id}/reply/), historique des réponses et de leur statut,
 * filtre « Sans réponse ». L'adresse de réponse est l'e-mail de contact publié par l'établissement.
 */
export default function PublicFormSubmissions() {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<Filter>("all");
  const [replyTo, setReplyTo] = useState<Submission | null>(null);
  const [replyText, setReplyText] = useState("");
  const dateLocale = DATE_LOCALES[i18n.language as keyof typeof DATE_LOCALES] ?? fr;

  const { data: fetched = [], isLoading } = useQuery({
    queryKey: ["public-form-submissions", filter === "unread" ? "unread" : "all"],
    queryFn: async () => {
      const params = filter === "unread" ? { is_read: false } : {};
      const response = await apiClient.get<Submission[]>("/public-pages/submissions/", { params });
      return response.data;
    },
    staleTime: 30 * 1000,
  });
  const submissions = filter === "unanswered" ? fetched.filter((s) => !isAnswered(s)) : fetched;

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["public-form-submissions"] });

  const markReadMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiClient.patch(`/public-pages/submissions/${id}/mark-read/`);
    },
    onSuccess: refresh,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/public-pages/submissions/${id}/`);
    },
    onSuccess: () => {
      refresh();
      toast.success(t("contactInbox.deleted"));
    },
    onError: () => {
      toast.error(t("contactInbox.deleteError"));
    },
  });

  const replyMutation = useMutation({
    mutationFn: async ({ id, message }: { id: string; message: string }) => {
      await apiClient.post(`/public-pages/submissions/${id}/reply/`, { message });
    },
    onSuccess: () => {
      refresh();
      toast.success(t("contactInbox.replySent"));
      setReplyTo(null);
      setReplyText("");
    },
    onError: () => {
      // L'échec est aussi enregistré côté serveur (statut « échec d'envoi ») : on recharge.
      refresh();
      toast.error(t("contactInbox.replyFailed"));
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
      toast.error(t("contactInbox.exportError"));
    } finally {
      setExporting(false);
    }
  };

  const unreadCount = fetched.filter((s) => !s.is_read).length;
  const unansweredCount = fetched.filter((s) => !isAnswered(s)).length;
  const emptyText = filter === "unread" ? t("contactInbox.emptyUnread")
    : filter === "unanswered" ? t("contactInbox.emptyUnanswered") : t("contactInbox.empty");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Inbox className="w-6 h-6" />
          {t("contactInbox.title")}
        </h1>
        <p className="text-muted-foreground mt-1">{t("contactInbox.description")}</p>
      </div>

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex gap-2 flex-wrap">
          <Button size="sm" variant={filter === "all" ? "default" : "outline"} onClick={() => setFilter("all")}>
            {t("contactInbox.filterAll")}
          </Button>
          <Button size="sm" variant={filter === "unread" ? "default" : "outline"} onClick={() => setFilter("unread")}>
            {t("contactInbox.filterUnread")} {unreadCount > 0 && `(${unreadCount})`}
          </Button>
          <Button size="sm" variant={filter === "unanswered" ? "default" : "outline"} onClick={() => setFilter("unanswered")}>
            {t("contactInbox.filterUnanswered")} {filter !== "unread" && unansweredCount > 0 && `(${unansweredCount})`}
          </Button>
        </div>
        <Button size="sm" variant="outline" onClick={handleExport} disabled={exporting}>
          {exporting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
          {t("contactInbox.export")}
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : submissions.length === 0 ? (
        <p className="text-muted-foreground text-center py-12">{emptyText}</p>
      ) : (
        <div className="space-y-4">
          {submissions.map((s) => (
            <Card key={s.id} className={!s.is_read ? "border-primary/40 bg-primary/[0.02]" : undefined}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <CardTitle className="text-base flex items-center gap-2 flex-wrap">
                      {s.is_read ? (
                        <MailOpen className="w-4 h-4 text-muted-foreground" />
                      ) : (
                        <Mail className="w-4 h-4 text-primary" />
                      )}
                      {s.subject || t("contactInbox.noSubject")}
                      {!s.is_read && <Badge>{t("contactInbox.new")}</Badge>}
                      {isAnswered(s) && <Badge variant="secondary">{t("contactInbox.answered")}</Badge>}
                    </CardTitle>
                    <CardDescription className="mt-1 break-all">
                      {s.name} · {s.email}
                      {s.phone && ` · ${s.phone}`}
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {formatDistanceToNow(new Date(s.created_at), { addSuffix: true, locale: dateLocale })}
                    </span>
                    {!s.is_read && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => markReadMutation.mutate(s.id)}
                        disabled={markReadMutation.isPending}
                      >
                        {t("contactInbox.markRead")}
                      </Button>
                    )}
                    <Button size="sm" variant="outline" onClick={() => { setReplyTo(s); setReplyText(""); }}>
                      <Reply className="w-4 h-4 mr-1" />
                      {t("contactInbox.reply")}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      aria-label={t("contactInbox.delete")}
                      onClick={() => {
                        if (window.confirm(t("contactInbox.deleteConfirm"))) {
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
              <CardContent className="space-y-3">
                <p className="text-sm whitespace-pre-wrap">{s.message}</p>
                {(s.replies ?? []).length > 0 && (
                  <ul className="space-y-2 border-l-2 border-primary/30 pl-3" aria-label={t("contactInbox.history")}>
                    {(s.replies ?? []).map((reply) => (
                      <li key={reply.id} className="text-sm">
                        <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                          <span>{reply.author_name ?? t("contactInbox.unknownAuthor")}</span>
                          <span>·</span>
                          <span>{formatDistanceToNow(new Date(reply.created_at), { addSuffix: true, locale: dateLocale })}</span>
                          {reply.status === "FAILED" ? (
                            <Badge variant="destructive" className="gap-1">
                              <AlertTriangle className="w-3 h-3" />
                              {t("contactInbox.statusFailed")}
                            </Badge>
                          ) : (
                            <Badge variant="secondary">{t("contactInbox.statusSent")}</Badge>
                          )}
                        </div>
                        <p className="whitespace-pre-wrap mt-1">{reply.body}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!replyTo} onOpenChange={(open) => { if (!open) setReplyTo(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("contactInbox.replyTitle", { name: replyTo?.name ?? "" })}</DialogTitle>
            <DialogDescription>{t("contactInbox.replyDescription", { email: replyTo?.email ?? "" })}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="contact-reply">{t("contactInbox.replyLabel")}</Label>
            <Textarea
              id="contact-reply"
              rows={6}
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              maxLength={5000}
            />
            <p className="text-xs text-muted-foreground">{t("contactInbox.replyToHint")}</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReplyTo(null)} disabled={replyMutation.isPending}>
              {t("contactInbox.cancel")}
            </Button>
            <Button
              onClick={() => replyTo && replyMutation.mutate({ id: replyTo.id, message: replyText.trim() })}
              disabled={replyMutation.isPending || replyText.trim().length < 2}
            >
              {replyMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {t("contactInbox.send")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
