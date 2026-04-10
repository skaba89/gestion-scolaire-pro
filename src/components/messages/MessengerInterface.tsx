import { useState, useRef, useEffect, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useTenant } from "@/contexts/TenantContext";
import { 
  useConversations, 
  useMessages, 
  useSendMessage, 
  useCreateConversation 
} from "@/queries/communication";
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
  CheckCheck,
  Check,
  ArrowLeft,
  Settings,
  Phone,
  Video,
  Info,
  Image,
  Smile,
  ThumbsUp,
  MoreHorizontal
} from "lucide-react";
import { toast } from "sonner";
import { format, formatDistanceToNow, isToday, isYesterday } from "date-fns";
import { fr } from "date-fns/locale";
import { EmojiPicker } from "./EmojiPicker";
import { MessageReactions } from "./MessageReactions";
import { TypingIndicator } from "./TypingIndicator";
import { OnlineStatus } from "./OnlineStatus";
import { MessageSearchBar } from "./MessageSearchBar";
import { useUserPresence } from "@/hooks/useUserPresence";
import { useIsMobile } from "@/hooks/use-mobile";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

interface Recipient {
  id: string;
  first_name: string;
  last_name: string;
  email?: string;
  role?: string;
  info?: string;
}

interface MessengerInterfaceProps {
  recipients?: Recipient[];
  recipientLabel?: string;
  title?: string;
  showNewConversation?: boolean;
}

