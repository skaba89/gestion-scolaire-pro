import { useEffect, useRef, useState } from "react";
import { formatDistanceToNow, format } from "date-fns";
import { fr } from "date-fns/locale";
import { MessageCircle, Send } from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  useReplyWhatsApp,
  useWhatsAppThreadMessages,
  useWhatsAppThreads,
  type WhatsAppThread,
} from "@/queries/communication";

function threadLabel(thread: WhatsAppThread): string {
  return thread.parent_name || "Numéro inconnu";
}

function threadInitials(thread: WhatsAppThread): string {
  const parts = threadLabel(thread).trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return parts.length === 1
    ? parts[0][0].toUpperCase()
    : (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function WhatsAppThreadsPanel() {
  const { data: threads, isLoading } = useWhatsAppThreads();
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { data: messages } = useWhatsAppThreadMessages(selectedThreadId);
  const replyMutation = useReplyWhatsApp();

  const selectedThread = threads?.find((t) => t.id === selectedThreadId);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = () => {
    if (!selectedThreadId || !replyBody.trim()) return;
    replyMutation.mutate(
      { threadId: selectedThreadId, body: replyBody.trim() },
      { onSuccess: () => setReplyBody("") },
    );
  };

  return (
    <div className="h-[calc(100vh-260px)] flex rounded-xl overflow-hidden border bg-card shadow-sm">
      {/* Threads list */}
      <div className="w-80 border-r flex-shrink-0 flex flex-col">
        <div className="p-4 border-b">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <MessageCircle className="w-5 h-5 text-primary" />
            Conversations WhatsApp
          </h2>
        </div>
        <ScrollArea className="flex-1">
          {isLoading ? (
            <div className="p-4 space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-3 animate-pulse">
                  <div className="w-10 h-10 rounded-full bg-muted" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 w-24 bg-muted rounded" />
                    <div className="h-3 w-36 bg-muted rounded" />
                  </div>
                </div>
              ))}
            </div>
          ) : !threads || threads.length === 0 ? (
            <div className="p-8 text-center">
              <MessageCircle className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">Aucune conversation WhatsApp</p>
            </div>
          ) : (
            <div className="p-2">
              {threads.map((thread) => (
                <button
                  key={thread.id}
                  onClick={() => setSelectedThreadId(thread.id)}
                  className={cn(
                    "w-full p-3 rounded-lg flex items-center gap-3 text-left transition-colors hover:bg-muted",
                    selectedThreadId === thread.id ? "bg-primary/10" : "",
                  )}
                >
                  <Avatar className="h-10 w-10 flex-shrink-0">
                    <AvatarFallback className="bg-gradient-to-br from-primary/20 to-accent/20 text-xs">
                      {threadInitials(thread)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium text-sm truncate">{threadLabel(thread)}</p>
                      {thread.last_message_at && (
                        <span className="text-[10px] text-muted-foreground flex-shrink-0">
                          {formatDistanceToNow(new Date(thread.last_message_at), { locale: fr })}
                        </span>
                      )}
                    </div>
                    {thread.student_name && (
                      <p className="text-[11px] text-muted-foreground truncate">Élève : {thread.student_name}</p>
                    )}
                    <p className="text-xs text-muted-foreground truncate">
                      {thread.last_message_direction === "OUTBOUND" && "Vous : "}
                      {thread.last_message || "—"}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </div>

      {/* Conversation detail */}
      <div className="flex-1 flex flex-col bg-background">
        {selectedThread ? (
          <>
            <div className="p-3 border-b bg-card/50 flex items-center gap-3">
              <Avatar className="h-9 w-9">
                <AvatarFallback className="bg-gradient-to-br from-primary/20 to-accent/20 text-xs">
                  {threadInitials(selectedThread)}
                </AvatarFallback>
              </Avatar>
              <div>
                <h3 className="font-semibold text-sm">{threadLabel(selectedThread)}</h3>
                {selectedThread.student_name && (
                  <p className="text-xs text-muted-foreground">Élève : {selectedThread.student_name}</p>
                )}
              </div>
              <Badge variant="outline" className="ml-auto text-[10px]">
                {selectedThread.status === "OPEN" ? "Ouverte" : "Fermée"}
              </Badge>
            </div>

            <ScrollArea className="flex-1 p-4">
              <div className="space-y-2 max-w-2xl mx-auto">
                {messages?.map((msg) => (
                  <div
                    key={msg.id}
                    className={cn("flex", msg.direction === "OUTBOUND" ? "justify-end" : "justify-start")}
                  >
                    <div
                      className={cn(
                        "max-w-[75%] px-3 py-2 rounded-2xl text-sm",
                        msg.direction === "OUTBOUND"
                          ? "bg-primary text-primary-foreground rounded-br-sm"
                          : "bg-muted rounded-bl-sm",
                      )}
                    >
                      <p className="whitespace-pre-wrap break-words">{msg.body}</p>
                      <div className="flex items-center gap-1 mt-1 opacity-70">
                        <span className="text-[10px]">
                          {msg.created_at ? format(new Date(msg.created_at), "HH:mm") : ""}
                        </span>
                        {msg.direction === "OUTBOUND" && (
                          <span className="text-[10px]">
                            {msg.status === "SENT" ? "· envoyé" : msg.status === "QUEUED" ? "· en cours" : msg.status === "FAILED" ? "· échec" : ""}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>
            </ScrollArea>

            <div className="p-3 border-t bg-card/50">
              <div className="flex items-end gap-2 max-w-2xl mx-auto">
                <Textarea
                  value={replyBody}
                  onChange={(e) => setReplyBody(e.target.value)}
                  placeholder="Répondre sur WhatsApp…"
                  rows={2}
                  className="resize-none"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                />
                <Button
                  onClick={handleSend}
                  disabled={replyMutation.isPending || !replyBody.trim()}
                  size="icon"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center p-8">
              <MessageCircle className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">
                Sélectionnez une conversation WhatsApp pour l'afficher
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
