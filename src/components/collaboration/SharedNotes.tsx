import { useState, useEffect } from "react";
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
  FileText,
  Plus,
  Heart,
  MessageSquare,
  Eye,
  Pin,
  Trash2,
  Send,
  Users
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface SharedNote {
  id: string;
  title: string;
  content: string;
  is_pinned: boolean;
  visibility: string;
  view_count: number;
  created_at: string;
  updated_at: string;
  tags: string[];
  author: {
    id: string;
    first_name: string;
    last_name: string;
  };
  classroom?: {
    id: string;
    name: string;
  };
  subject?: {
    id: string;
    name: string;
  };
  likes_count: number;
  comments_count: number;
  user_has_liked: boolean;
}

export const SharedNotes = () => {
  const { user } = useAuth();
  const { tenant } = useTenant();
  const queryClient = useQueryClient();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedNote, setSelectedNote] = useState<SharedNote | null>(null);
  const [newNote, setNewNote] = useState({ title: "", content: "", visibility: "class" });
  const [newComment, setNewComment] = useState("");

  // Fetch shared notes
  const { data: notes, isLoading } = useQuery({
    queryKey: ["shared-notes", tenant?.id],
    queryFn: async () => {
      if (!tenant?.id || !user?.id) return [];

      const { data, error } = await supabase
        .from("shared_notes")
        .select(`
          id, title, content, is_pinned, visibility, view_count, tags, created_at, updated_at,
          author:author_id(id, first_name, last_name),
          classroom:class_id(id, name),
          subject:subject_id(id, name)
        `)
        .eq("tenant_id", tenant.id)
        .order("is_pinned", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) throw error;

      // Get likes and comments counts
      const noteIds = data?.map(n => n.id) || [];

      const [likesRes, commentsRes, userLikesRes] = await Promise.all([
        supabase.from("shared_note_likes").select("note_id").in("note_id", noteIds),
        supabase.from("shared_note_comments").select("note_id").in("note_id", noteIds),
        supabase.from("shared_note_likes").select("note_id").in("note_id", noteIds).eq("user_id", user.id),
      ]);

      const likesMap: Record<string, number> = {};
      const commentsMap: Record<string, number> = {};
      const userLikesSet = new Set(userLikesRes.data?.map(l => l.note_id) || []);

      likesRes.data?.forEach(l => {
        likesMap[l.note_id] = (likesMap[l.note_id] || 0) + 1;
      });
      commentsRes.data?.forEach(c => {
        commentsMap[c.note_id] = (commentsMap[c.note_id] || 0) + 1;
      });

      return (data || []).map((note: any) => ({
        ...note,
        likes_count: likesMap[note.id] || 0,
        comments_count: commentsMap[note.id] || 0,
        user_has_liked: userLikesSet.has(note.id),
      })) as SharedNote[];
    },
    enabled: !!tenant?.id && !!user?.id,
  });

  // Fetch comments for selected note
  const { data: comments } = useQuery({
    queryKey: ["note-comments", selectedNote?.id],
    queryFn: async () => {
      if (!selectedNote?.id) return [];

      const { data, error } = await supabase
        .from("shared_note_comments")
        .select(`
          id, content, created_at,
          author:author_id(id, first_name, last_name)
        `)
        .eq("note_id", selectedNote.id)
        .order("created_at", { ascending: true });

      if (error) throw error;
      return data || [];
    },
    enabled: !!selectedNote?.id,
  });

  // Realtime subscription
  useEffect(() => {
    if (!tenant?.id) return;

    const channel = supabase
      .channel("shared-notes-changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "shared_notes",
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["shared-notes"] });
        }
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "shared_note_comments",
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["note-comments"] });
          queryClient.invalidateQueries({ queryKey: ["shared-notes"] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [tenant?.id, queryClient]);

  // Create note mutation
  const createNoteMutation = useMutation({
    mutationFn: async (data: { title: string; content: string; visibility: string }) => {
      if (!tenant?.id || !user?.id) throw new Error("Not authenticated");

      const { error } = await supabase.from("shared_notes").insert({
        tenant_id: tenant.id,
        author_id: user.id,
        title: data.title,
        content: data.content,
        visibility: data.visibility,
      });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shared-notes"] });
      setIsCreateOpen(false);
      setNewNote({ title: "", content: "", visibility: "class" });
      toast.success("Note partagée avec succès");
    },
    onError: () => {
      toast.error("Erreur lors de la création de la note");
    },
  });

  // Like mutation
  const toggleLikeMutation = useMutation({
    mutationFn: async ({ noteId, isLiked }: { noteId: string; isLiked: boolean }) => {
      if (!user?.id) throw new Error("Not authenticated");

      if (isLiked) {
        const { error } = await supabase
          .from("shared_note_likes")
          .delete()
          .eq("note_id", noteId)
          .eq("user_id", user.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("shared_note_likes").insert({
          note_id: noteId,
          user_id: user.id,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shared-notes"] });
    },
  });

  // Add comment mutation
  const addCommentMutation = useMutation({
    mutationFn: async ({ noteId, content }: { noteId: string; content: string }) => {
      if (!user?.id) throw new Error("Not authenticated");

      const { error } = await supabase.from("shared_note_comments").insert({
        note_id: noteId,
        author_id: user.id,
        content,
      });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["note-comments"] });
      queryClient.invalidateQueries({ queryKey: ["shared-notes"] });
      setNewComment("");
    },
    onError: () => {
      toast.error("Erreur lors de l'ajout du commentaire");
    },
  });

  // Delete note mutation
  const deleteNoteMutation = useMutation({
    mutationFn: async (noteId: string) => {
      const { error } = await supabase.from("shared_notes").delete().eq("id", noteId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shared-notes"] });
      setSelectedNote(null);
      toast.success("Note supprimée");
    },
  });

  const getInitials = (firstName?: string, lastName?: string) => {
    return `${firstName?.charAt(0) || ""}${lastName?.charAt(0) || ""}`.toUpperCase();
  };

  return (
    <Card className="h-full">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="flex items-center gap-2">
          <FileText className="w-5 h-5" />
          Notes Partagées
        </CardTitle>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="w-4 h-4 mr-1" />
              Nouvelle
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Partager une note</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <Input
                placeholder="Titre de la note"
                value={newNote.title}
                onChange={(e) => setNewNote({ ...newNote, title: e.target.value })}
              />
              <Textarea
                placeholder="Contenu de la note..."
                value={newNote.content}
                onChange={(e) => setNewNote({ ...newNote, content: e.target.value })}
                rows={6}
              />
              <Select
                value={newNote.visibility}
                onValueChange={(value) => setNewNote({ ...newNote, visibility: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Visibilité" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="class">Ma classe</SelectItem>
                  <SelectItem value="subject">Par matière</SelectItem>
                  <SelectItem value="public">Tout l'établissement</SelectItem>
                </SelectContent>
              </Select>
              <Button
                className="w-full"
                onClick={() => createNoteMutation.mutate(newNote)}
                disabled={!newNote.title || !newNote.content || createNoteMutation.isPending}
              >
                Partager la note
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </CardHeader>

      <CardContent>
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">Chargement...</div>
        ) : notes?.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <FileText className="w-10 h-10 mx-auto mb-2 opacity-50" />
            <p>Aucune note partagée</p>
            <p className="text-xs mt-1">Soyez le premier à partager une note !</p>
          </div>
        ) : (
          <ScrollArea className="h-[350px]">
            <div className="space-y-3 pr-4">
              {notes?.map((note) => (
                <div
                  key={note.id}
                  className={cn(
                    "p-4 border rounded-lg cursor-pointer transition-all hover:shadow-md",
                    note.is_pinned && "border-primary/50 bg-primary/5"
                  )}
                  onClick={() => setSelectedNote(note)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        {note.is_pinned && <Pin className="w-3 h-3 text-primary" />}
                        <h4 className="font-medium truncate">{note.title}</h4>
                      </div>
                      <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
                        {note.content}
                      </p>
                    </div>
                    <Avatar className="h-8 w-8 shrink-0">
                      <AvatarFallback className="text-xs">
                        {getInitials(note.author?.first_name, note.author?.last_name)}
                      </AvatarFallback>
                    </Avatar>
                  </div>
                  <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Heart
                        className={cn("w-3 h-3", note.user_has_liked && "fill-destructive text-destructive")}
                      />
                      {note.likes_count}
                    </span>
                    <span className="flex items-center gap-1">
                      <MessageSquare className="w-3 h-3" />
                      {note.comments_count}
                    </span>
                    <span className="flex items-center gap-1">
                      <Eye className="w-3 h-3" />
                      {note.view_count}
                    </span>
                    <span className="ml-auto">
                      {formatDistanceToNow(new Date(note.created_at), { addSuffix: true, locale: fr })}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}

        {/* Note detail dialog */}
        <Dialog open={!!selectedNote} onOpenChange={() => setSelectedNote(null)}>
          <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
            {selectedNote && (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    {selectedNote.is_pinned && <Pin className="w-4 h-4 text-primary" />}
                    {selectedNote.title}
                  </DialogTitle>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Avatar className="h-6 w-6">
                      <AvatarFallback className="text-xs">
                        {getInitials(selectedNote.author?.first_name, selectedNote.author?.last_name)}
                      </AvatarFallback>
                    </Avatar>
                    <span>
                      {selectedNote.author?.first_name} {selectedNote.author?.last_name}
                    </span>
                    <span>•</span>
                    <span>
                      {formatDistanceToNow(new Date(selectedNote.created_at), { addSuffix: true, locale: fr })}
                    </span>
                  </div>
                </DialogHeader>

                <ScrollArea className="flex-1 my-4">
                  <div className="prose prose-sm dark:prose-invert max-w-none">
                    <p className="whitespace-pre-wrap">{selectedNote.content}</p>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-4 mt-4 pt-4 border-t">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleLikeMutation.mutate({
                          noteId: selectedNote.id,
                          isLiked: selectedNote.user_has_liked,
                        });
                      }}
                    >
                      <Heart
                        className={cn(
                          "w-4 h-4 mr-1",
                          selectedNote.user_has_liked && "fill-destructive text-destructive"
                        )}
                      />
                      {selectedNote.likes_count}
                    </Button>
                    {selectedNote.author?.id === user?.id && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => deleteNoteMutation.mutate(selectedNote.id)}
                      >
                        <Trash2 className="w-4 h-4 mr-1" />
                        Supprimer
                      </Button>
                    )}
                  </div>

                  {/* Comments */}
                  <div className="mt-4 pt-4 border-t space-y-3">
                    <h4 className="font-medium flex items-center gap-2">
                      <MessageSquare className="w-4 h-4" />
                      Commentaires ({comments?.length || 0})
                    </h4>
                    {comments?.map((comment: any) => (
                      <div key={comment.id} className="flex gap-3 p-3 bg-muted/50 rounded-lg">
                        <Avatar className="h-8 w-8">
                          <AvatarFallback className="text-xs">
                            {getInitials(comment.author?.first_name, comment.author?.last_name)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 text-sm">
                            <span className="font-medium">
                              {comment.author?.first_name} {comment.author?.last_name}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true, locale: fr })}
                            </span>
                          </div>
                          <p className="text-sm mt-1">{comment.content}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>

                {/* Add comment */}
                <div className="flex gap-2 pt-4 border-t">
                  <Input
                    placeholder="Ajouter un commentaire..."
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && newComment.trim()) {
                        addCommentMutation.mutate({ noteId: selectedNote.id, content: newComment });
                      }
                    }}
                  />
                  <Button
                    size="icon"
                    disabled={!newComment.trim() || addCommentMutation.isPending}
                    onClick={() => {
                      if (newComment.trim()) {
                        addCommentMutation.mutate({ noteId: selectedNote.id, content: newComment });
                      }
                    }}
                  >
                    <Send className="w-4 h-4" />
                  </Button>
                </div>
              </>
            )}
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
};
