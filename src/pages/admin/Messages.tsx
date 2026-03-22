import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTenant } from "@/contexts/TenantContext";
import { communicationQueries } from "@/queries/communication";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MessageSquare, Mail, Send, Inbox } from "lucide-react";
import { AdminMessageComposer } from "@/components/messages/AdminMessageComposer";
import ExternalMessageComposer from "@/components/messages/ExternalMessageComposer";
import { MessengerInterface } from "@/components/messages/MessengerInterface";

const MessagesPage = () => {
  const { tenant } = useTenant();

  // Fetch all users for recipient selection
  const { data: allUsers } = useQuery({
    ...communicationQueries.messagingUsers(tenant?.id || ""),
    enabled: !!tenant?.id,
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-display font-bold text-foreground">
          Messagerie
        </h1>
        <p className="text-muted-foreground">
          Communiquez avec les parents, enseignants et personnel
        </p>
      </div>

      <Tabs defaultValue="inbox" className="w-full">
        <TabsList className="grid w-full grid-cols-3 max-w-lg">
          <TabsTrigger value="inbox" className="gap-2">
            <Inbox className="w-4 h-4" />
            Messages
          </TabsTrigger>
          <TabsTrigger value="broadcast" className="gap-2">
            <MessageSquare className="w-4 h-4" />
            Diffusion
          </TabsTrigger>
          <TabsTrigger value="external" className="gap-2">
            <Mail className="w-4 h-4" />
            Email
          </TabsTrigger>
        </TabsList>

        <TabsContent value="inbox" className="mt-6">
          <MessengerInterface
            recipients={allUsers || []}
            recipientLabel="Destinataire"
            title="Messages"
            showNewConversation={true}
          />
        </TabsContent>

        <TabsContent value="broadcast" className="mt-6">
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MessageSquare className="w-5 h-5 text-primary" />
                  Diffusion de messages
                </CardTitle>
                <CardDescription>
                  Envoyez des notifications en masse aux utilisateurs de la plateforme
                  (parents, enseignants, personnel).
                </CardDescription>
              </CardHeader>
              <CardContent>
                <AdminMessageComposer />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Fonctionnalités</CardTitle>
                <CardDescription>
                  La diffusion de messages permet de :
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <Send className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">Envoi individuel ou groupé</p>
                    <p className="text-xs text-muted-foreground">
                      Sélectionnez un ou plusieurs destinataires par rôle
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <MessageSquare className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">Notifications en temps réel</p>
                    <p className="text-xs text-muted-foreground">
                      Les destinataires reçoivent une alerte instantanée
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="external" className="mt-6">
          <div className="grid gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Mail className="w-5 h-5 text-primary" />
                  Envoi d'emails
                </CardTitle>
                <CardDescription>
                  Envoyez des emails aux utilisateurs. Les emails sont envoyés à leur adresse
                  email réelle, même s'ils ne sont pas connectés à la plateforme.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ExternalMessageComposer />
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default MessagesPage;
