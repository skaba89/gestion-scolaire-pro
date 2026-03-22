import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useTenant } from "@/contexts/TenantContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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
  MessageSquare, 
  Send,
  Plus,
  User,
  Search,
  Inbox,
  CheckCheck,
  Check,
  ArrowLeft
} from "lucide-react";
import { toast } from "sonner";
import { format, formatDistanceToNow, isToday, isYesterday } from "date-fns";
import { fr } from "date-fns/locale";
import { EmojiPicker } from "./EmojiPicker";
import { MessageReactions } from "./MessageReactions";
import { TypingIndicator } from "./TypingIndicator";
import { OnlineStatus } from "./OnlineStatus";
import { useUserPresence } from "@/hooks/useUserPresence";
import { useIsMobile } from "@/hooks/use-mobile";

interface Recipient {
  id: string;
  first_name: string;
  last_name: string;
  email?: string;
  role?: string;
  info?: string;
}

interface MessagingInterfaceProps {
  recipients?: Recipient[];
  recipientLabel?: string;
  title?: string;
  subtitle?: string;
  showNewConversation?: boolean;
}

export function MessagingInterface({
  recipients = [],
  recipientLabel = "Destinataire",
  title = "Messagerie",
  subtitle = "Vos conversations",
  showNewConversation = true,
}: MessagingInterfaceProps) {
  const { user } = useAuth();
  const { tenant } = useTenant();
  const queryClient = useQueryClient();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const isMobile = useIsMobile();
  
  const [selectedConversation, setSelectedConversation] = useState<string | null>(null);
  const [newMessage, setNewMessage] = useState("");
  const [isNewConversationOpen, setIsNewConversationOpen] = useState(false);
  const [newConversationSubject, setNewConversationSubject] = useState("");
  const [newConversationMessage, setNewConversationMessage] = useState("");
  const [selectedRecipient, setSelectedRecipient] = useState<string>("");
  const [searchTerm, setSearchTerm] = useState("");
  const [showMobileMessages, setShowMobileMessages] = useState(false);

  const { setTyping } = useUserPresence(selectedConversation);

  // Typing timeout
  const typingTimeoutRef = useRef<NodeJS.Timeout>();

  const handleTyping = useCallback(() => {
    setTyping(true);
    
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    
    typingTimeoutRef.current = setTimeout(() => {
      setTyping(false);
    }, 2000);
  }, [setTyping]);

  // Fetch conversations with participant info
  const { data: conversations, isLoading } = useQuery({
    queryKey: ["messaging-conversations", user?.id, tenant?.id],
    queryFn: async () => {
      if (!user?.id || !tenant?.id) return [];
      
      const { data: participations, error: partError } = await supabase
        .from("conversation_participants")
        .select("conversation_id, last_read_at")
        .eq("user_id", user.id);
      
      if (partError) throw partError;
      if (!participations?.length) return [];
      
      const conversationIds = participations.map(p => p.conversation_id);
      
      const { data: convos, error } = await supabase
        .from("conversations")
        .select("*")
        .in("id", conversationIds)
        .eq("tenant_id", tenant.id)
        .order("updated_at", { ascending: false });
      
      if (error) throw error;
      
      const conversationsWithDetails = await Promise.all(
        (convos || []).map(async (conv) => {
          const { data: participants } = await supabase
            .from("conversation_participants")
            .select(`
              user_id,
              profiles:user_id (id, first_name, last_name)
            `)
            .eq("conversation_id", conv.id)
            .neq("user_id", user.id);
          
          const myParticipation = participations.find(p => p.conversation_id === conv.id);
          let unreadCount = 0;
          
          if (myParticipation) {
            const query = supabase
              .from("messages")
              .select("id", { count: "exact", head: true })
              .eq("conversation_id", conv.id)
              .neq("sender_id", user.id);
            
            if (myParticipation.last_read_at) {
              query.gt("created_at", myParticipation.last_read_at);
            }
            
            const { count } = await query;
            unreadCount = count || 0;
          }
          
          const { data: lastMessage } = await supabase
            .from("messages")
            .select("content, created_at, sender_id")
            .eq("conversation_id", conv.id)
            .order("created_at", { ascending: false })
            .limit(1)
            .single();
          
          return {
            ...conv,
            participants: participants?.map(p => p.profiles) || [],
            participantIds: participants?.map(p => p.user_id) || [],
            unreadCount,
            lastMessage
          };
        })
      );
      
      return conversationsWithDetails;
    },
    enabled: !!user?.id && !!tenant?.id,
  });

  const { data: messages, refetch: refetchMessages } = useQuery({
    queryKey: ["messaging-messages", selectedConversation],
    queryFn: async () => {
      if (!selectedConversation) return [];
      
      const { data, error } = await supabase
        .from("messages")
        .select(`
          *,
          profiles:sender_id (id, first_name, last_name)
        `)
        .eq("conversation_id", selectedConversation)
        .order("created_at", { ascending: true });
      
      if (error) throw error;
      return data;
    },
    enabled: !!selectedConversation,
  });

  // Real-time subscription
  useEffect(() => {
    if (!tenant?.id || !user?.id) return;

    const channel = supabase
      .channel('messaging-realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
        },
        (payload) => {
          const newMsg = payload.new as any;
          const conversationIds = conversations?.map((c: any) => c.id) || [];
          
          if (conversationIds.includes(newMsg.conversation_id)) {
            if (newMsg.conversation_id === selectedConversation) {
              refetchMessages();
            }
            
            if (newMsg.sender_id !== user.id) {
              queryClient.invalidateQueries({ queryKey: ["messaging-conversations"] });
              toast.info("Nouveau message reçu", {
                action: {
                  label: "Voir",
                  onClick: () => {
                    setSelectedConversation(newMsg.conversation_id);
                    if (isMobile) setShowMobileMessages(true);
                  }
                }
              });
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [tenant?.id, user?.id, conversations, selectedConversation, refetchMessages, queryClient, isMobile]);

  // Mark conversation as read when selected
  useEffect(() => {
    if (selectedConversation && user?.id) {
      supabase
        .from("conversation_participants")
        .update({ last_read_at: new Date().toISOString() })
        .eq("conversation_id", selectedConversation)
        .eq("user_id", user.id)
        .then(() => {
          queryClient.invalidateQueries({ queryKey: ["messaging-conversations"] });
        });
    }
  }, [selectedConversation, user?.id, queryClient]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessageMutation = useMutation({
    mutationFn: async ({ conversationId, content }: { conversationId: string; content: string }) => {
      const { error } = await supabase
        .from("messages")
        .insert({
          conversation_id: conversationId,
          sender_id: user?.id,
          content,
          tenant_id: tenant?.id ?? "",
        });

      if (error) throw error;

      await supabase
        .from("conversations")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", conversationId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["messaging-messages"] });
      queryClient.invalidateQueries({ queryKey: ["messaging-conversations"] });
      setNewMessage("");
      setTyping(false);
    },
    onError: () => {
      toast.error("Erreur lors de l'envoi du message");
    },
  });

  const createConversationMutation = useMutation({
    mutationFn: async ({ recipientId, subject, message }: { recipientId: string; subject: string; message: string }) => {
      const { data: conversation, error: convError } = await supabase
        .from("conversations")
        .insert({
          tenant_id: tenant?.id,
          subject,
        })
        .select()
        .single();
      
      if (convError) throw convError;
      
      const { error: partError } = await supabase
        .from("conversation_participants")
        .insert([
          { conversation_id: conversation.id, user_id: user?.id },
          { conversation_id: conversation.id, user_id: recipientId },
        ]);
      
      if (partError) throw partError;
      
      const { error: msgError } = await supabase
        .from("messages")
        .insert({
          conversation_id: conversation.id,
          sender_id: user?.id,
          content: message,
          tenant_id: tenant?.id ?? "",
        });

      if (msgError) throw msgError;
      
      return conversation;
    },
    onSuccess: (conversation) => {
      queryClient.invalidateQueries({ queryKey: ["messaging-conversations"] });
      setIsNewConversationOpen(false);
      setNewConversationSubject("");
      setNewConversationMessage("");
      setSelectedRecipient("");
      setSelectedConversation(conversation.id);
      if (isMobile) setShowMobileMessages(true);
      toast.success("Conversation créée avec succès");
    },
    onError: () => {
      toast.error("Erreur lors de la création de la conversation");
    },
  });

  const handleSendMessage = () => {
    if (!selectedConversation || !newMessage.trim()) return;
    sendMessageMutation.mutate({ 
      conversationId: selectedConversation, 
      content: newMessage,
    });
  };

  const handleCreateConversation = () => {
    if (!selectedRecipient || !newConversationSubject.trim() || !newConversationMessage.trim()) {
      toast.error("Veuillez remplir tous les champs");
      return;
    }
    createConversationMutation.mutate({
      recipientId: selectedRecipient,
      subject: newConversationSubject,
      message: newConversationMessage,
    });
  };

  const handleEmojiSelect = (emoji: string) => {
    setNewMessage(prev => prev + emoji);
    inputRef.current?.focus();
  };

  const handleConversationSelect = (convId: string) => {
    setSelectedConversation(convId);
    if (isMobile) setShowMobileMessages(true);
  };

  const handleBackToList = () => {
    setShowMobileMessages(false);
  };

  const filteredConversations = conversations?.filter(conv => 
    !searchTerm || 
    conv.subject?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    conv.participants.some((p: any) => 
      `${p.first_name} ${p.last_name}`.toLowerCase().includes(searchTerm.toLowerCase())
    )
  );

  const totalUnread = conversations?.reduce((acc: number, conv: any) => acc + (conv.unreadCount || 0), 0) || 0;

  const selectedConv = conversations?.find(c => c.id === selectedConversation);

  // Group messages by date
  const groupedMessages = messages?.reduce((groups: any, msg: any) => {
    const date = new Date(msg.created_at);
    let dateKey: string;
    
    if (isToday(date)) {
      dateKey = "Aujourd'hui";
    } else if (isYesterday(date)) {
      dateKey = "Hier";
    } else {
      dateKey = format(date, "d MMMM yyyy", { locale: fr });
    }
    
    if (!groups[dateKey]) groups[dateKey] = [];
    groups[dateKey].push(msg);
    return groups;
  }, {});

  // Mobile: Show only messages view
  if (isMobile && showMobileMessages && selectedConversation) {
    return (
      <div className="h-[calc(100vh-180px)] flex flex-col">
        {/* Mobile Header */}
        <div className="flex items-center gap-3 p-4 border-b bg-background">
          <Button variant="ghost" size="icon" onClick={handleBackToList}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <Avatar className="h-10 w-10">
            <AvatarFallback>
              {selectedConv?.participants[0]?.first_name?.[0]}
              {selectedConv?.participants[0]?.last_name?.[0]}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="font-medium truncate">
              {selectedConv?.participants.map((p: any) => 
                `${p.first_name} ${p.last_name}`
              ).join(", ")}
            </p>
            <div className="flex items-center gap-2">
              {selectedConv?.participantIds?.[0] && (
                <OnlineStatus userId={selectedConv.participantIds[0]} showLastSeen />
              )}
            </div>
          </div>
        </div>

        {/* Messages */}
        <ScrollArea className="flex-1 p-4">
          <div className="space-y-4">
            {Object.entries(groupedMessages || {}).map(([date, msgs]: [string, any]) => (
              <div key={date}>
                <div className="flex justify-center my-4">
                  <span className="px-3 py-1 bg-muted rounded-full text-xs text-muted-foreground">
                    {date}
                  </span>
                </div>
                {msgs.map((msg: any) => {
                  const isOwnMessage = msg.sender_id === user?.id;
                  const sender = msg.profiles as any;
                  
                  return (
                    <div
                      key={msg.id}
                      className={`flex gap-2 mb-3 group ${isOwnMessage ? 'flex-row-reverse' : ''}`}
                    >
                      <Avatar className="w-8 h-8 flex-shrink-0">
                        <AvatarFallback className="text-xs">
                          {sender?.first_name?.[0]}{sender?.last_name?.[0]}
                        </AvatarFallback>
                      </Avatar>
                      <div className={`flex flex-col max-w-[75%] ${isOwnMessage ? 'items-end' : ''}`}>
                        <div className={`rounded-2xl px-4 py-2 ${
                          isOwnMessage 
                            ? 'bg-primary text-primary-foreground rounded-tr-sm' 
                            : 'bg-muted rounded-tl-sm'
                        }`}>
                          <p className="text-sm whitespace-pre-wrap break-words">{msg.content}</p>
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs text-muted-foreground">
                            {format(new Date(msg.created_at), "HH:mm")}
                          </span>
                          {isOwnMessage && (
                            <CheckCheck className="h-3.5 w-3.5 text-primary" />
                          )}
                        </div>
                        <MessageReactions messageId={msg.id} />
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>

        {/* Typing Indicator */}
        <TypingIndicator conversationId={selectedConversation} />

        {/* Input */}
        <div className="p-3 border-t bg-background">
          <div className="flex items-end gap-2">
            <EmojiPicker onEmojiSelect={handleEmojiSelect} />
            <Textarea
              ref={inputRef}
              value={newMessage}
              onChange={(e) => {
                setNewMessage(e.target.value);
                handleTyping();
              }}
              placeholder="Votre message..."
              className="min-h-[44px] max-h-32 resize-none"
              rows={1}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
            />
            <Button 
              size="icon"
              onClick={handleSendMessage}
              disabled={!newMessage.trim() || sendMessageMutation.isPending}
              className="h-11 w-11"
            >
              <Send className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-foreground flex items-center gap-2">
            {title}
            {totalUnread > 0 && (
              <Badge variant="destructive" className="text-xs animate-pulse">
                {totalUnread} non lu{totalUnread > 1 ? 's' : ''}
              </Badge>
            )}
          </h1>
          <p className="text-muted-foreground">{subtitle}</p>
        </div>
        {showNewConversation && recipients.length > 0 && (
          <Dialog open={isNewConversationOpen} onOpenChange={setIsNewConversationOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="w-4 h-4" />
                Nouveau Message
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle>Nouvelle Conversation</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">{recipientLabel}</label>
                  <Select value={selectedRecipient} onValueChange={setSelectedRecipient}>
                    <SelectTrigger>
                      <SelectValue placeholder={`Choisir un ${recipientLabel.toLowerCase()}`} />
                    </SelectTrigger>
                    <SelectContent>
                      {recipients.map((recipient) => (
                        <SelectItem key={recipient.id} value={recipient.id}>
                          <div className="flex items-center gap-2">
                            <User className="w-4 h-4" />
                            <span>{recipient.first_name} {recipient.last_name}</span>
                            {recipient.info && (
                              <span className="text-xs text-muted-foreground">
                                ({recipient.info})
                              </span>
                            )}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Sujet</label>
                  <Input
                    value={newConversationSubject}
                    onChange={(e) => setNewConversationSubject(e.target.value)}
                    placeholder="Objet de votre message"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Message</label>
                  <Textarea
                    value={newConversationMessage}
                    onChange={(e) => setNewConversationMessage(e.target.value)}
                    placeholder="Votre message..."
                    rows={4}
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setIsNewConversationOpen(false)}>
                    Annuler
                  </Button>
                  <Button 
                    onClick={handleCreateConversation}
                    disabled={createConversationMutation.isPending || !selectedRecipient || !newConversationSubject.trim() || !newConversationMessage.trim()}
                  >
                    {createConversationMutation.isPending ? "Envoi..." : "Envoyer"}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Messages Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 min-h-[600px]">
        {/* Conversations List */}
        <Card className="lg:col-span-1 flex flex-col">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Inbox className="w-4 h-4" />
              Conversations
            </CardTitle>
            <div className="relative mt-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Rechercher..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
          </CardHeader>
          <CardContent className="flex-1 p-0 overflow-hidden">
            <ScrollArea className="h-[500px]">
              {isLoading ? (
                <div className="p-4 text-center text-muted-foreground">
                  Chargement...
                </div>
              ) : filteredConversations?.length === 0 ? (
                <div className="p-8 text-center">
                  <MessageSquare className="w-10 h-10 text-muted-foreground/50 mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">Aucune conversation</p>
                </div>
              ) : (
                <div className="divide-y">
                  {filteredConversations?.map((conv: any) => (
                    <button
                      key={conv.id}
                      onClick={() => handleConversationSelect(conv.id)}
                      className={`w-full p-4 text-left hover:bg-muted/50 transition-colors ${
                        selectedConversation === conv.id ? 'bg-muted' : ''
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div className="relative">
                          <Avatar className="h-10 w-10 flex-shrink-0">
                            <AvatarFallback>
                              {conv.participants[0]?.first_name?.[0]}
                              {conv.participants[0]?.last_name?.[0]}
                            </AvatarFallback>
                          </Avatar>
                          {conv.participantIds?.[0] && (
                            <div className="absolute -bottom-0.5 -right-0.5">
                              <OnlineStatus userId={conv.participantIds[0]} />
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <p className="font-medium truncate text-sm">
                              {conv.participants.map((p: any) => 
                                `${p.first_name} ${p.last_name}`
                              ).join(", ") || "Participant inconnu"}
                            </p>
                            {conv.unreadCount > 0 && (
                              <Badge variant="default" className="text-xs flex-shrink-0">
                                {conv.unreadCount}
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground truncate">
                            {conv.subject || "Sans sujet"}
                          </p>
                          {conv.lastMessage && (
                            <p className="text-xs text-muted-foreground truncate mt-1 flex items-center gap-1">
                              {conv.lastMessage.sender_id === user?.id && (
                                <Check className="h-3 w-3" />
                              )}
                              {conv.lastMessage.content}
                            </p>
                          )}
                          <p className="text-xs text-muted-foreground/70 mt-1">
                            {conv.updated_at && formatDistanceToNow(new Date(conv.updated_at), { 
                              addSuffix: true, 
                              locale: fr 
                            })}
                          </p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Messages View */}
        <Card className="lg:col-span-2 flex flex-col">
          {selectedConversation ? (
            <>
              <CardHeader className="border-b py-3">
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <Avatar className="h-10 w-10">
                      <AvatarFallback>
                        {selectedConv?.participants[0]?.first_name?.[0]}
                        {selectedConv?.participants[0]?.last_name?.[0]}
                      </AvatarFallback>
                    </Avatar>
                    {selectedConv?.participantIds?.[0] && (
                      <div className="absolute -bottom-0.5 -right-0.5">
                        <OnlineStatus userId={selectedConv.participantIds[0]} />
                      </div>
                    )}
                  </div>
                  <div>
                    <CardTitle className="text-base">
                      {selectedConv?.participants.map((p: any) => 
                        `${p.first_name} ${p.last_name}`
                      ).join(", ")}
                    </CardTitle>
                    <div className="flex items-center gap-2">
                      <p className="text-xs text-muted-foreground">
                        {selectedConv?.subject || "Sans sujet"}
                      </p>
                      {selectedConv?.participantIds?.[0] && (
                        <>
                          <span className="text-muted-foreground">•</span>
                          <OnlineStatus userId={selectedConv.participantIds[0]} showLastSeen />
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="flex-1 overflow-hidden p-0 flex flex-col">
                <ScrollArea className="flex-1 p-4">
                  <div className="space-y-2">
                    {Object.entries(groupedMessages || {}).map(([date, msgs]: [string, any]) => (
                      <div key={date}>
                        <div className="flex justify-center my-4">
                          <span className="px-3 py-1 bg-muted rounded-full text-xs text-muted-foreground">
                            {date}
                          </span>
                        </div>
                        {msgs.map((msg: any) => {
                          const isOwnMessage = msg.sender_id === user?.id;
                          const sender = msg.profiles as any;
                          
                          return (
                            <div
                              key={msg.id}
                              className={`flex gap-3 mb-3 group ${isOwnMessage ? 'flex-row-reverse' : ''}`}
                            >
                              <Avatar className="w-8 h-8 flex-shrink-0">
                                <AvatarFallback className="text-xs">
                                  {sender?.first_name?.[0]}{sender?.last_name?.[0]}
                                </AvatarFallback>
                              </Avatar>
                              <div className={`flex flex-col max-w-[70%] ${isOwnMessage ? 'items-end' : ''}`}>
                                <span className="text-xs text-muted-foreground mb-1">
                                  {sender?.first_name} {sender?.last_name}
                                </span>
                                <div className={`rounded-2xl px-4 py-2.5 ${
                                  isOwnMessage 
                                    ? 'bg-primary text-primary-foreground rounded-tr-sm' 
                                    : 'bg-muted rounded-tl-sm'
                                }`}>
                                  <p className="text-sm whitespace-pre-wrap break-words">{msg.content}</p>
                                </div>
                                <div className="flex items-center gap-2 mt-1">
                                  <span className="text-xs text-muted-foreground">
                                    {format(new Date(msg.created_at), "HH:mm")}
                                  </span>
                                  {isOwnMessage && (
                                    <CheckCheck className="h-3.5 w-3.5 text-primary" />
                                  )}
                                </div>
                                <MessageReactions messageId={msg.id} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ))}
                    <div ref={messagesEndRef} />
                  </div>
                </ScrollArea>
                
                {/* Typing Indicator */}
                <TypingIndicator conversationId={selectedConversation} />
                
                <div className="p-4 border-t">
                  <div className="flex items-end gap-2">
                    <EmojiPicker onEmojiSelect={handleEmojiSelect} />
                    <Textarea
                      ref={inputRef}
                      value={newMessage}
                      onChange={(e) => {
                        setNewMessage(e.target.value);
                        handleTyping();
                      }}
                      placeholder="Votre message..."
                      className="min-h-[44px] max-h-32 resize-none flex-1"
                      rows={1}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          handleSendMessage();
                        }
                      }}
                    />
                    <Button 
                      onClick={handleSendMessage}
                      disabled={!newMessage.trim() || sendMessageMutation.isPending}
                      size="icon"
                      className="h-11 w-11"
                    >
                      <Send className="w-5 h-5" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </>
          ) : (
            <CardContent className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <MessageSquare className="w-12 h-12 text-muted-foreground/50 mx-auto mb-4" />
                <p className="text-muted-foreground">
                  Sélectionnez une conversation pour voir les messages
                </p>
              </div>
            </CardContent>
          )}
        </Card>
      </div>
    </div>
  );
}
