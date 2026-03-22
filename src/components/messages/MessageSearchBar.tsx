import { useState, useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useTenant } from "@/contexts/TenantContext";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Search, MessageSquare, ArrowRight, X } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

interface MessageSearchBarProps {
  onSelectMessage?: (conversationId: string, messageId: string) => void;
  onClose?: () => void;
}

interface SearchResult {
  id: string;
  content: string;
  created_at: string;
  conversation_id: string;
  sender: {
    id: string;
    first_name: string;
    last_name: string;
  };
  conversation_subject?: string;
}

// Simple debounce implementation
function debounce<T extends (...args: any[]) => any>(fn: T, delay: number) {
  let timeoutId: NodeJS.Timeout;
  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
}

export function MessageSearchBar({ onSelectMessage, onClose }: MessageSearchBarProps) {
  const { user } = useAuth();
  const { tenant } = useTenant();
  const [open, setOpen] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedTerm, setDebouncedTerm] = useState("");

  const handleOpenChange = (isOpen: boolean) => {
    setOpen(isOpen);
    if (!isOpen) {
      onClose?.();
    }
  };

  // Debounce search
  const debouncedSetSearch = useMemo(
    () => debounce((value: string) => {
      setDebouncedTerm(value);
    }, 300),
    []
  );

  const handleSearchChange = (value: string) => {
    setSearchTerm(value);
    debouncedSetSearch(value);
  };

  const { data: results = [], isLoading } = useQuery({
    queryKey: ["message-search", debouncedTerm, user?.id, tenant?.id],
    queryFn: async () => {
      if (!user?.id || !tenant?.id || !debouncedTerm.trim()) return [];

      // Get user's conversations
      const { data: participations } = await supabase
        .from("conversation_participants")
        .select("conversation_id")
        .eq("user_id", user.id);

      if (!participations?.length) return [];

      const conversationIds = participations.map(p => p.conversation_id);

      // Search messages
      const { data: messages, error } = await supabase
        .from("messages")
        .select(`
          id,
          content,
          created_at,
          conversation_id,
          sender:profiles!sender_id(id, first_name, last_name)
        `)
        .in("conversation_id", conversationIds)
        .ilike("content", `%${debouncedTerm}%`)
        .order("created_at", { ascending: false })
        .limit(20);

      if (error) throw error;

      // Get conversation subjects
      const convIds = [...new Set(messages?.map(m => m.conversation_id) || [])];
      const { data: conversations } = await supabase
        .from("conversations")
        .select("id, subject")
        .in("id", convIds);

      const convMap = new Map(conversations?.map(c => [c.id, c.subject]));

      return (messages || []).map(m => ({
        ...m,
        sender: m.sender as any,
        conversation_subject: convMap.get(m.conversation_id) || undefined
      })) as SearchResult[];
    },
    enabled: !!debouncedTerm.trim() && !!user?.id && !!tenant?.id,
  });

  const handleSelect = (result: SearchResult) => {
    onSelectMessage?.(result.conversation_id, result.id);
    setOpen(false);
    setSearchTerm("");
    setDebouncedTerm("");
  };

  const highlightMatch = (text: string, term: string) => {
    if (!term.trim()) return text;
    
    const regex = new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    const parts = text.split(regex);
    
    return parts.map((part, i) => 
      regex.test(part) ? (
        <mark key={i} className="bg-primary/30 text-foreground rounded px-0.5">
          {part}
        </mark>
      ) : part
    );
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2 w-full">
          <Search className="w-4 h-4" />
          <span>Rechercher dans les messages</span>
        </Button>
      </DialogTrigger>
      
      <DialogContent className="sm:max-w-lg max-h-[80vh] flex flex-col p-0">
        <DialogHeader className="p-4 pb-0">
          <DialogTitle className="flex items-center gap-2">
            <Search className="w-5 h-5" />
            Rechercher des messages
          </DialogTitle>
        </DialogHeader>

        <div className="p-4 border-b">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Tapez pour rechercher..."
              value={searchTerm}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="pl-9 pr-9"
              autoFocus
            />
            {searchTerm && (
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                onClick={() => {
                  setSearchTerm("");
                  setDebouncedTerm("");
                }}
              >
                <X className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>

        <ScrollArea className="flex-1 min-h-[200px] max-h-[400px]">
          <div className="p-4 space-y-2">
            <AnimatePresence mode="wait">
              {!debouncedTerm.trim() ? (
                <motion.div
                  key="empty"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="text-center py-12"
                >
                  <MessageSquare className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
                  <p className="text-muted-foreground">
                    Entrez un terme pour rechercher
                  </p>
                  <p className="text-xs text-muted-foreground/70 mt-1">
                    La recherche s'effectue dans tous vos messages
                  </p>
                </motion.div>
              ) : isLoading ? (
                <motion.div
                  key="loading"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="space-y-3"
                >
                  {[1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className="animate-pulse flex items-start gap-3 p-3 rounded-lg bg-muted/30"
                    >
                      <div className="w-10 h-10 rounded-full bg-muted" />
                      <div className="flex-1 space-y-2">
                        <div className="h-4 bg-muted rounded w-1/3" />
                        <div className="h-3 bg-muted rounded w-full" />
                        <div className="h-3 bg-muted rounded w-2/3" />
                      </div>
                    </div>
                  ))}
                </motion.div>
              ) : results.length === 0 ? (
                <motion.div
                  key="no-results"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="text-center py-12"
                >
                  <Search className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
                  <p className="text-muted-foreground">
                    Aucun résultat pour "{debouncedTerm}"
                  </p>
                  <p className="text-xs text-muted-foreground/70 mt-1">
                    Essayez avec d'autres mots-clés
                  </p>
                </motion.div>
              ) : (
                <motion.div
                  key="results"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="space-y-2"
                >
                  <p className="text-xs text-muted-foreground mb-3">
                    {results.length} résultat{results.length > 1 ? "s" : ""}
                  </p>
                  
                  {results.map((result, index) => (
                    <motion.div
                      key={result.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.05 }}
                      className={cn(
                        "flex items-start gap-3 p-3 rounded-lg cursor-pointer transition-colors",
                        "hover:bg-muted/50 group"
                      )}
                      onClick={() => handleSelect(result)}
                    >
                      <Avatar className="w-10 h-10 flex-shrink-0">
                        <AvatarFallback className="text-xs bg-gradient-to-br from-primary/20 to-primary/10">
                          {result.sender?.first_name?.[0]}
                          {result.sender?.last_name?.[0]}
                        </AvatarFallback>
                      </Avatar>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm truncate">
                            {result.sender?.first_name} {result.sender?.last_name}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {format(new Date(result.created_at), "d MMM yyyy", { locale: fr })}
                          </span>
                        </div>
                        
                        {result.conversation_subject && (
                          <p className="text-xs text-primary truncate">
                            {result.conversation_subject}
                          </p>
                        )}
                        
                        <p className="text-sm text-muted-foreground line-clamp-2 mt-0.5">
                          {highlightMatch(result.content, debouncedTerm)}
                        </p>
                      </div>

                      <ArrowRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 mt-3" />
                    </motion.div>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}