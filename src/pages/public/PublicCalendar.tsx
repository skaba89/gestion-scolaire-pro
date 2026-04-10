import { useParams, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  GraduationCap,
  ArrowLeft,
  Calendar,
  Clock,
  MapPin,
  ChevronRight,
  Loader2,
  UserPlus,
  CalendarDays,
  Info
} from "lucide-react";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { format, parseISO, isAfter, isBefore, startOfDay } from "date-fns";
import { fr } from "date-fns/locale";

const PublicCalendar = () => {
  const { tenantSlug } = useParams<{ tenantSlug: string }>();
  const { t } = useTranslation();

  const { data: tenant, isLoading: tenantLoading } = useQuery({
    queryKey: ["public-tenant", tenantSlug],
    queryFn: async () => {
      const { data } = await apiClient.get('/admissions/public/tenants/', {
        params: { slug: tenantSlug, is_active: true },
      });
      return Array.isArray(data) ? data[0] ?? null : data;
    },
    enabled: !!tenantSlug,
  });

  const { data: academicYear } = useQuery({
    queryKey: ["public-academic-year", tenant?.id],
    queryFn: async () => {
      const { data } = await apiClient.get('/admissions/public/academic-years/', {
        params: { tenant_id: tenant!.id, is_current: true },
      });
      return Array.isArray(data) ? data[0] ?? null : data;
    },
    enabled: !!tenant?.id,
  });

  const { data: terms } = useQuery({
    queryKey: ["public-terms", academicYear?.id],
    queryFn: async () => {
      const { data } = await apiClient.get('/admissions/public/terms/', {
        params: { academic_year_id: academicYear!.id },
      });
      return Array.isArray(data) ? data : [];
    },
    enabled: !!academicYear?.id,
  });

  const { data: events, isLoading: eventsLoading } = useQuery({
    queryKey: ["public-events", tenant?.id],
    queryFn: async () => {
      const { data } = await apiClient.get('/admissions/public/events/', {
        params: { tenant_id: tenant!.id, is_public: true, end_date_from: new Date().toISOString() },
      });
      return Array.isArray(data) ? data : [];
    },
    enabled: !!tenant?.id,
  });

  if (tenantLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!tenant) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background">
        <h1 className="text-2xl font-bold text-foreground mb-4">Établissement non trouvé</h1>
        <Link to="/">
          <Button variant="outline">
            <ArrowLeft className="w-4 w-4 mr-2" />
            Retour à l'accueil
          </Button>
        </Link>
      </div>
    );
  }

  const today = startOfDay(new Date());

  const getEventTypeColor = (type: string) => {
    const colors: Record<string, string> = {
      academic: "bg-blue-500",
      holiday: "bg-green-500",
      exam: "bg-red-500",
      meeting: "bg-purple-500",
      sport: "bg-orange-500",
      cultural: "bg-pink-500",
      other: "bg-gray-500",
    };
    return colors[type] || colors.other;
  };

  const getEventTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      academic: "Académique",
      holiday: "Vacances",
      exam: "Examen",
      meeting: "Réunion",
      sport: "Sport",
      cultural: "Culturel",
      other: "Autre",
    };
    return labels[type] || type;
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-gradient-hero text-primary-foreground">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <Link to={`/ecole/${tenantSlug}`} className="flex items-center gap-3">
              {tenant.logo_url ? (
                <img
                  src={tenant.logo_url}
                  alt={tenant.name}
                  className="h-12 w-auto object-contain"
                />
              ) : (
                <div className="h-12 w-12 rounded-lg bg-primary-foreground/20 flex items-center justify-center">
                  <GraduationCap className="w-6 h-6" />
                </div>
              )}
              <span className="font-display font-bold text-xl hidden sm:block">
                {tenant.name}
              </span>
            </Link>
            <div className="flex items-center gap-4">
              <LanguageSwitcher />
              <Link to={`/admissions/${tenantSlug}`}>
                <Button className="bg-sky hover:bg-sky/90">
                  <UserPlus className="w-4 h-4 mr-2" />
                  Postuler
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </header>

      <div className="bg-muted/50 border-b">
        <div className="container mx-auto px-4 py-3">
          <nav className="flex items-center gap-2 text-sm">
            <Link to={`/ecole/${tenantSlug}`} className="text-muted-foreground hover:text-foreground">
              Accueil
            </Link>
            <ChevronRight className="w-4 w-4 text-muted-foreground" />
            <span className="text-foreground font-medium">Calendrier</span>
          </nav>
        </div>
      </div>

      <section className="bg-gradient-to-b from-muted/50 to-background py-16">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl">
            <h1 className="text-4xl md:text-5xl font-display font-bold text-foreground mb-4">
              Calendrier Scolaire
            </h1>
            <p className="text-lg text-muted-foreground">
              Retrouvez toutes les dates importantes de l'année scolaire : événements, vacances, examens et plus encore.
            </p>
            {academicYear && (
              <Badge variant="outline" className="mt-4">
                <CalendarDays className="w-3 h-3 mr-1" />
                Année scolaire {academicYear.name}
              </Badge>
            )}
          </div>
        </div>
      </section>

      <div className="container mx-auto px-4 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            <h2 className="text-2xl font-display font-bold text-foreground">
              Événements à venir
            </h2>
            {eventsLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : events && events.length > 0 ? (
              <div className="space-y-4">
                {events.map((event: any) => (
                  <Card key={event.id} className="hover:shadow-md transition-shadow">
                    <CardContent className="p-6">
                      <div className="flex items-start gap-4">
                        <div className="flex-shrink-0">
                          <div className="bg-muted rounded-lg p-3 text-center min-w-[60px]">
                            <div className="text-2xl font-bold text-foreground">
                              {format(parseISO(event.start_date), "d")}
                            </div>
                            <div className="text-xs text-muted-foreground uppercase">
                              {format(parseISO(event.start_date), "MMM", { locale: fr })}
                            </div>
                          </div>
                        </div>
                        <div className="flex-1">
                          <div className="flex items-start justify-between">
                            <div>
                              <h3 className="font-semibold text-foreground text-lg">
                                {event.title}
                              </h3>
                              <div className="flex flex-wrap items-center gap-3 mt-2 text-sm text-muted-foreground">
                                <span className="flex items-center gap-1">
                                  <Clock className="w-4 h-4" />
                                  {format(parseISO(event.start_date), "d MMM", { locale: fr })}
                                  {event.end_date !== event.start_date && (
                                    <> - {format(parseISO(event.end_date), "d MMM yyyy", { locale: fr })}</>
                                  )}
                                </span>
                                {event.location && (
                                  <span className="flex items-center gap-1">
                                    <MapPin className="w-4 h-4" />
                                    {event.location}
                                  </span>
                                )}
                              </div>
                            </div>
                            <Badge className={`${getEventTypeColor(event.event_type)} text-white`}>
                              {getEventTypeLabel(event.event_type)}
                            </Badge>
                          </div>
                          {event.description && (
                            <p className="mt-3 text-muted-foreground">{event.description}</p>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <Card>
                <CardContent className="p-12 text-center">
                  <Calendar className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-foreground mb-2">
                    Aucun événement à venir
                  </h3>
                  <p className="text-muted-foreground">
                    Les événements seront publiés prochainement.
                  </p>
                </CardContent>
              </Card>
            )}
          </div>

          <div className="space-y-6">
            <h2 className="text-2xl font-display font-bold text-foreground">
              Périodes scolaires
            </h2>
            {terms && terms.length > 0 ? (
              <div className="space-y-4">
                {terms.map((term: any) => {
                  const isActive =
                    isAfter(today, parseISO(term.start_date)) &&
                    isBefore(today, parseISO(term.end_date));
                  return (
                    <Card
                      key={term.id}
                      className={isActive ? "border-primary shadow-md" : ""}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between mb-2">
                          <h3 className="font-semibold text-foreground">{term.name}</h3>
                          {isActive && <Badge variant="default">En cours</Badge>}
                        </div>
                        <p className="text-sm text-muted-foreground">
                          Du {format(parseISO(term.start_date), "d MMMM yyyy", { locale: fr })}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Au {format(parseISO(term.end_date), "d MMMM yyyy", { locale: fr })}
                        </p>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            ) : (
              <Card>
                <CardContent className="p-6 text-center">
                  <Info className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">
                    Aucune période définie
                  </p>
                </CardContent>
              </Card>
            )}

            {academicYear && (
              <Card className="bg-muted/50">
                <CardContent className="p-4">
                  <h3 className="font-semibold text-foreground mb-2">Année scolaire</h3>
                  <p className="text-sm text-muted-foreground mb-1">
                    <strong>Début:</strong>{" "}
                    {format(parseISO(academicYear.start_date), "d MMMM yyyy", { locale: fr })}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    <strong>Fin:</strong>{" "}
                    {format(parseISO(academicYear.end_date), "d MMMM yyyy", { locale: fr })}
                  </p>
                </CardContent>
              </Card>
            )}

            <Card className="bg-gradient-primary text-primary-foreground border-0">
              <CardContent className="p-6 text-center">
                <UserPlus className="w-8 h-8 mx-auto mb-3 opacity-80" />
                <h3 className="font-semibold mb-2">Inscriptions ouvertes</h3>
                <p className="text-sm text-primary-foreground/80 mb-4">
                  Rejoignez notre établissement pour la prochaine rentrée.
                </p>
                <Link to={`/admissions/${tenantSlug}`}>
                  <Button className="w-full bg-sky hover:bg-sky/90">
                    Postuler maintenant
                  </Button>
                </Link>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      <footer className="bg-card border-t border-border py-8">
        <div className="container mx-auto px-4 text-center">
          <p className="text-sm text-muted-foreground">
            © {new Date().getFullYear()} {tenant.name}. Tous droits réservés.
          </p>
        </div>
      </footer>
    </div>
  );
};

export default PublicCalendar;
