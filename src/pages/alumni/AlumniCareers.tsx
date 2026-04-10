import { 
  useAlumniJobOffers, 
  useAlumniMentors, 
  useAlumniCareerEvents 
} from "@/queries/alumni";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { 
  Briefcase, 
  Calendar, 
  MapPin, 
  Users, 
  ExternalLink,
  Building,
  Clock
} from "lucide-react";

export default function AlumniCareers() {

  // Fetch data using hooks from sovereign API
  const { data: jobOffers, isLoading: loadingJobs } = useAlumniJobOffers();
  const { data: mentors, isLoading: loadingMentors } = useAlumniMentors();
  const { data: events, isLoading: loadingEvents } = useAlumniCareerEvents();


  const offerTypeLabels: Record<string, string> = {
    INTERNSHIP: "Stage",
    JOB: "Emploi",
    APPRENTICESHIP: "Alternance",
    FREELANCE: "Freelance",
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-display font-bold text-foreground">
          Carrières & Réseau Alumni
        </h1>
        <p className="text-muted-foreground">
          Opportunités professionnelles et mentorat
        </p>
      </div>

      <Tabs defaultValue="jobs" className="w-full">
        <TabsList className="grid w-full grid-cols-3 max-w-lg">
          <TabsTrigger value="jobs" className="gap-2">
            <Briefcase className="w-4 h-4" />
            Offres ({jobOffers?.length || 0})
          </TabsTrigger>
          <TabsTrigger value="mentors" className="gap-2">
            <Users className="w-4 h-4" />
            Mentors ({mentors?.length || 0})
          </TabsTrigger>
          <TabsTrigger value="events" className="gap-2">
            <Calendar className="w-4 h-4" />
            Événements ({events?.length || 0})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="jobs" className="mt-6">
          {loadingJobs ? (
            <div className="grid gap-4 md:grid-cols-2">
              {[1, 2, 3].map((i) => (
                <Card key={i} className="animate-pulse">
                  <CardContent className="pt-6 h-40" />
                </Card>
              ))}
            </div>
          ) : jobOffers?.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <Briefcase className="h-12 w-12 text-muted-foreground/50 mb-4" />
                <h3 className="font-semibold text-lg">Aucune offre disponible</h3>
                <p className="text-muted-foreground mt-1">
                  Revenez bientôt pour découvrir de nouvelles opportunités
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {jobOffers?.map((offer) => (
                <Card key={offer.id} className="hover:border-primary/50 transition-colors">
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-lg">{offer.title}</CardTitle>
                        <CardDescription className="flex items-center gap-1 mt-1">
                          <Building className="h-3 w-3" />
                          {offer.company_name || "Entreprise"}
                        </CardDescription>
                      </div>
                      <Badge variant="secondary">
                        {offerTypeLabels[offer.offer_type] || offer.offer_type}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {offer.description}
                    </p>
                    <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                      {offer.location && (
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {offer.location}
                        </span>
                      )}
                      {offer.is_remote && (
                        <Badge variant="outline" className="text-xs">Télétravail</Badge>
                      )}
                      {offer.application_deadline && (
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          Avant le {format(new Date(offer.application_deadline), "d MMM", { locale: fr })}
                        </span>
                      )}
                    </div>
                    {offer.contact_email && (
                      <Button variant="outline" size="sm" className="w-full" asChild>
                        <a href={`mailto:${offer.contact_email}`}>
                          Postuler
                          <ExternalLink className="h-3 w-3 ml-2" />
                        </a>
                      </Button>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="mentors" className="mt-6">
          {loadingMentors ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3].map((i) => (
                <Card key={i} className="animate-pulse">
                  <CardContent className="pt-6 h-48" />
                </Card>
              ))}
            </div>
          ) : mentors?.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <Users className="h-12 w-12 text-muted-foreground/50 mb-4" />
                <h3 className="font-semibold text-lg">Aucun mentor disponible</h3>
                <p className="text-muted-foreground mt-1">
                  Le programme de mentorat sera bientôt disponible
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {mentors?.map((mentor) => (
                <Card key={mentor.id} className="hover:border-primary/50 transition-colors">
                  <CardContent className="pt-6">
                    <div className="flex items-start gap-4">
                      <Avatar className="h-12 w-12">
                        <AvatarFallback>
                          {mentor.first_name?.[0]}{mentor.last_name?.[0]}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold truncate">
                          {mentor.first_name} {mentor.last_name}
                        </h3>
                        <p className="text-sm text-muted-foreground truncate">
                          {mentor.current_position}
                        </p>
                        {mentor.current_company && (
                          <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                            <Building className="h-3 w-3" />
                            {mentor.current_company}
                          </p>
                        )}
                      </div>
                    </div>
                    {mentor.bio && (
                      <p className="text-sm text-muted-foreground mt-3 line-clamp-2">
                        {mentor.bio}
                      </p>
                    )}
                    {mentor.expertise_areas && mentor.expertise_areas.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-3">
                        {mentor.expertise_areas.slice(0, 3).map((area, i) => (
                          <Badge key={i} variant="secondary" className="text-xs">
                            {area}
                          </Badge>
                        ))}
                      </div>
                    )}
                    <div className="flex gap-2 mt-4">
                      {mentor.linkedin_url && (
                        <Button variant="outline" size="sm" asChild>
                          <a href={mentor.linkedin_url} target="_blank" rel="noopener noreferrer">
                            LinkedIn
                            <ExternalLink className="h-3 w-3 ml-1" />
                          </a>
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="events" className="mt-6">
          {loadingEvents ? (
            <div className="space-y-4">
              {[1, 2].map((i) => (
                <Card key={i} className="animate-pulse">
                  <CardContent className="pt-6 h-32" />
                </Card>
              ))}
            </div>
          ) : events?.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <Calendar className="h-12 w-12 text-muted-foreground/50 mb-4" />
                <h3 className="font-semibold text-lg">Aucun événement à venir</h3>
                <p className="text-muted-foreground mt-1">
                  Restez connecté pour ne pas manquer les prochains événements
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {events?.map((event) => (
                <Card key={event.id} className="hover:border-primary/50 transition-colors">
                  <CardContent className="pt-6">
                    <div className="flex items-start gap-4">
                      <div className="p-3 rounded-lg bg-primary/10 text-center min-w-[60px]">
                        <p className="text-2xl font-bold text-primary">
                          {format(new Date(event.start_datetime), "d", { locale: fr })}
                        </p>
                        <p className="text-xs text-primary uppercase">
                          {format(new Date(event.start_datetime), "MMM", { locale: fr })}
                        </p>
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold">{event.title}</h3>
                          {event.event_type && (
                            <Badge variant="outline" className="text-xs capitalize">
                              {event.event_type}
                            </Badge>
                          )}
                        </div>
                        {event.description && (
                          <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                            {event.description}
                          </p>
                        )}
                        <div className="flex flex-wrap gap-3 mt-2 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {format(new Date(event.start_datetime), "HH:mm", { locale: fr })}
                          </span>
                          {event.location && (
                            <span className="flex items-center gap-1">
                              <MapPin className="h-3 w-3" />
                              {event.location}
                            </span>
                          )}
                          {event.is_online && (
                            <Badge variant="secondary" className="text-xs">En ligne</Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
