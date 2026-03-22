import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { MessageSquare, Send, Reply, Pin, Trash2 } from "lucide-react";

interface CourseDiscussionsProps {
  courseId: string;
}

export function CourseDiscussions({ courseId }: CourseDiscussionsProps) {
  const { tenant } = useTenant();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [newMessage, setNewMessage] = useState("");
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState("");

  // Fetch discussions
  const { data: discussions = [] } = useQuery({
    queryKey: ["course-discussions", courseId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("course_discussions")
        .select(`
          *,
          user:profiles(first_name, last_name)
        `)
        .eq("course_id", courseId)
        .is("parent_id", null)
        .order("is_pinned", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!courseId,
  });

  // Fetch replies
  const { data: replies = [] } = useQuery({
    queryKey: ["course-discussion-replies", courseId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("course_discussions")
        .select(`
          *,
          user:profiles(first_name, last_name)
        `)
        .eq("course_id", courseId)
        .not("parent_id", "is", null)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!courseId,
  });

  // Create discussion mutation
  const createDiscussionMutation = useMutation({
    mutationFn: async ({ content, parentId }: { content: string; parentId?: string }) => {
      const { error } = await supabase.from("course_discussions").insert({
        tenant_id: tenant!.id,
        course_id: courseId,
        user_id: user!.id,
        content,
        parent_id: parentId || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["course-discussions"] });
      queryClient.invalidateQueries({ queryKey: ["course-discussion-replies"] });
      setNewMessage("");
      setReplyContent("");
      setReplyingTo(null);
      toast.success("Message publié");
    },
    onError: () => toast.error("Erreur lors de la publication"),
  });

  // Toggle pin mutation
  const togglePinMutation = useMutation({
    mutationFn: async ({ id, isPinned }: { id: string; isPinned: boolean }) => {
      const { error } = await supabase
        .from("course_discussions")
        .update({ is_pinned: !isPinned })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["course-discussions"] });
      toast.success("Message mis à jour");
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("course_discussions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["course-discussions"] });
      queryClient.invalidateQueries({ queryKey: ["course-discussion-replies"] });
      toast.success("Message supprimé");
    },
  });

  const getRepliesForDiscussion = (discussionId: string) => {
    return replies.filter((r) => r.parent_id === discussionId);
  };

  const handleSubmit = () => {
    if (!newMessage.trim()) return;
    createDiscussionMutation.mutate({ content: newMessage.trim() });
  };

  const handleReply = (parentId: string) => {
    if (!replyContent.trim()) return;
    createDiscussionMutation.mutate({ content: replyContent.trim(), parentId });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-4">
        <MessageSquare className="h-5 w-5 text-primary" />
        <h3 className="text-lg font-semibold">Forum de discussion</h3>
        <Badge variant="secondary">{discussions.length} discussion{discussions.length !== 1 ? "s" : ""}</Badge>
      </div>

      {/* New message form */}
      <Card>
        <CardContent className="p-4">
          <div className="flex gap-3">
            <Avatar className="h-10 w-10">
              <AvatarFallback className="bg-primary/10 text-primary">
                {user?.email?.[0]?.toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 space-y-2">
              <Textarea
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder="Poser une question ou démarrer une discussion..."
                rows={2}
              />
              <div className="flex justify-end">
                <Button
                  size="sm"
                  onClick={handleSubmit}
                  disabled={!newMessage.trim() || createDiscussionMutation.isPending}
                >
                  <Send className="h-4 w-4 mr-2" />
                  Publier
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Discussions list */}
      <div className="space-y-4">
        {discussions.map((discussion: any) => {
          const discussionReplies = getRepliesForDiscussion(discussion.id);
          
          return (
            <Card key={discussion.id} className={discussion.is_pinned ? "border-primary/50 bg-primary/5" : ""}>
              <CardContent className="p-4">
                <div className="flex gap-3">
                  <Avatar className="h-10 w-10">
                    <AvatarFallback>
                      {discussion.user?.first_name?.[0]}{discussion.user?.last_name?.[0]}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium">
                        {discussion.user?.first_name} {discussion.user?.last_name}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(discussion.created_at), "PPp", { locale: fr })}
                      </span>
                      {discussion.is_pinned && (
                        <Badge variant="outline" className="text-xs">
                          <Pin className="h-3 w-3 mr-1" />
                          Épinglé
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm whitespace-pre-wrap">{discussion.content}</p>
                    
                    <div className="flex items-center gap-2 mt-3">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setReplyingTo(replyingTo === discussion.id ? null : discussion.id)}
                      >
                        <Reply className="h-4 w-4 mr-1" />
                        Répondre
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => togglePinMutation.mutate({ id: discussion.id, isPinned: discussion.is_pinned })}
                      >
                        <Pin className="h-4 w-4 mr-1" />
                        {discussion.is_pinned ? "Désépingler" : "Épingler"}
                      </Button>
                      {discussion.user_id === user?.id && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive"
                          onClick={() => deleteMutation.mutate(discussion.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>

                    {/* Reply form */}
                    {replyingTo === discussion.id && (
                      <div className="mt-3 flex gap-2">
                        <Textarea
                          value={replyContent}
                          onChange={(e) => setReplyContent(e.target.value)}
                          placeholder="Votre réponse..."
                          rows={2}
                          className="flex-1"
                        />
                        <Button
                          size="sm"
                          onClick={() => handleReply(discussion.id)}
                          disabled={!replyContent.trim()}
                        >
                          <Send className="h-4 w-4" />
                        </Button>
                      </div>
                    )}

                    {/* Replies */}
                    {discussionReplies.length > 0 && (
                      <div className="mt-4 space-y-3 pl-4 border-l-2 border-muted">
                        {discussionReplies.map((reply: any) => (
                          <div key={reply.id} className="flex gap-2">
                            <Avatar className="h-8 w-8">
                              <AvatarFallback className="text-xs">
                                {reply.user?.first_name?.[0]}{reply.user?.last_name?.[0]}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium">
                                  {reply.user?.first_name} {reply.user?.last_name}
                                </span>
                                <span className="text-xs text-muted-foreground">
                                  {format(new Date(reply.created_at), "PPp", { locale: fr })}
                                </span>
                              </div>
                              <p className="text-sm">{reply.content}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}

        {discussions.length === 0 && (
          <Card className="border-dashed">
            <CardContent className="py-12 text-center">
              <MessageSquare className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <h3 className="font-medium text-lg">Aucune discussion</h3>
              <p className="text-muted-foreground">Soyez le premier à poser une question</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
