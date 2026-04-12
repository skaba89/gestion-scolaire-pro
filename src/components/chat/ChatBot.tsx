import { useState, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MessageCircle, X, Send, Bot, User, Loader2, Sparkles, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useTenant } from "@/contexts/TenantContext";

interface Message {
  role: "user" | "assistant";
  content: string;
}

// Resolve API base URL (same logic as apiClient)
function resolveChatApiBaseUrl(): string {
  const runtimeCfg = (window as any).__SCHOOLFLOW_CONFIG__;
  if (runtimeCfg?.API_URL) return runtimeCfg.API_URL.trim();
  const buildUrl = import.meta.env.VITE_API_URL?.trim();
  if (buildUrl && !/localhost|127\.0\.0\.1/.test(buildUrl)) return buildUrl;
  if (/localhost|127\.0\.0\.1/.test(window.location.hostname)) return 'http://localhost:8000';
  return '/api-proxy';
}

const CHAT_URL = `${resolveChatApiBaseUrl()}/api/v1/ai/chat`;

export const ChatBot = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId] = useState(() => {
    // Fallback for non-secure contexts (HTTP) where crypto.randomUUID is not available
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  });
  const scrollRef = useRef<HTMLDivElement>(null);
  const { profile } = useAuth();
  const { tenant } = useTenant();
  const { t, i18n } = useTranslation();

  // Dynamic suggestions based on language
  const suggestions = [
    t("chatbot.suggestions.howToAddStudent"),
    t("chatbot.suggestions.viewGrades"),
    t("chatbot.suggestions.contactAdmin"),
  ];

  // Initialize with welcome message
  useEffect(() => {
    if (messages.length === 0) {
      const institutionName = tenant?.name || "votre établissement";
      const greeting = profile?.first_name
        ? `${t("dashboard.welcome")} ${profile.first_name} ! 👋`
        : `${t("dashboard.welcome")} ! 👋`;

      setMessages([{
        role: "assistant",
        content: `${greeting}\n\n${t("chatbot.welcome")}\n\n${institutionName}`,
      }]);
    }
  }, [profile, tenant, t]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const streamChat = async (userMessages: Message[]) => {
    const userContext = profile ? {
      name: `${profile.first_name} ${profile.last_name}`,
      email: profile.email,
      role: 'user',
    } : null;

    const token = localStorage.getItem('schoolflow:access_token') || sessionStorage.getItem('schoolflow:access_token');
    const lastTenantId = localStorage.getItem('last_tenant_id');
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (token) headers["Authorization"] = `Bearer ${token}`;
    if (lastTenantId) headers["X-Tenant-ID"] = lastTenantId;

    const resp = await fetch(CHAT_URL, {
      method: "POST",
      headers,
      body: JSON.stringify({
        messages: userMessages,
        sessionId,
        userContext,
        tenantId: tenant?.id,
        tenantName: tenant?.name,
        userId: profile?.id,
        language: i18n.language,
      }),
    });

    if (!resp.ok) {
      const error = await resp.json();
      throw new Error(error.error || "Connection error");
    }

    if (!resp.body) throw new Error("No response");

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let textBuffer = "";
    let assistantContent = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      textBuffer += decoder.decode(value, { stream: true });

      let newlineIndex: number;
      while ((newlineIndex = textBuffer.indexOf("\n")) !== -1) {
        let line = textBuffer.slice(0, newlineIndex);
        textBuffer = textBuffer.slice(newlineIndex + 1);

        if (line.endsWith("\r")) line = line.slice(0, -1);
        if (line.startsWith(":") || line.trim() === "") continue;
        if (!line.startsWith("data: ")) continue;

        const jsonStr = line.slice(6).trim();
        if (jsonStr === "[DONE]") break;

        try {
          const parsed = JSON.parse(jsonStr);
          const content = parsed.choices?.[0]?.delta?.content as string | undefined;
          if (content) {
            assistantContent += content;
            setMessages((prev) => {
              const last = prev[prev.length - 1];
              if (last?.role === "assistant" && prev.length > 1) {
                return prev.map((m, i) =>
                  i === prev.length - 1 ? { ...m, content: assistantContent } : m
                );
              }
              return [...prev, { role: "assistant", content: assistantContent }];
            });
          }
        } catch {
          textBuffer = line + "\n" + textBuffer;
          break;
        }
      }
    }
  };

  const handleSend = async (text?: string) => {
    const messageText = text || input.trim();
    if (!messageText || isLoading) return;

    const userMessage: Message = { role: "user", content: messageText };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput("");
    setIsLoading(true);

    try {
      const apiMessages = newMessages.slice(1);
      await streamChat(apiMessages);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Connection error");
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Sorry, an error occurred. Please try again." },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const clearChat = () => {
    const institutionName = tenant?.name || "votre établissement";
    setMessages([{
      role: "assistant",
      content: `${t("dashboard.welcome")}${profile?.first_name ? ` ${profile.first_name}` : ''} ! 👋\n\n${t("chatbot.welcome")}\n\n${institutionName}`,
    }]);
  };

  return (
    <>
      {/* Chat Button */}
      <Button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "fixed bottom-4 right-4 z-50 h-14 w-14 rounded-full shadow-lg",
          "bg-primary hover:bg-primary/90 text-primary-foreground",
          "transition-all duration-300 hover:scale-105",
          isOpen && "rotate-90"
        )}
        size="icon"
        aria-label={isOpen ? t("chatbot.close", "Fermer l'assistant") : t("chatbot.open", "Ouvrir l'assistant")}
        aria-expanded={isOpen}
        aria-controls="chatbot-window"
      >
        {isOpen ? <X className="h-6 w-6" aria-hidden="true" /> : <MessageCircle className="h-6 w-6" aria-hidden="true" />}
      </Button>

      {/* Chat Window */}
      {isOpen && (
        <Card
          id="chatbot-window"
          role="dialog"
          aria-label={t("chatbot.title", "Assistant IA")}
          aria-modal="false"
          className={cn(
            "fixed z-50 shadow-2xl border-border/50",
            "bottom-20 right-4 w-[calc(100vw-2rem)] max-w-[400px]",
            "sm:bottom-20 sm:right-4",
            "animate-in slide-in-from-bottom-5 fade-in duration-300"
          )}
        >
          <CardHeader className="bg-primary text-primary-foreground rounded-t-lg py-3 px-4 flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-5 w-5" aria-hidden="true" />
              {t("chatbot.title")} - {tenant?.name || "Assistant"}
            </CardTitle>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-primary-foreground hover:bg-primary-foreground/20"
              onClick={clearChat}
              aria-label={t("chatbot.clear", "Effacer la conversation")}
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea
              className="h-[350px] sm:h-[400px] p-4"
              ref={scrollRef}
              role="log"
              aria-live="polite"
              aria-label={t("chatbot.messages", "Messages de la conversation")}
            >
              <div className="space-y-4">
                {messages.map((message, index) => (
                  <div
                    key={index}
                    className={cn(
                      "flex gap-2",
                      message.role === "user" ? "justify-end" : "justify-start"
                    )}
                  >
                    {message.role === "assistant" && (
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <Bot className="h-4 w-4 text-primary" />
                      </div>
                    )}
                    <div
                      className={cn(
                        "max-w-[80%] rounded-lg px-3 py-2 text-sm whitespace-pre-line",
                        message.role === "user"
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-foreground"
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
                {isLoading && messages[messages.length - 1]?.role === "user" && (
                  <div className="flex gap-2">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <Bot className="h-4 w-4 text-primary" />
                    </div>
                    <div className="bg-muted rounded-lg px-3 py-2">
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>

            {/* Quick Suggestions */}
            {messages.length <= 1 && !isLoading && (
              <div className="px-4 pb-2" role="region" aria-label={t("chatbot.suggestionsLabel", "Suggestions rapides")}>
                <p className="text-xs text-muted-foreground mb-2">Suggestions :</p>
                <div className="flex flex-wrap gap-2" role="list">
                  {suggestions.map((suggestion, i) => (
                    <button
                      key={i}
                      onClick={() => handleSend(suggestion)}
                      className="text-xs bg-muted hover:bg-muted/80 text-foreground px-2 py-1 rounded-full transition-colors focus:ring-2 focus:ring-primary focus:outline-none"
                      role="listitem"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="p-4 border-t border-border">
              <div className="flex gap-2">
                <Input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder={t("chatbot.placeholder")}
                  disabled={isLoading}
                  className="flex-1"
                  aria-label={t("chatbot.inputLabel", "Votre message")}
                />
                <Button
                  onClick={() => handleSend()}
                  disabled={isLoading || !input.trim()}
                  size="icon"
                  aria-label={t("chatbot.send", "Envoyer")}
                >
                  <Send className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </>
  );
};