export function MessengerInterface({
  recipients = [],
  recipientLabel = "Destinataire",
  title = "Messages",
  showNewConversation = true,
}: MessengerInterfaceProps) {
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
  const [showAdvancedSearch, setShowAdvancedSearch] = useState(false);

  const { setTyping } = useUserPresence(selectedConversation);

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

  // use the new hooks from communication queries
  const { data: conversations, isLoading } = useConversations();
  const { data: messages, refetch: refetchMessages } = useMessages(selectedConversation);

  // Mark conversation as read - this is now handled by the backend getMessages endpoint

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessageMutation = useSendMessage();
  const createConversationMutation = useCreateConversation();

  const handleSendMessage = () => {
    if (!selectedConversation || !newMessage.trim()) return;
    sendMessageMutation.mutate({ 
      conversationId: selectedConversation, 
      content: newMessage,
    });
  };

  const handleSendLike = () => {
    if (!selectedConversation) return;
    sendMessageMutation.mutate({ 
      conversationId: selectedConversation, 
      content: "👍",
    });
  };

  const handleCreateConversation = () => {
    if (!selectedRecipient || !newConversationMessage.trim()) {
      toast.error("Veuillez remplir les champs obligatoires");
      return;
    }
    createConversationMutation.mutate({
      recipientId: selectedRecipient,
      subject: newConversationSubject,
      message: newConversationMessage,
    }, {
      onSuccess: (data) => {
        setIsNewConversationOpen(false);
        setNewConversationSubject("");
        setNewConversationMessage("");
        setSelectedRecipient("");
        if (data.conversation_id) {
          setSelectedConversation(data.conversation_id);
          if (isMobile) setShowMobileMessages(true);
        }
      }
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
    conv.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    conv.sender_name?.toLowerCase().includes(searchTerm.toLowerCase())
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

  // Messenger-style message bubble
  const MessageBubble = ({ msg, isOwnMessage, sender, isLastInGroup }: any) => (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      className={cn(
        "flex gap-2 mb-1 group",
        isOwnMessage ? "flex-row-reverse" : ""
      )}
    >
      {!isOwnMessage && isLastInGroup ? (
        <Avatar className="w-7 h-7 flex-shrink-0 mt-auto">
          <AvatarFallback className="text-[10px] bg-gradient-to-br from-primary/20 to-primary/10">
            {sender?.first_name?.[0]}{sender?.last_name?.[0]}
          </AvatarFallback>
        </Avatar>
      ) : !isOwnMessage ? (
        <div className="w-7 flex-shrink-0" />
      ) : null}
      
      <div className={cn(
        "flex flex-col max-w-[70%]",
        isOwnMessage ? "items-end" : ""
      )}>
        <div className={cn(
          "relative px-3 py-2 text-sm break-words",
          isOwnMessage 
            ? "bg-gradient-to-br from-primary to-primary/90 text-primary-foreground rounded-[18px] rounded-br-[4px]" 
            : "bg-muted rounded-[18px] rounded-bl-[4px]"
        )}>
          {msg.content === "👍" ? (
            <span className="text-2xl">👍</span>
          ) : (
            <p className="whitespace-pre-wrap">{msg.content}</p>
          )}
        </div>
        
        <div className={cn(
          "flex items-center gap-1.5 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity",
          isOwnMessage ? "flex-row-reverse" : ""
        )}>
          <span className="text-[10px] text-muted-foreground">
            {format(new Date(msg.created_at), "HH:mm")}
          </span>
          {isOwnMessage && (
            <CheckCheck className="h-3 w-3 text-primary" />
          )}
        </div>
        <MessageReactions messageId={msg.id} />
      </div>
    </motion.div>
  );

  // Conversations sidebar content
  const ConversationsSidebar = () => (
    <div className="flex flex-col h-full bg-card">
      {/* Sidebar Header */}
      <div className="p-4 border-b">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold">{title}</h2>
          <div className="flex items-center gap-1">
            {showNewConversation && recipients.length > 0 && (
              <Button 
                variant="ghost" 
                size="icon" 
                className="rounded-full"
                onClick={() => setIsNewConversationOpen(true)}
              >
                <Plus className="h-5 w-5" />
              </Button>
            )}
            <Button variant="ghost" size="icon" className="rounded-full">
              <Settings className="h-5 w-5" />
            </Button>
          </div>
        </div>
        
        {/* Search */}
        {showAdvancedSearch ? (
          <MessageSearchBar onClose={() => setShowAdvancedSearch(false)} />
        ) : (
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Rechercher dans Messenger"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onFocus={() => setShowAdvancedSearch(true)}
              className="pl-9 bg-muted/50 border-0 rounded-full cursor-pointer"
              readOnly
            />
          </div>
        )}
      </div>

      {/* Conversations List */}
      <ScrollArea className="flex-1">
        {isLoading ? (
          <div className="p-4 space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="flex items-center gap-3 animate-pulse">
                <div className="w-12 h-12 rounded-full bg-muted" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-32 bg-muted rounded" />
                  <div className="h-3 w-48 bg-muted rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredConversations?.length === 0 ? (
          <div className="p-8 text-center">
            <MessageSquare className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">Aucune conversation</p>
          </div>
        ) : (
          <div className="p-2">
            {filteredConversations?.map((conv: any) => (
              <motion.button
                key={conv.id}
                whileHover={{ backgroundColor: "hsl(var(--muted))" }}
                whileTap={{ scale: 0.98 }}
                onClick={() => handleConversationSelect(conv.id)}
                className={cn(
                  "w-full p-3 rounded-xl flex items-center gap-3 transition-colors text-left",
                  selectedConversation === conv.id ? "bg-primary/10" : ""
                )}
              >
                <div className="relative">
                  <Avatar className="h-12 w-12">
                    <AvatarFallback className="bg-gradient-to-br from-primary/20 to-accent/20">
                      {conv.participants[0]?.first_name?.[0]}
                      {conv.participants[0]?.last_name?.[0]}
                    </AvatarFallback>
                  </Avatar>
                  {conv.participantIds?.[0] && (
                    <div className="absolute bottom-0 right-0 ring-2 ring-card rounded-full">
                      <OnlineStatus userId={conv.participantIds[0]} />
                    </div>
                  )}
                </div>
                
                  <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className={cn(
                      "font-medium truncate",
                      conv.unread_count > 0 ? "text-foreground" : "text-foreground/80"
                    )}>
                      {conv.title || conv.sender_name || "Conversation"}
                    </p>
                    <span className="text-[11px] text-muted-foreground flex-shrink-0">
                      {conv.last_message_at && formatDistanceToNow(new Date(conv.last_message_at), { 
                        locale: fr 
                      })}
                    </span>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <p className={cn(
                      "text-sm truncate flex-1",
                      conv.unread_count > 0 ? "text-foreground font-medium" : "text-muted-foreground"
                    )}>
                      {conv.last_message || "Sans message"}
                    </p>
                    {conv.unread_count > 0 && (
                      <Badge className="h-5 min-w-[20px] rounded-full text-[10px] px-1.5">
                        {conv.unread_count}
                      </Badge>
                    )}
                  </div>
                </div>
              </motion.button>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );

  // Messages panel content
  const MessagesPanel = () => (
    <div className="flex flex-col h-full bg-background">
      {selectedConversation && selectedConv ? (
        <>
          {/* Chat Header */}
          <div className="flex items-center justify-between p-3 border-b bg-card/50 backdrop-blur-sm">
            <div className="flex items-center gap-3">
              {isMobile && (
                <Button variant="ghost" size="icon" onClick={handleBackToList} className="rounded-full">
                  <ArrowLeft className="h-5 w-5" />
                </Button>
              )}
              <div className="relative">
                <Avatar className="h-10 w-10">
                  <AvatarFallback className="bg-gradient-to-br from-primary/20 to-accent/20">
                    {selectedConv?.participants[0]?.first_name?.[0]}
                    {selectedConv?.participants[0]?.last_name?.[0]}
                  </AvatarFallback>
                </Avatar>
                {selectedConv?.participantIds?.[0] && (
                  <div className="absolute bottom-0 right-0 ring-2 ring-card rounded-full">
                    <OnlineStatus userId={selectedConv.participantIds[0]} />
                  </div>
                )}
              </div>
              <div>
                <h3 className="font-semibold text-sm">
                  {selectedConv?.title}
                </h3>
                <div className="flex items-center gap-1">
                  {selectedConv?.other_user_id && (
                    <OnlineStatus userId={selectedConv.other_user_id} showLastSeen />
                  )}
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" className="rounded-full text-primary">
                <Phone className="h-5 w-5" />
              </Button>
              <Button variant="ghost" size="icon" className="rounded-full text-primary">
                <Video className="h-5 w-5" />
              </Button>
              <Button variant="ghost" size="icon" className="rounded-full">
                <Info className="h-5 w-5" />
              </Button>
            </div>
          </div>

          {/* Messages Area */}
          <ScrollArea className="flex-1 p-4">
            <div className="space-y-1 max-w-3xl mx-auto">
              {Object.entries(groupedMessages || {}).map(([date, msgs]: [string, any]) => (
                <div key={date}>
                  <div className="flex justify-center my-4">
                    <span className="px-3 py-1 bg-muted/50 rounded-full text-[11px] text-muted-foreground font-medium">
                      {date}
                    </span>
                  </div>
                  {msgs.map((msg: any, index: number) => {
                    const isOwnMessage = msg.sender_id === user?.id;
                    const sender = msg.profiles as any;
                    const nextMsg = msgs[index + 1];
                    const isLastInGroup = !nextMsg || nextMsg.sender_id !== msg.sender_id;
                    
                    return (
                      <MessageBubble 
                        key={msg.id}
                        msg={msg}
                        isOwnMessage={isOwnMessage}
                        sender={sender}
                        isLastInGroup={isLastInGroup}
                      />
                    );
                  })}
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          </ScrollArea>

          {/* Typing Indicator */}
          <TypingIndicator conversationId={selectedConversation} />

          {/* Message Input */}
          <div className="p-3 border-t bg-card/50">
            <div className="flex items-end gap-2 max-w-3xl mx-auto">
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" className="rounded-full h-9 w-9 text-primary">
                  <Plus className="h-5 w-5" />
                </Button>
                <Button variant="ghost" size="icon" className="rounded-full h-9 w-9 text-primary">
                  <Image className="h-5 w-5" />
                </Button>
              </div>
              
              <div className="flex-1 relative">
                <Textarea
                  ref={inputRef}
                  value={newMessage}
                  onChange={(e) => {
                    setNewMessage(e.target.value);
                    handleTyping();
                  }}
                  placeholder="Aa"
                  className="min-h-[40px] max-h-32 resize-none rounded-full px-4 py-2.5 pr-10 bg-muted/50 border-0"
                  rows={1}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage();
                    }
                  }}
                />
                <div className="absolute right-2 top-1/2 -translate-y-1/2">
                  <EmojiPicker onEmojiSelect={handleEmojiSelect} />
                </div>
              </div>
              
              {newMessage.trim() ? (
                <Button 
                  onClick={handleSendMessage}
                  disabled={sendMessageMutation.isPending}
                  size="icon"
                  className="rounded-full h-10 w-10"
                >
                  <Send className="h-5 w-5" />
                </Button>
              ) : (
                <Button 
                  onClick={handleSendLike}
                  variant="ghost"
                  size="icon"
                  className="rounded-full h-10 w-10 text-primary"
                >
                  <ThumbsUp className="h-6 w-6" />
                </Button>
              )}
            </div>
          </div>
        </>
      ) : (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center p-8">
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center mx-auto mb-4">
              <MessageSquare className="w-10 h-10 text-primary/50" />
            </div>
            <h3 className="text-lg font-semibold mb-2">Vos messages</h3>
            <p className="text-muted-foreground text-sm mb-4">
              Sélectionnez une conversation pour commencer à discuter
            </p>
            {showNewConversation && recipients.length > 0 && (
              <Button onClick={() => setIsNewConversationOpen(true)} className="rounded-full">
                <Plus className="w-4 h-4 mr-2" />
                Nouvelle conversation
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );

  // Mobile view
  if (isMobile) {
    return (
      <>
        <div className="h-[calc(100vh-140px)]">
          <AnimatePresence mode="wait">
            {showMobileMessages && selectedConversation ? (
              <motion.div
                key="messages"
                initial={{ x: "100%" }}
                animate={{ x: 0 }}
                exit={{ x: "100%" }}
                transition={{ type: "tween", duration: 0.2 }}
                className="h-full"
              >
                <MessagesPanel />
              </motion.div>
            ) : (
              <motion.div
                key="conversations"
                initial={{ x: "-100%" }}
                animate={{ x: 0 }}
                exit={{ x: "-100%" }}
                transition={{ type: "tween", duration: 0.2 }}
                className="h-full"
              >
                <ConversationsSidebar />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* New Conversation Dialog */}
        <Dialog open={isNewConversationOpen} onOpenChange={setIsNewConversationOpen}>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Nouvelle conversation</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">{recipientLabel}</label>
                <Select value={selectedRecipient} onValueChange={setSelectedRecipient}>
                  <SelectTrigger className="rounded-xl">
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
                  className="rounded-xl"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Message</label>
                <Textarea
                  value={newConversationMessage}
                  onChange={(e) => setNewConversationMessage(e.target.value)}
                  placeholder="Votre message..."
                  rows={4}
                  className="rounded-xl"
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setIsNewConversationOpen(false)} className="rounded-full">
                  Annuler
                </Button>
                <Button 
                  onClick={handleCreateConversation}
                  disabled={createConversationMutation.isPending || !selectedRecipient || !newConversationSubject.trim() || !newConversationMessage.trim()}
                  className="rounded-full"
                >
                  {createConversationMutation.isPending ? "Envoi..." : "Envoyer"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  // Desktop view - Messenger style split layout
  return (
    <>
      <div className="h-[calc(100vh-180px)] flex rounded-xl overflow-hidden border bg-card shadow-lg">
        {/* Sidebar */}
        <div className="w-80 border-r flex-shrink-0">
          <ConversationsSidebar />
        </div>
        
        {/* Messages Panel */}
        <div className="flex-1">
          <MessagesPanel />
        </div>
      </div>

      {/* New Conversation Dialog */}
      <Dialog open={isNewConversationOpen} onOpenChange={setIsNewConversationOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Nouvelle conversation</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">{recipientLabel}</label>
              <Select value={selectedRecipient} onValueChange={setSelectedRecipient}>
                <SelectTrigger className="rounded-xl">
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
                className="rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Message</label>
              <Textarea
                value={newConversationMessage}
                onChange={(e) => setNewConversationMessage(e.target.value)}
                placeholder="Votre message..."
                rows={4}
                className="rounded-xl"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setIsNewConversationOpen(false)} className="rounded-full">
                Annuler
              </Button>
              <Button 
                onClick={handleCreateConversation}
                disabled={createConversationMutation.isPending || !selectedRecipient || !newConversationSubject.trim() || !newConversationMessage.trim()}
                className="rounded-full"
              >
                {createConversationMutation.isPending ? "Envoi..." : "Envoyer"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
