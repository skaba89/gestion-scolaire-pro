import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/api/client";
import { useTenant } from "@/contexts/TenantContext";
import { useAuth } from "@/contexts/AuthContext";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { toast } from "sonner";
import { studentsService } from "@/features/students/services/studentsService";
import { useTranslation } from "react-i18next";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { resolveUploadUrl } from "@/utils/url";
import {
  Briefcase, Calendar, Users, Search, MapPin, Building2,
  ExternalLink, Clock, Send, GraduationCap, Linkedin, Check, FileText
} from "lucide-react";

type JobOfferType = "INTERNSHIP" | "JOB" | "APPRENTICESHIP" | "VOLUNTEER";

const StudentCareers = () => {
  const { t } = useTranslation();
  const { tenant } = useTenant();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState("offers");
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [showApplyDialog, setShowApplyDialog] = useState(false);
  const [showMentorDialog, setShowMentorDialog] = useState(false);
  const [selectedOffer, setSelectedOffer] = useState<any>(null);
  const [selectedMentor, setSelectedMentor] = useState<any>(null);

  const [applicationForm, setApplicationForm] = useState({
    cover_letter: "",
  });

  const [mentorshipForm, setMentorshipForm] = useState({
    message: "",
    goals: "",
  });

  const offerTypeVariants = useMemo(
    () => ({
      INTERNSHIP: { label: t("careers.offerTypeInternship"), variant: "default" as const },
      JOB: { label: t("careers.offerTypeJob"), variant: "secondary" as const },
      APPRENTICESHIP: { label: t("careers.offerTypeApprenticeship"), variant: "outline" as const },
      VOLUNTEER: { label: t("careers.offerTypeVolunteer"), variant: "destructive" as const },
    }),
    [t]
  );

  const statusVariants = useMemo(
    () => ({
      PENDING: { label: t("careers.appStatusPending"), className: "bg-yellow-500" },
      REVIEWING: { label: t("careers.appStatusReview"), className: "bg-blue-500" },
      INTERVIEW: { label: t("careers.appStatusInterview"), className: "bg-purple-500" },
      ACCEPTED: { label: t("careers.appStatusAccepted"), className: "bg-green-500" },
      REJECTED: { label: t("careers.appStatusRejected"), className: "bg-red-500" },
      WITHDRAWN: { label: t("careers.appStatusWithdrawn"), className: "bg-gray-500" },
      ACTIVE: { label: t("careers.eventStatusActive"), className: "bg-green-500" },
      COMPLETED: { label: t("careers.eventStatusCompleted"), className: "bg-gray-500" },
      CANCELLED: { label: t("careers.eventStatusCancelled"), className: "bg-red-500" },
    }),
    [t]
  );

  const eventTypeLabels = useMemo(
    () => ({
      workshop: t("careers.eventTypeWorkshop"),
      conference: t("careers.eventTypeConference"),
      fair: t("careers.eventTypeFair"),
      networking: t("careers.eventTypeNetworking"),
      webinar: t("careers.eventTypeWebinar"),
    }),
    [t]
  );

  // Get current student
  const { data: currentStudent } = useQuery({
    queryKey: ["current-student", user?.id, tenant?.id],
    queryFn: () => studentsService.getProfile(user?.id || "", tenant?.id || ""),
    enabled: !!user?.id && !!tenant?.id,
  });

  // Fetch job offers
  const { data: jobOffers = [] } = useQuery({
    queryKey: ["job-offers-student", tenant?.id],
    queryFn: () => studentsService.getJobOffers(tenant?.id || ""),
    enabled: !!tenant?.id,
  });

  // Fetch my applications
  const { data: myApplications = [], isLoading: isLoadingApplications } = useQuery({
    queryKey: ["my-applications", currentStudent?.id],
    queryFn: () => studentsService.getMyApplications(currentStudent?.id || ""),
    enabled: !!currentStudent?.id,
  });

  // Fetch career events
  const { data: careerEvents = [] } = useQuery({
    queryKey: ["career-events-student", tenant?.id],
    queryFn: () => studentsService.getCareerEvents(tenant?.id || ""),
    enabled: !!tenant?.id,
  });

  // Fetch my event registrations
  const { data: myEventRegistrations = [] } = useQuery({
    queryKey: ["my-event-registrations", currentStudent?.id],
    queryFn: () => studentsService.getMyEventRegistrations(currentStudent?.id || ""),
    enabled: !!currentStudent?.id,
  });

  // Fetch available mentors
  const { data: mentors = [] } = useQuery({
    queryKey: ["available-mentors", tenant?.id],
    queryFn: () => studentsService.getMentors(tenant?.id || ""),
    enabled: !!tenant?.id,
  });

  // Fetch my mentorship requests
  const { data: myMentorshipRequests = [] } = useQuery({
    queryKey: ["my-mentorship-requests", currentStudent?.id],
    queryFn: () => studentsService.getMyMentorshipRequests(currentStudent?.id || ""),
    enabled: !!currentStudent?.id,
  });

  // Apply to job mutation
  const applyMutation = useMutation({
    mutationFn: async () => {
      if (!currentStudent?.id || !selectedOffer?.id || !tenant?.id) {
        throw new Error("Missing data");
      }
      await apiClient.post("/alumni/careers/applications/", {
        job_offer_id: selectedOffer.id,
        student_id: currentStudent.id,
        cover_letter: applicationForm.cover_letter,
        status: "PENDING",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-applications"] });
      setShowApplyDialog(false);
      setSelectedOffer(null);
      setApplicationForm({ cover_letter: "" });
      toast.success(t("careers.applicationSuccess"));
    },
    onError: (error: any) => {
      if (error.response?.status === 409) {
        toast.error(t("careers.alreadyAppliedError"));
      } else {
        toast.error(t("careers.applicationError"));
      }
    },
  });

  // Register to event mutation
  const registerEventMutation = useMutation({
    mutationFn: async (eventId: string) => {
      if (!currentStudent?.id || !tenant?.id) throw new Error("Missing data");
      await apiClient.post("/school-life/event-registrations/", {
        event_id: eventId,
        student_id: currentStudent.id,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-event-registrations"] });
      toast.success(t("careers.registrationSuccess"));
    },
    onError: (error: any) => {
      if (error.response?.status === 409) {
        toast.error(t("careers.alreadyRegistered"));
      } else {
        toast.error(t("careers.registrationError"));
      }
    },
  });

  // Request mentorship mutation
  const requestMentorshipMutation = useMutation({
    mutationFn: async () => {
      if (!currentStudent?.id || !selectedMentor?.id || !tenant?.id) {
        throw new Error("Missing data");
      }
      await apiClient.post("/alumni/mentorship-requests/", {
        mentor_id: selectedMentor.id,
        student_id: currentStudent.id,
        message: mentorshipForm.message,
        goals: mentorshipForm.goals,
        status: "pending",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-mentorship-requests"] });
      setShowMentorDialog(false);
      setSelectedMentor(null);
      setMentorshipForm({ message: "", goals: "" });
      toast.success(t("careers.mentoringSuccess"));
    },
    onError: (error: any) => {
      if (error.response?.status === 409) {
        toast.error(t("careers.alreadyContacted"));
      } else {
        toast.error(t("careers.mentoringError"));
      }
    },
  });

  const getOfferTypeBadge = (type: JobOfferType) => {
    const { label, variant } = offerTypeVariants[type] || { label: type, variant: "default" as const };
    return <Badge variant={variant}>{label}</Badge>;
  };

  const getStatusBadge = (status: string) => {
    const { label, className } = statusVariants[status as keyof typeof statusVariants] || { label: status, className: "bg-gray-500" };
    return <Badge className={className}>{label}</Badge>;
  };

  const hasApplied = (offerId: string) => {
    if (isLoadingApplications) return false; // don't block UI while loading
    return myApplications.some(app => app.job_offer_id === offerId);
  };

  const isRegistered = (eventId: string) => {
    return myEventRegistrations.includes(eventId);
  };

  const hasMentorshipRequest = (mentorId: string) => {
    return myMentorshipRequests.some(req => req.mentor_id === mentorId);
  };

  const filteredOffers = jobOffers.filter(offer => {
    const matchesSearch = offer.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      offer.company_name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = filterType === "all" || offer.offer_type === filterType;
    return matchesSearch && matchesType;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">{t("careers.pageTitle")}</h1>
        <p className="text-muted-foreground">
          {t("careers.pageSubtitle")}
        </p>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="offers">
            <Briefcase className="h-4 w-4 mr-2" />
            {t("careers.tabOffers")}
          </TabsTrigger>
          <TabsTrigger value="applications">
            <FileText className="h-4 w-4 mr-2" />
            {t("careers.tabApplications")}
          </TabsTrigger>
          <TabsTrigger value="events">
            <Calendar className="h-4 w-4 mr-2" />
            {t("careers.tabEvents")}
          </TabsTrigger>
          <TabsTrigger value="mentors">
            <GraduationCap className="h-4 w-4 mr-2" />
            {t("careers.tabMentoring")}
          </TabsTrigger>
        </TabsList>

        {/* Offers Tab */}
        <TabsContent value="offers" className="space-y-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={t("careers.searchPlaceholder")}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder={t("careers.filterType")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("careers.typeAll")}</SelectItem>
                <SelectItem value="INTERNSHIP">{t("careers.typeInternship")}</SelectItem>
                <SelectItem value="JOB">{t("careers.typeJob")}</SelectItem>
                <SelectItem value="APPRENTICESHIP">{t("careers.typeApprenticeship")}</SelectItem>
                <SelectItem value="VOLUNTEER">{t("careers.typeVolunteer")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredOffers.map((offer) => (
              <Card key={offer.id} className="flex flex-col">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    {getOfferTypeBadge(offer.offer_type)}
                    {offer.is_remote && <Badge variant="outline">{t("careers.remote")}</Badge>}
                  </div>
                  <CardTitle className="text-lg mt-2">{offer.title}</CardTitle>
                  <CardDescription className="flex items-center gap-1">
                    <Building2 className="h-4 w-4" />
                    {offer.company_name}
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex-1 space-y-3">
                  <p className="text-sm text-muted-foreground line-clamp-3">
                    {offer.description}
                  </p>
                  {offer.location && (
                    <div className="flex items-center gap-1 text-sm">
                      <MapPin className="h-4 w-4 text-muted-foreground" />
                      {offer.location}
                    </div>
                  )}
                  {offer.salary_range && (
                    <Badge variant="secondary">{offer.salary_range}</Badge>
                  )}
                  {offer.application_deadline && (
                    <div className="flex items-center gap-1 text-sm text-muted-foreground">
                      <Clock className="h-4 w-4" />
                      {t("careers.deadline")} {format(new Date(offer.application_deadline), "dd MMM yyyy", { locale: fr })}
                    </div>
                  )}
                </CardContent>
                <CardFooter className="gap-2">
                  {isLoadingApplications ? (
                    <Button variant="secondary" disabled className="flex-1">
                      <span className="h-4 w-4 mr-2 animate-spin rounded-full border-2 border-current border-t-transparent" />
                      Chargement...
                    </Button>
                  ) : hasApplied(offer.id) ? (
                    <Button variant="secondary" disabled className="flex-1">
                      <Check className="h-4 w-4 mr-2" />
                      {t("careers.alreadyApplied")}
                    </Button>
                  ) : (
                    <Dialog open={showApplyDialog && selectedOffer?.id === offer.id} onOpenChange={(open) => {
                      setShowApplyDialog(open);
                      if (!open) setSelectedOffer(null);
                    }}>
                      <DialogTrigger asChild>
                        <Button className="flex-1" onClick={() => setSelectedOffer(offer)}>
                          <Send className="h-4 w-4 mr-2" />
                          {t("careers.apply")}
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Postuler à {offer.title}</DialogTitle>
                          <DialogDescription>{offer.company_name}</DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4 py-4">
                          <div className="space-y-2">
                            <Label>{t("careers.coverLetter")}</Label>
                            <Textarea
                              value={applicationForm.cover_letter}
                              onChange={(e) => setApplicationForm({ cover_letter: e.target.value })}
                              placeholder={t("careers.coverLetterPlaceholder")}
                              rows={6}
                            />
                          </div>
                          <Button
                            onClick={() => applyMutation.mutate()}
                            disabled={applyMutation.isPending}
                            className="w-full"
                          >
                            {applyMutation.isPending ? t("careers.sending") : t("careers.sendApplication")}
                          </Button>
                        </div>
                      </DialogContent>
                    </Dialog>
                  )}
                  {offer.external_url && (
                    <Button variant="outline" size="icon" asChild>
                      <a href={offer.external_url} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    </Button>
                  )}
                </CardFooter>
              </Card>
            ))}
            {filteredOffers.length === 0 && (
              <Card className="col-span-full">
                <CardContent className="py-8 text-center text-muted-foreground">
                  {t("careers.noOffers")}
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        {/* My Applications Tab */}
        <TabsContent value="applications" className="space-y-4">
          <div className="grid gap-4">
            {myApplications.map((app) => (
              <Card key={app.id}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle>{app.job_offers?.title}</CardTitle>
                      <CardDescription>{app.job_offers?.company_name}</CardDescription>
                    </div>
                    {getStatusBadge(app.status)}
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <span>Postulé le {app.applied_at ? format(new Date(app.applied_at), "dd MMM yyyy", { locale: fr }) : "—"}</span>
                    {app.job_offers && getOfferTypeBadge(app.job_offers.offer_type)}
                  </div>
                </CardContent>
              </Card>
            ))}
            {myApplications.length === 0 && (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  {t("careers.noApplications")}
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        {/* Events Tab */}
        <TabsContent value="events" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {careerEvents.map((event) => (
              <Card key={event.id}>
                <CardHeader>
                  <Badge variant="outline" className="w-fit mb-2">
                    {eventTypeLabels[event.event_type as keyof typeof eventTypeLabels] ?? event.event_type}
                  </Badge>
                  <CardTitle className="text-lg">{event.title}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {event.description && (
                    <p className="text-sm text-muted-foreground line-clamp-2">{event.description}</p>
                  )}
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <span>
                        {format(new Date(event.start_datetime), "dd MMM yyyy 'à' HH:mm", { locale: fr })}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-muted-foreground" />
                      <span>{event.is_online ? t("careers.online") : event.location || t("careers.locationTbd")}</span>
                    </div>
                  </div>
                </CardContent>
                <CardFooter>
                  {isRegistered(event.id) ? (
                    <Button variant="secondary" disabled className="w-full">
                      <Check className="h-4 w-4 mr-2" />
                      {t("careers.registered")}
                    </Button>
                  ) : (
                    <Button
                      className="w-full"
                      onClick={() => registerEventMutation.mutate(event.id)}
                      disabled={registerEventMutation.isPending}
                    >
                      {t("careers.register")}
                    </Button>
                  )}
                </CardFooter>
              </Card>
            ))}
            {careerEvents.length === 0 && (
              <Card className="col-span-full">
                <CardContent className="py-8 text-center text-muted-foreground">
                  {t("careers.noEvents")}
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        {/* Mentors Tab */}
        <TabsContent value="mentors" className="space-y-6">
          {/* My mentorship requests */}
          {myMentorshipRequests.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>{t("careers.myMentoringRequests")}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {myMentorshipRequests.map((request) => (
                    <div key={request.id} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                      <div>
                        <p className="font-medium">
                          {request.alumni_mentors?.first_name} {request.alumni_mentors?.last_name}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {request.alumni_mentors?.current_company}
                        </p>
                      </div>
                      {getStatusBadge(request.status)}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Available mentors */}
          <div>
            <h3 className="text-lg font-semibold mb-4">{t("careers.availableMentors")}</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {mentors.map((mentor) => (
                <Card key={mentor.id}>
                  <CardHeader>
                    <div className="flex items-center gap-3">
                      <Avatar className="h-12 w-12">
                        <AvatarImage src={resolveUploadUrl(mentor.photo_url)} />
                        <AvatarFallback>
                          {mentor.first_name[0]}{mentor.last_name[0]}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <CardTitle className="text-lg">
                          {mentor.first_name} {mentor.last_name}
                        </CardTitle>
                        {mentor.graduation_year && (
                          <p className="text-sm text-muted-foreground">
                            Promotion {mentor.graduation_year}
                          </p>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {(mentor.current_position || mentor.current_company) && (
                      <div className="flex items-center gap-2 text-sm">
                        <Building2 className="h-4 w-4 text-muted-foreground" />
                        <span>
                          {mentor.current_position}
                          {mentor.current_position && mentor.current_company && " @ "}
                          {mentor.current_company}
                        </span>
                      </div>
                    )}
                    {mentor.industry && (
                      <Badge variant="outline">{mentor.industry}</Badge>
                    )}
                    {mentor.expertise_areas && mentor.expertise_areas.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {mentor.expertise_areas.slice(0, 3).map((exp: string) => (
                          <Badge key={exp} variant="secondary" className="text-xs">
                            {exp}
                          </Badge>
                        ))}
                      </div>
                    )}
                    {mentor.bio && (
                      <p className="text-sm text-muted-foreground line-clamp-2">{mentor.bio}</p>
                    )}
                  </CardContent>
                  <CardFooter className="gap-2">
                    {hasMentorshipRequest(mentor.id) ? (
                      <Button variant="secondary" disabled className="flex-1">
                        <Check className="h-4 w-4 mr-2" />
                        Demande envoyée
                      </Button>
                    ) : (
                      <Dialog open={showMentorDialog && selectedMentor?.id === mentor.id} onOpenChange={(open) => {
                        setShowMentorDialog(open);
                        if (!open) setSelectedMentor(null);
                      }}>
                        <DialogTrigger asChild>
                          <Button className="flex-1" onClick={() => setSelectedMentor(mentor)}>
                            <Send className="h-4 w-4 mr-2" />
                            {t("careers.contact")}
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>{t("careers.requestMentoring")}</DialogTitle>
                            <DialogDescription>
                              {mentor.first_name} {mentor.last_name} - {mentor.current_position}
                            </DialogDescription>
                          </DialogHeader>
                          <div className="space-y-4 py-4">
                            <div className="space-y-2">
                              <Label>{t("careers.introMessage")}</Label>
                              <Textarea
                                value={mentorshipForm.message}
                                onChange={(e) => setMentorshipForm({ ...mentorshipForm, message: e.target.value })}
                                placeholder={t("careers.introPlaceholder")}
                                rows={4}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>{t("careers.goals")}</Label>
                              <Textarea
                                value={mentorshipForm.goals}
                                onChange={(e) => setMentorshipForm({ ...mentorshipForm, goals: e.target.value })}
                                placeholder={t("careers.goalsPlaceholder")}
                                rows={3}
                              />
                            </div>
                            <Button
                              onClick={() => requestMentorshipMutation.mutate()}
                              disabled={requestMentorshipMutation.isPending}
                              className="w-full"
                            >
                              {requestMentorshipMutation.isPending ? t("careers.sending") : t("careers.sendRequest")}
                            </Button>
                          </div>
                        </DialogContent>
                      </Dialog>
                    )}
                    {mentor.linkedin_url && (
                      <Button variant="outline" size="icon" asChild>
                        <a href={mentor.linkedin_url} target="_blank" rel="noopener noreferrer">
                          <Linkedin className="h-4 w-4" />
                        </a>
                      </Button>
                    )}
                  </CardFooter>
                </Card>
              ))}
              {mentors.length === 0 && (
                <Card className="col-span-full">
                  <CardContent className="py-8 text-center text-muted-foreground">
                    {t("careers.noMentors")}
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default StudentCareers;
