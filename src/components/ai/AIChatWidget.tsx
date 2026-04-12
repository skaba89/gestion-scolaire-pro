import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Bot,
  User,
  Loader2,
  Sparkles,
  Trash2,
  X,
  MessageSquare,
  Minimize2,
  Maximize2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useTenant } from "@/contexts/TenantContext";
import { chatWithAI, type ChatMessage } from "@/queries/ai";

// ── Types ────────────────────────────────────────────────────────────────────

interface DisplayMessage {
  role: "user" | "assistant";
  content: string;
  isError?: boolean;
}

// ── Constants ────────────────────────────────────────────────────────────────

const WELCOME_KEY = "ai_chat_welcome_shown";

// ── Component ────────────────────────────────────────────────────────────────

export const AIChatWidget = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { profile } = useAuth();
  const { tenant } = useTenant();

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  // Focus input when chat opens
  useEffect(() => {
    if (isOpen && !isMinimized) {
      // Small delay so the animation completes before focusing
      const timer = setTimeout(() => inputRef.current?.focus(), 300);
      return () => clearTimeout(timer);
    }
  }, [isOpen, isMinimized]);

  // Set welcome message on first open
  useEffect(() => {
    if (isOpen && messages.length === 0) {
      const userName = profile?.first_name;
      const institutionName = tenant?.name || "votre établissement";
      const greeting = userName
        ? `Bonjour ${userName} ! 👋`
        : "Bonjour ! 👋";

      setMessages([
        {
          role: "assistant",
          content: `${greeting}\n\nJe suis votre assistant IA pour ${institutionName}. Je peux vous aider avec :\n\n• La gestion des étudiants et inscriptions\n• Les notes et bulletins\n• La planification et calendrier\n• Les finances et paiements\n• Toute question sur la plateforme\n\nComment puis-je vous aider ?`,
        },
      ]);
    }
  }, [isOpen, messages.length, profile?.first_name, tenant?.name]);

  // Build conversation history from messages (excluding errors)
  const buildConversationHistory = useCallback((): ChatMessage[] => {
    return messages
      .filter((m) => !m.isError)
      .map((m) => ({ role: m.role, content: m.content }));
  }, [messages]);

  const handleSend = async () => {
    const messageText = input.trim();
    if (!messageText || isLoading) return;

    const userMessage: DisplayMessage = { role: "user", content: messageText };
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setInput("");
    setIsLoading(true);

    try {
      // Build conversation history (everything before the current user message)
      const history = updatedMessages
        .slice(0, -1)
        .filter((m) => !m.isError)
        .map((m) => ({ role: m.role, content: m.content })) as ChatMessage[];

      const result = await chatWithAI(messageText, history);

      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: result.response },
      ]);
    } catch (error: unknown) {
      console.error("AI Chat error:", error);

      const errorMessage =
        error instanceof Error
          ? error.message
          : "Une erreur est survenue. Veuillez réessayer.";

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `⚠️ Désolé, une erreur est survenue :\n${errorMessage}`,
          isError: true,
        },
      ]);

      toast.error("Erreur lors de la communication avec l'assistant IA.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const clearChat = () => {
    const userName = profile?.first_name;
    const institutionName = tenant?.name || "votre établissement";
    const greeting = userName
      ? `Bonjour ${userName} ! 👋`
      : "Bonjour ! 👋";

    setMessages([
      {
        role: "assistant",
        content: `${greeting}\n\nJe suis votre assistant IA pour ${institutionName}. Comment puis-je vous aider ?`,
      },
    ]);
    toast.success("Conversation effacée.");
  };

  const toggleChat = () => {
    if (isMinimized) {
      setIsMinimized(false);
    } else {
      setIsOpen((prev) => !prev);
      if (isOpen) setIsMinimized(false);
    }
  };

  const toggleMinimize = () => {
    setIsMinimized((prev) => !prev);
  };

  // ── Quick suggestions ────────────────────────────────────────────────────

  const suggestions = [
    "Comment ajouter un étudiant ?",
    "Générer un bulletin scolaire",
    "Voir les absences du jour",
  ];

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <>
      {/* ── Floating Button ── */}
      <Button
        onClick={toggleChat}
        className={cn(
          "fixed bottom-20 right-4 z-50 h-14 w-14 rounded-full shadow-lg",
          "bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500",
          "text-white border-0",
          "transition-all duration-300 hover:scale-105",
          isOpen && "rotate-0",
        )}
        size="icon"
        aria-label={
          isOpen
            ? "Fermer l'assistant IA"
            : "Ouvrir l'assistant IA"
        }
        aria-expanded={isOpen}
      >
        {isOpen ? (
          <X className="h-6 w-6" />
        ) : (
          <MessageSquare className="h-6 w-6" />
        )}
      </Button>

      {/* ── Chat Panel ── */}
      {isOpen && (
        <Card
          className={cn(
            "fixed z-50 shadow-2xl border-border/50 overflow-hidden",
            "bottom-36 right-4 w-[calc(100vw-2rem)] max-w-[420px]",
            "sm:bottom-36 sm:right-4",
            "animate-in slide-in-from-bottom-5 fade-in duration-300",
            isMinimized && "h-14 !p-0",
          )}
        >
          {/* ── Header ── */}
          <CardHeader className="bg-gradient-to-r from-violet-600 to-indigo-600 text-white rounded-t-lg py-3 px-4 flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base font-medium">
              <Sparkles className="h-5 w-5" />
              <span>Assistant IA</span>
            </CardTitle>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-white hover:bg-white/20"
                onClick={clearChat}
                aria-label="Effacer la conversation"
                title="Effacer la conversation"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-white hover:bg-white/20"
                onClick={toggleMinimize}
                aria-label={isMinimized ? "Agrandir" : "Réduire"}
                title={isMinimized ? "Agrandir" : "Réduire"}
              >
                {isMinimized ? (
                  <Maximize2 className="h-3.5 w-3.5" />
                ) : (
                  <Minimize2 className="h-3.5 w-3.5" />
                )}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-white hover:bg-white/20"
                onClick={() => setIsOpen(false)}
                aria-label="Fermer"
                title="Fermer"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          </CardHeader>

          {/* ── Body (hidden when minimized) ── */}
          {!isMinimized && (
            <CardContent className="p-0 flex flex-col">
              {/* ── Messages ── */}
              <ScrollArea className="h-[350px] sm:h-[400px] p-4">
                <div className="space-y-4">
                  {messages.map((message, index) => (
                    <div
                      key={index}
                      className={cn(
                        "flex gap-2",
                        message.role === "user" ? "justify-end" : "justify-start",
                      )}
                    >
                      {message.role === "assistant" && (
                        <div
                          className={cn(
                            "w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0",
                            message.isError
                              ? "bg-destructive/10"
                              : "bg-violet-100 dark:bg-violet-900/30",
                          )}
                        >
                          <Bot
                            className={cn(
                              "h-4 w-4",
                              message.isError
                                ? "text-destructive"
                                : "text-violet-600 dark:text-violet-400",
                            )}
                          />
                        </div>
                      )}
                      <div
                        className={cn(
                          "max-w-[80%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-line leading-relaxed",
                          message.role === "user"
                            ? "bg-gradient-to-r from-violet-600 to-indigo-600 text-white rounded-br-md"
                            : message.isError
                              ? "bg-destructive/10 text-destructive border border-destructive/20 rounded-bl-md"
                              : "bg-muted text-foreground rounded-bl-md",
                        )}
                      >
                        {message.content}
                      </div>
                      {message.role === "user" && (
                        <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center flex-shrink-0">
                          <User className="h-4 w-4 text-secondary-foreground" />
                        </div>
                      )}
                    </div>
                  ))}

                  {/* ── Typing indicator ── */}
                  {isLoading && (
                    <div className="flex gap-2">
                      <div className="w-8 h-8 rounded-full bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center flex-shrink-0">
                        <Bot className="h-4 w-4 text-violet-600 dark:text-violet-400" />
                      </div>
                      <div className="bg-muted rounded-2xl rounded-bl-md px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <Loader2 className="h-4 w-4 animate-spin text-violet-600 dark:text-violet-400" />
                          <span className="text-xs text-muted-foreground">
                            L'IA réfléchit…
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  <div ref={messagesEndRef} />
                </div>
              </ScrollArea>

              {/* ── Quick Suggestions (only on first exchange) ── */}
              {messages.length <= 1 && !isLoading && (
                <div className="px-4 pb-2">
                  <p className="text-xs text-muted-foreground mb-2">
                    Suggestions :
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {suggestions.map((suggestion, i) => (
                      <button
                        key={i}
                        onClick={() => {
                          setInput(suggestion);
                          // Auto-send after setting input
                          setTimeout(() => {
                            const userMsg: DisplayMessage = {
                              role: "user",
                              content: suggestion,
                            };
                            const updated = [...messages, userMsg];
                            setMessages(updated);
                            setInput("");
                            setIsLoading(true);

                            const history = updated
                              .slice(0, -1)
                              .filter((m) => !m.isError)
                              .map((m) => ({
                                role: m.role,
                                content: m.content,
                              })) as ChatMessage[];

                            chatWithAI(suggestion, history)
                              .then((result) => {
                                setMessages((prev) => [
                                  ...prev,
                                  {
                                    role: "assistant",
                                    content: result.response,
                                  },
                                ]);
                              })
                              .catch(() => {
                                setMessages((prev) => [
                                  ...prev,
                                  {
                                    role: "assistant",
                                    content:
                                      "⚠️ Désolé, une erreur est survenue. Veuillez réessayer.",
                                    isError: true,
                                  },
                                ]);
                                toast.error(
                                  "Erreur lors de la communication avec l'IA.",
                                );
                              })
                              .finally(() => setIsLoading(false));
                          }, 0);
                        }}
                        className="text-xs bg-muted hover:bg-muted/80 text-foreground px-3 py-1.5 rounded-full transition-colors focus:ring-2 focus:ring-violet-500 focus:outline-none"
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Input ── */}
              <div className="p-3 border-t border-border">
                <div className="flex gap-2">
                  <Input
                    ref={inputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Posez votre question…"
                    disabled={isLoading}
                    className="flex-1 rounded-xl"
                    aria-label="Votre message"
                  />
                  <Button
                    onClick={handleSend}
                    disabled={isLoading || !input.trim()}
                    size="icon"
                    className="rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white border-0"
                    aria-label="Envoyer le message"
                  >
                    <MessageSquare className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          )}
        </Card>
      )}
    </>
  );
};

export default AIChatWidget;
