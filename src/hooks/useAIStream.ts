import { useState, useCallback, useRef } from "react";

interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

interface UseAIStreamOptions {
  onError?: (error: string) => void;
}

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`;

export function useAIStream(options: UseAIStreamOptions = {}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const sendMessage = useCallback(async (
    userMessage: string,
    context?: {
      tenantId?: string;
      tenantName?: string;
      language?: string;
      systemContext?: string;
    }
  ) => {
    if (!userMessage.trim() || isStreaming) return;

    // Add user message
    const userMsg: Message = {
      role: "user",
      content: userMessage,
      timestamp: new Date(),
    };
    
    setMessages(prev => [...prev, userMsg]);
    setIsStreaming(true);

    // Prepare messages for API
    const apiMessages = [
      ...messages.map(m => ({ role: m.role, content: m.content })),
      { 
        role: "user" as const, 
        content: context?.systemContext 
          ? `${context.systemContext}\n\nQuestion: ${userMessage}`
          : userMessage 
      }
    ];

    abortControllerRef.current = new AbortController();

    try {
      const resp = await fetch(CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({
          messages: apiMessages,
          tenantId: context?.tenantId,
          tenantName: context?.tenantName,
          language: context?.language || "fr",
        }),
        signal: abortControllerRef.current.signal,
      });

      // Handle error responses
      if (!resp.ok) {
        const errorData = await resp.json().catch(() => ({}));
        const errorMessage = errorData.error || "Une erreur s'est produite";
        options.onError?.(errorMessage);
        
        setMessages(prev => [...prev, {
          role: "assistant",
          content: errorMessage,
          timestamp: new Date(),
        }]);
        setIsStreaming(false);
        return;
      }

      if (!resp.body) {
        throw new Error("No response body");
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let textBuffer = "";
      let assistantContent = "";
      let streamDone = false;

      // Add initial assistant message
      setMessages(prev => [...prev, {
        role: "assistant",
        content: "",
        timestamp: new Date(),
      }]);

      while (!streamDone) {
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
          if (jsonStr === "[DONE]") {
            streamDone = true;
            break;
          }

          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (content) {
              assistantContent += content;
              setMessages(prev => {
                const updated = [...prev];
                const lastIndex = updated.length - 1;
                if (lastIndex >= 0 && updated[lastIndex].role === "assistant") {
                  updated[lastIndex] = {
                    ...updated[lastIndex],
                    content: assistantContent,
                  };
                }
                return updated;
              });
            }
          } catch {
            // Incomplete JSON, put it back
            textBuffer = line + "\n" + textBuffer;
            break;
          }
        }
      }

      // Final flush
      if (textBuffer.trim()) {
        for (let raw of textBuffer.split("\n")) {
          if (!raw) continue;
          if (raw.endsWith("\r")) raw = raw.slice(0, -1);
          if (raw.startsWith(":") || raw.trim() === "") continue;
          if (!raw.startsWith("data: ")) continue;
          const jsonStr = raw.slice(6).trim();
          if (jsonStr === "[DONE]") continue;
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (content) {
              assistantContent += content;
              setMessages(prev => {
                const updated = [...prev];
                const lastIndex = updated.length - 1;
                if (lastIndex >= 0 && updated[lastIndex].role === "assistant") {
                  updated[lastIndex] = {
                    ...updated[lastIndex],
                    content: assistantContent,
                  };
                }
                return updated;
              });
            }
          } catch { /* ignore */ }
        }
      }
    } catch (error) {
      if ((error as Error).name === "AbortError") {
        console.log("Stream aborted");
      } else {
        console.error("Stream error:", error);
        options.onError?.("Erreur de connexion. Veuillez réessayer.");
      }
    } finally {
      setIsStreaming(false);
      abortControllerRef.current = null;
    }
  }, [messages, isStreaming, options]);

  const clearHistory = useCallback(() => {
    setMessages([]);
  }, []);

  const stopStream = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  }, []);

  return {
    messages,
    isStreaming,
    sendMessage,
    clearHistory,
    stopStream,
  };
}
