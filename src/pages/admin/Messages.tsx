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
import { useTranslation } from "react-i18next";

const MessagesPage = () => {
  const { t } = useTranslation("adminMessages");
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
          {t("adminMessages.pageTitle")}
        </h1>
        <p className="text-muted-foreground">
          {t("adminMessages.pageSubtitle")}
        </p>
      </div>

      <Tabs defaultValue="inbox" className="w-full">
        <TabsList className="grid w-full grid-cols-3 max-w-lg">
          <TabsTrigger value="inbox" className="gap-2">
            <Inbox className="w-4 h-4" />
            {t("adminMessages.tabMessages")}
          </TabsTrigger>
          <TabsTrigger value="broadcast" className="gap-2">
            <MessageSquare className="w-4 h-4" />
            {t("adminMessages.tabBroadcast")}
          </TabsTrigger>
          <TabsTrigger value="external" className="gap-2">
            <Mail className="w-4 h-4" />
            {t("adminMessages.tabEmail")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="inbox" className="mt-6">
          <MessengerInterface
            recipients={allUsers || []}
            recipientLabel={t("adminMessages.recipientLabel")}
            title={t("adminMessages.tabMessages")}
            showNewConversation={true}
          />
        </TabsContent>

        <TabsContent value="broadcast" className="mt-6">
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MessageSquare className="w-5 h-5 text-primary" />
                  {t("adminMessages.broadcastTitle")}
                </CardTitle>
                <CardDescription>
                  {t("adminMessages.broadcastDescription")}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <AdminMessageComposer />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t("adminMessages.featuresTitle")}</CardTitle>
                <CardDescription>
                  {t("adminMessages.featuresDescription")}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <Send className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">{t("adminMessages.featureIndividualTitle")}</p>
                    <p className="text-xs text-muted-foreground">
                      {t("adminMessages.featureIndividualDescription")}
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <MessageSquare className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">{t("adminMessages.featureRealtimeTitle")}</p>
                    <p className="text-xs text-muted-foreground">
                      {t("adminMessages.featureRealtimeDescription")}
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
                  {t("adminMessages.emailTitle")}
                </CardTitle>
                <CardDescription>
                  {t("adminMessages.emailDescription")}
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

