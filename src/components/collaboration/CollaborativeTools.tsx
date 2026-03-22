import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useTenant } from "@/contexts/TenantContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Users, BookOpen, MessageSquare, FileText, Clock, RefreshCw } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";
import { RealtimePresence } from "./RealtimePresence";

export const CollaborativeTools = () => {
  const { user } = useAuth();
  const { tenant } = useTenant();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("courses");

  // Realtime subscription for discussions
  useEffect(() => {
    if (!tenant?.id) return;

    const channel = supabase
      .channel("collaborative-discussions")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "course_discussions",
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["recent-discussions"] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [tenant?.id, queryClient]);

  // Fetch published courses for collaborative learning
  const { data: courses, isLoading: coursesLoading } = useQuery({
    queryKey: ["collaborative-courses", tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return [];

      const { data, error } = await supabase
        .from("courses")
        .select(`
          id, title, description, created_at,
          subjects(name),
          profiles:teacher_id(first_name, last_name),
          course_enrollments(id)
        `)
        .eq("tenant_id", tenant.id)
        .eq("is_published", true)
        .order("created_at", { ascending: false })
        .limit(20);

      if (error) throw error;
      return data || [];
    },
    enabled: !!tenant?.id,
  });

  // Fetch course discussions
  const { data: discussions, isLoading: discussionsLoading } = useQuery({
    queryKey: ["recent-discussions", tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return [];

      const { data, error } = await supabase
        .from("course_discussions")
        .select(`
          id, content, created_at,
          profiles:user_id(first_name, last_name),
          courses(title)
        `)
        .eq("tenant_id", tenant.id)
        .is("parent_id", null)
        .order("created_at", { ascending: false })
        .limit(10);

      if (error) throw error;
      return data || [];
    },
    enabled: !!tenant?.id,
  });

  // Fetch clubs
  const { data: clubs, isLoading: clubsLoading } = useQuery({
    queryKey: ["clubs", tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return [];

      const { data, error } = await supabase
        .from("clubs")
        .select(`
          id, name, description, category, meeting_schedule,
          profiles:advisor_id(first_name, last_name),
          club_memberships(id)
        `)
        .eq("tenant_id", tenant.id)
        .eq("is_active", true)
        .order("name");

      if (error) throw error;
      return data || [];
    },
    enabled: !!tenant?.id,
  });

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ["collaborative-courses"] });
    queryClient.invalidateQueries({ queryKey: ["recent-discussions"] });
    queryClient.invalidateQueries({ queryKey: ["clubs"] });
  };

  return (
    <Card className="h-full">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Users className="w-5 h-5" />
            Outils Collaboratifs
          </CardTitle>
          <div className="flex items-center gap-2">
            <RealtimePresence 
              channelName={`collaboration-${tenant?.id}`} 
              currentPage={activeTab}
              maxAvatars={3}
            />
            <Button variant="ghost" size="icon" onClick={handleRefresh}>
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="w-full">
            <TabsTrigger value="courses" className="flex-1">Cours</TabsTrigger>
            <TabsTrigger value="discussions" className="flex-1">Discussions</TabsTrigger>
            <TabsTrigger value="clubs" className="flex-1">Clubs</TabsTrigger>
          </TabsList>

          <TabsContent value="courses" className="mt-4">
            <ScrollArea className="h-[350px]">
              {coursesLoading ? (
                <div className="text-center py-8 text-muted-foreground">Chargement...</div>
              ) : courses?.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <BookOpen className="w-10 h-10 mx-auto mb-2 opacity-50" />
                  <p>Aucun cours disponible</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {courses?.map((course: any) => (
                    <div key={course.id} className="p-4 border rounded-lg hover:bg-muted/50 transition-colors">
                      <h4 className="font-medium">{course.title}</h4>
                      <p className="text-sm text-muted-foreground line-clamp-2">{course.description}</p>
                      <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                        {course.subjects && (
                          <Badge variant="secondary">{course.subjects.name}</Badge>
                        )}
                        <span className="flex items-center gap-1">
                          <Users className="w-3 h-3" />
                          {course.course_enrollments?.length || 0} inscrits
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </TabsContent>

          <TabsContent value="discussions" className="mt-4">
            <ScrollArea className="h-[350px]">
              {discussionsLoading ? (
                <div className="text-center py-8 text-muted-foreground">Chargement...</div>
              ) : discussions?.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <MessageSquare className="w-10 h-10 mx-auto mb-2 opacity-50" />
                  <p>Aucune discussion récente</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {discussions?.map((disc: any) => (
                    <div key={disc.id} className="p-4 border rounded-lg">
                      <div className="flex items-center gap-2 text-sm">
                        <span className="font-medium">
                          {disc.profiles?.first_name} {disc.profiles?.last_name}
                        </span>
                        <span className="text-muted-foreground">•</span>
                        <span className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(disc.created_at), { addSuffix: true, locale: fr })}
                        </span>
                      </div>
                      <p className="text-sm mt-1 line-clamp-2">{disc.content}</p>
                      {disc.courses && (
                        <Badge variant="outline" className="mt-2 text-xs">{disc.courses.title}</Badge>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </TabsContent>

          <TabsContent value="clubs" className="mt-4">
            <ScrollArea className="h-[350px]">
              {clubsLoading ? (
                <div className="text-center py-8 text-muted-foreground">Chargement...</div>
              ) : clubs?.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Users className="w-10 h-10 mx-auto mb-2 opacity-50" />
                  <p>Aucun club disponible</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {clubs?.map((club: any) => (
                    <div key={club.id} className="p-4 border rounded-lg hover:bg-muted/50 transition-colors">
                      <h4 className="font-medium">{club.name}</h4>
                      <p className="text-sm text-muted-foreground line-clamp-2">{club.description}</p>
                      <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                        {club.category && <Badge variant="secondary">{club.category}</Badge>}
                        <span className="flex items-center gap-1">
                          <Users className="w-3 h-3" />
                          {club.club_memberships?.length || 0} membres
                        </span>
                        {club.meeting_schedule && (
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {club.meeting_schedule}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};
