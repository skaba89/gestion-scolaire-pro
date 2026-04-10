import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { 
  Shield, 
  Monitor, 
  Smartphone, 
  Tablet, 
  Globe, 
  Clock, 
  CheckCircle, 
  XCircle,
  LogOut,
  Search,
  RefreshCw,
  AlertTriangle,
  MapPin,
  Activity,
  Lock,
  Unlock
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { getLoginHistory, getActiveSessions, terminateSession } from "@/hooks/useLoginTracking";
import { useToast } from "@/hooks/use-toast";
import { format, subDays, isAfter } from "date-fns";
import { fr } from "date-fns/locale";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, Legend } from "recharts";

const SecuritySessions = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [timeFilter, setTimeFilter] = useState<"7d" | "30d" | "all">("7d");

  const { data: loginHistory = [], isLoading: historyLoading, refetch: refetchHistory } = useQuery({
    queryKey: ["login-history"],
    queryFn: () => getLoginHistory(),
  });

  const { data: activeSessions = [], isLoading: sessionsLoading, refetch: refetchSessions } = useQuery({
    queryKey: ["active-sessions"],
    queryFn: () => getActiveSessions(),
  });

  const terminateMutation = useMutation({
    mutationFn: terminateSession,
    onSuccess: () => {
      toast({ title: "Session terminée", description: "La session a été déconnectée avec succès." });
      queryClient.invalidateQueries({ queryKey: ["active-sessions"] });
    },
    onError: () => {
      toast({ title: "Erreur", description: "Impossible de terminer la session.", variant: "destructive" });
    },
  });

  const terminateAllOtherSessions = async () => {
    const otherSessions = activeSessions.filter((s: any) => s.user_id !== user?.id);
    for (const session of otherSessions) {
      await terminateSession(session.id);
    }
    queryClient.invalidateQueries({ queryKey: ["active-sessions"] });
    toast({ title: "Sessions terminées", description: `${otherSessions.length} session(s) déconnectée(s).` });
  };

  const getDeviceIcon = (deviceType?: string) => {
    switch (deviceType) {
      case "mobile":
        return <Smartphone className="h-4 w-4" />;
      case "tablet":
        return <Tablet className="h-4 w-4" />;
      default:
        return <Monitor className="h-4 w-4" />;
    }
  };

  // Filter history based on time
  const getFilteredHistory = () => {
    let filtered = loginHistory;
    if (timeFilter === "7d") {
      filtered = loginHistory.filter((entry: any) => 
        isAfter(new Date(entry.created_at), subDays(new Date(), 7))
      );
    } else if (timeFilter === "30d") {
      filtered = loginHistory.filter((entry: any) => 
        isAfter(new Date(entry.created_at), subDays(new Date(), 30))
      );
    }
    return filtered.filter((entry: any) => 
      entry.ip_address?.includes(searchTerm) ||
      entry.browser?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      entry.os?.toLowerCase().includes(searchTerm.toLowerCase())
    );
  };

  const filteredHistory = getFilteredHistory();

  const successfulLogins = filteredHistory.filter((entry: any) => entry.success).length;
  const failedLogins = filteredHistory.filter((entry: any) => !entry.success).length;

  // Chart data: logins by day
  const getLoginsByDay = () => {
    const days: Record<string, { date: string; success: number; failed: number }> = {};
    const daysToShow = timeFilter === "7d" ? 7 : timeFilter === "30d" ? 30 : 30;
    
    for (let i = daysToShow - 1; i >= 0; i--) {
      const date = format(subDays(new Date(), i), "yyyy-MM-dd");
      days[date] = { date: format(subDays(new Date(), i), "dd MMM", { locale: fr }), success: 0, failed: 0 };
    }
    
    filteredHistory.forEach((entry: any) => {
      const date = format(new Date(entry.created_at), "yyyy-MM-dd");
      if (days[date]) {
        if (entry.success) {
          days[date].success++;
        } else {
          days[date].failed++;
        }
      }
    });
    
    return Object.values(days);
  };

  // Chart data: devices distribution
  const getDeviceDistribution = () => {
    const devices: Record<string, number> = { Desktop: 0, Mobile: 0, Tablet: 0 };
    filteredHistory.forEach((entry: any) => {
      if (entry.device_type === "mobile") devices.Mobile++;
      else if (entry.device_type === "tablet") devices.Tablet++;
      else devices.Desktop++;
    });
    return Object.entries(devices).map(([name, value]) => ({ name, value }));
  };

  // Chart data: browsers distribution
  const getBrowserDistribution = () => {
    const browsers: Record<string, number> = {};
    filteredHistory.forEach((entry: any) => {
      const browser = entry.browser || "Inconnu";
      browsers[browser] = (browsers[browser] || 0) + 1;
    });
    return Object.entries(browsers)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, value]) => ({ name, value }));
  };

  // Suspicious activity detection
  const getSuspiciousActivities = () => {
    const suspicious: any[] = [];
    const ipFailures: Record<string, number> = {};
    
    filteredHistory.forEach((entry: any) => {
      if (!entry.success) {
        const ip = entry.ip_address || "unknown";
        ipFailures[ip] = (ipFailures[ip] || 0) + 1;
      }
    });
    
    Object.entries(ipFailures).forEach(([ip, count]) => {
      if (count >= 3) {
        suspicious.push({
          type: "brute_force",
          ip,
          count,
          message: `${count} tentatives échouées depuis ${ip}`,
        });
      }
    });
    
    return suspicious;
  };

  const suspiciousActivities = getSuspiciousActivities();
  const COLORS = ["hsl(var(--primary))", "hsl(var(--secondary))", "hsl(var(--accent))", "#8884d8", "#82ca9d"];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground flex items-center gap-2">
            <Shield className="h-8 w-8 text-primary" />
            Sécurité & Sessions
          </h1>
          <p className="text-muted-foreground mt-1">
            Surveillez les connexions et gérez les sessions actives
          </p>
        </div>
        <div className="flex gap-2">
          <select
            className="px-3 py-2 border rounded-md bg-background text-sm"
            value={timeFilter}
            onChange={(e) => setTimeFilter(e.target.value as "7d" | "30d" | "all")}
          >
            <option value="7d">7 derniers jours</option>
            <option value="30d">30 derniers jours</option>
            <option value="all">Tout</option>
          </select>
          <Button onClick={() => { refetchHistory(); refetchSessions(); }} variant="outline">
            <RefreshCw className="h-4 w-4 mr-2" />
            Actualiser
          </Button>
        </div>
      </div>

      {/* Suspicious Activity Alert */}
      {suspiciousActivities.length > 0 && (
        <Card className="border-red-500/50 bg-red-500/5">
          <CardHeader className="pb-3">
            <CardTitle className="text-red-600 flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              Activités suspectes détectées
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {suspiciousActivities.map((activity, idx) => (
                <li key={idx} className="flex items-center gap-2 text-sm">
                  <Lock className="h-4 w-4 text-red-500" />
                  <span>{activity.message}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Sessions actives</p>
                <p className="text-2xl font-bold">{activeSessions.length}</p>
              </div>
              <div className="p-3 bg-primary/10 rounded-full">
                <Activity className="h-6 w-6 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Connexions réussies</p>
                <p className="text-2xl font-bold text-green-600">{successfulLogins}</p>
              </div>
              <div className="p-3 bg-green-100 dark:bg-green-900/20 rounded-full">
                <CheckCircle className="h-6 w-6 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Tentatives échouées</p>
                <p className="text-2xl font-bold text-red-600">{failedLogins}</p>
              </div>
              <div className="p-3 bg-red-100 dark:bg-red-900/20 rounded-full">
                <XCircle className="h-6 w-6 text-red-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Taux de succès</p>
                <p className="text-2xl font-bold">
                  {filteredHistory.length > 0 
                    ? Math.round((successfulLogins / filteredHistory.length) * 100) 
                    : 0}%
                </p>
              </div>
              <div className="p-3 bg-blue-100 dark:bg-blue-900/20 rounded-full">
                <Shield className="h-6 w-6 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Alertes</p>
                <p className="text-2xl font-bold text-yellow-600">{suspiciousActivities.length}</p>
              </div>
              <div className="p-3 bg-yellow-100 dark:bg-yellow-900/20 rounded-full">
                <AlertTriangle className="h-6 w-6 text-yellow-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Historique des connexions</CardTitle>
            <CardDescription>Connexions réussies vs échouées par jour</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={getLoginsByDay()}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="date" className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                  <YAxis className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--background))', 
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px'
                    }} 
                  />
                  <Legend />
                  <Line type="monotone" dataKey="success" name="Réussies" stroke="hsl(142, 76%, 36%)" strokeWidth={2} />
                  <Line type="monotone" dataKey="failed" name="Échouées" stroke="hsl(0, 84%, 60%)" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Appareils</CardTitle>
            <CardDescription>Répartition par type</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={getDeviceDistribution()}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  >
                    {getDeviceDistribution().map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Browsers Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Navigateurs utilisés</CardTitle>
          <CardDescription>Top 5 des navigateurs les plus utilisés</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={getBrowserDistribution()} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis type="number" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                <YAxis type="category" dataKey="name" width={100} tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'hsl(var(--background))', 
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px'
                  }} 
                />
                <Bar dataKey="value" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="sessions" className="space-y-4">
        <TabsList>
          <TabsTrigger value="sessions">Sessions Actives</TabsTrigger>
          <TabsTrigger value="history">Historique des Connexions</TabsTrigger>
        </TabsList>

        <TabsContent value="sessions">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Sessions Actives</CardTitle>
                  <CardDescription>
                    Gérez les appareils connectés à votre compte
                  </CardDescription>
                </div>
                {activeSessions.length > 1 && (
                  <Button variant="destructive" size="sm" onClick={terminateAllOtherSessions}>
                    <LogOut className="h-4 w-4 mr-2" />
                    Déconnecter toutes les autres
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {sessionsLoading ? (
                <div className="text-center py-8 text-muted-foreground">
                  Chargement des sessions...
                </div>
              ) : activeSessions.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  Aucune session active
                </div>
              ) : (
                <div className="space-y-4">
                  {activeSessions.map((session: any) => (
                    <div 
                      key={session.id} 
                      className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-center gap-4">
                        <div className="p-2 bg-muted rounded-full">
                          {getDeviceIcon(session.device_type)}
                        </div>
                        <div>
                          <p className="font-medium">
                            {session.browser} sur {session.os}
                          </p>
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <MapPin className="h-3 w-3" />
                            <span>{session.ip_address || "IP inconnue"}</span>
                            <span>•</span>
                            <Clock className="h-3 w-3" />
                            <span>
                              Dernière activité: {format(new Date(session.last_activity_at), "Pp", { locale: fr })}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {session.user_id === user?.id && (
                          <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400">
                            <Unlock className="h-3 w-3 mr-1" />
                            Session actuelle
                          </Badge>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => terminateMutation.mutate(session.id)}
                          disabled={terminateMutation.isPending}
                        >
                          <LogOut className="h-4 w-4 mr-1" />
                          Déconnecter
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Historique des Connexions</CardTitle>
                  <CardDescription>
                    Consultez toutes les tentatives de connexion
                  </CardDescription>
                </div>
                <div className="relative w-64">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Rechercher..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {historyLoading ? (
                <div className="text-center py-8 text-muted-foreground">
                  Chargement de l'historique...
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Statut</TableHead>
                      <TableHead>Appareil</TableHead>
                      <TableHead>Navigateur</TableHead>
                      <TableHead>Système</TableHead>
                      <TableHead>IP</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredHistory.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-muted-foreground">
                          Aucun historique de connexion
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredHistory.slice(0, 50).map((entry: any) => (
                        <TableRow key={entry.id}>
                          <TableCell>
                            {format(new Date(entry.created_at), "Pp", { locale: fr })}
                          </TableCell>
                          <TableCell>
                            {entry.success ? (
                              <Badge className="bg-green-100 text-green-800 hover:bg-green-100 dark:bg-green-900/20 dark:text-green-400">
                                <CheckCircle className="h-3 w-3 mr-1" />
                                Réussie
                              </Badge>
                            ) : (
                              <Badge variant="destructive">
                                <XCircle className="h-3 w-3 mr-1" />
                                Échouée
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {getDeviceIcon(entry.device_type)}
                              <span className="capitalize">{entry.device_type || "Desktop"}</span>
                            </div>
                          </TableCell>
                          <TableCell>{entry.browser || "Inconnu"}</TableCell>
                          <TableCell>{entry.os || "Inconnu"}</TableCell>
                          <TableCell className="font-mono text-sm">
                            {entry.ip_address || "N/A"}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Security Tips */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-yellow-500" />
            Conseils de Sécurité
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-2 gap-4">
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
                Vérifiez régulièrement les sessions actives et déconnectez les appareils non reconnus
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
                Changez votre mot de passe si vous voyez des connexions suspectes
              </li>
            </ul>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
                Utilisez un mot de passe fort et unique pour votre compte
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
                Ne partagez jamais vos identifiants de connexion
              </li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default SecuritySessions;
