import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useStudentLabel } from "@/hooks/useStudentLabel";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/api/client";
import { useAuth } from "@/contexts/AuthContext";
import { useTenant } from "@/contexts/TenantContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import {
  Video,
  Plus,
  Users,
  Calendar,
  Clock,
  Link as LinkIcon,
  Play,
  X,
  Copy,
  ExternalLink
} from "lucide-react";

export default function VideoMeetings() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { tenant } = useTenant();
  const { studentsLabel } = useStudentLabel();
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    scheduled_start: "",
    scheduled_end: "",
    max_participants: 50,
  });

  const { data: meetings, isLoading } = useQuery({
    queryKey: ["video-meetings", tenant?.id],
    queryFn: async () => {
      const response = await apiClient.get<any[]>("/communication/video-meetings/");
      return response.data;
    },
    enabled: !!tenant?.id,
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const roomName = `meeting-${Date.now()}-${Math.random().toString(36).substring(7)}`;
      const meetingUrl = `https://meet.jit.si/${roomName}`;

      await apiClient.post("/communication/video-meetings/", {
        tenant_id: tenant?.id,
        host_id: user?.id,
        title: data.title,
        description: data.description,
        scheduled_start: data.scheduled_start,
        scheduled_end: data.scheduled_end || null,
        max_participants: data.max_participants,
        room_name: roomName,
        meeting_url: meetingUrl,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["video-meetings"] });
      setIsOpen(false);
      setFormData({ title: "", description: "", scheduled_start: "", scheduled_end: "", max_participants: 50 });
      toast.success(t("videoMeetings.created"));
    },
    onError: () => {
      toast.error(t("videoMeetings.createError"));
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const updates: any = { status };
      if (status === "in_progress") updates.actual_start = new Date().toISOString();
      if (status === "completed") updates.actual_end = new Date().toISOString();

      await apiClient.patch(`/communication/video-meetings/${id}/`, updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["video-meetings"] });
      toast.success(t("videoMeetings.statusUpdated"));
    },
  });

  const getStatusBadge = (status: string) => {
    const configs: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; label: string }> = {
      scheduled: { variant: "outline", label: t("videoMeetings.statusScheduled") },
      in_progress: { variant: "default", label: t("videoMeetings.statusInProgress") },
      completed: { variant: "secondary", label: t("videoMeetings.statusCompleted") },
      cancelled: { variant: "destructive", label: t("videoMeetings.statusCancelled") },
    };
    const config = configs[status] || configs.scheduled;
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const copyLink = (url: string) => {
    navigator.clipboard.writeText(url);
    toast.success(t("videoMeetings.linkCopied"));
  };

  const upcomingMeetings = meetings?.filter(m => m.status === "scheduled") || [];
  const activeMeetings = meetings?.filter(m => m.status === "in_progress") || [];
  const pastMeetings = meetings?.filter(m => ["completed", "cancelled"].includes(m.status)) || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Video className="h-8 w-8 text-primary" />
            {t("videoMeetings.pageTitle")}
          </h1>
          <p className="text-muted-foreground">
            {t("videoMeetings.pageSubtitle", { students: studentsLabel })}
          </p>
        </div>
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 h-4 mr-2" />
              {t("videoMeetings.newMeeting")}
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{t("videoMeetings.createMeeting")}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>{t("videoMeetings.title")}</Label>
                <Input
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder={t("videoMeetings.titlePlaceholder")}
                />
              </div>
              <div className="space-y-2">
                <Label>{t("videoMeetings.description")}</Label>
                <Textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder={t("videoMeetings.descPlaceholder")}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t("videoMeetings.startDateTime")}</Label>
                  <Input
                    type="datetime-local"
                    value={formData.scheduled_start}
                    onChange={(e) => setFormData({ ...formData, scheduled_start: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t("videoMeetings.endDateTime")}</Label>
                  <Input
                    type="datetime-local"
                    value={formData.scheduled_end}
                    onChange={(e) => setFormData({ ...formData, scheduled_end: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>{t("videoMeetings.maxParticipants")}</Label>
                <Input
                  type="number"
                  value={formData.max_participants}
                  onChange={(e) => setFormData({ ...formData, max_participants: parseInt(e.target.value) })}
                  min={2}
                  max={100}
                />
              </div>
              <Button
                onClick={() => createMutation.mutate(formData)}
                disabled={!formData.title || !formData.scheduled_start || createMutation.isPending}
                className="w-full"
              >
                {t("videoMeetings.createMeetingBtn")}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Réunions en cours */}
      {activeMeetings.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <div className="h-3 w-3 bg-green-500 rounded-full animate-pulse" />
            {t("videoMeetings.activeMeetings")}
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            {activeMeetings.map((meeting: any) => (
              <Card key={meeting.id} className="border-green-500/50 bg-green-500/5">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    {meeting.title}
                    {getStatusBadge(meeting.status)}
                  </CardTitle>
                  <CardDescription>
                    {t("videoMeetings.hostedBy", { name: `${meeting.host?.first_name} ${meeting.host?.last_name}` })}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Users className="h-4 w-4" />
                      {meeting.participants?.length || 0} / {meeting.max_participants}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-4 w-4" />
                      {t("videoMeetings.startedAt", { time: meeting.actual_start ? format(new Date(meeting.actual_start), "HH:mm", { locale: fr }) : "" })}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <Button asChild className="flex-1">
                      <a href={meeting.meeting_url} target="_blank" rel="noopener noreferrer">
                        <Play className="h-4 w-4 mr-2" />
                        {t("videoMeetings.join")}
                      </a>
                    </Button>
                    <Button variant="outline" size="icon" onClick={() => copyLink(meeting.meeting_url)}>
                      <Copy className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="destructive"
                      size="icon"
                      onClick={() => updateStatusMutation.mutate({ id: meeting.id, status: "completed" })}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Réunions à venir */}
      <div className="space-y-4">
        <h2 className="text-xl font-semibold flex items-center gap-2">
          <Calendar className="h-5 h-5" />
          {t("videoMeetings.upcomingMeetings", { count: upcomingMeetings.length })}
        </h2>
        {upcomingMeetings.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              <Video className="h-12 h-12 mx-auto mb-4 opacity-50" />
              <p>{t("videoMeetings.noUpcoming")}</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {upcomingMeetings.map((meeting: any) => (
              <Card key={meeting.id}>
                <CardHeader>
                  <CardTitle className="text-lg">{meeting.title}</CardTitle>
                  <CardDescription>
                    {format(new Date(meeting.scheduled_start), "EEEE d MMMM yyyy à HH:mm", { locale: fr })}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {meeting.description && (
                    <p className="text-sm text-muted-foreground line-clamp-2">{meeting.description}</p>
                  )}
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Users className="h-4 w-4" />
                    <span>{t("videoMeetings.maxParticipantsCount", { count: meeting.max_participants })}</span>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      className="flex-1"
                      onClick={() => updateStatusMutation.mutate({ id: meeting.id, status: "in_progress" })}
                    >
                      <Play className="h-4 w-4 mr-2" />
                      {t("videoMeetings.start")}
                    </Button>
                    <Button variant="outline" size="icon" onClick={() => copyLink(meeting.meeting_url)}>
                      <LinkIcon className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Réunions passées */}
      {pastMeetings.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-xl font-semibold text-muted-foreground">
            {t("videoMeetings.history", { count: pastMeetings.length })}
          </h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {pastMeetings.slice(0, 6).map((meeting: any) => (
              <Card key={meeting.id} className="opacity-75">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center justify-between">
                    {meeting.title}
                    {getStatusBadge(meeting.status)}
                  </CardTitle>
                  <CardDescription>
                    {format(new Date(meeting.scheduled_start), "d MMM yyyy", { locale: fr })}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-sm text-muted-foreground">
                    {t("videoMeetings.participantsCount", { count: meeting.participants?.filter((p: any) => p.status === "joined").length || 0 })}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
