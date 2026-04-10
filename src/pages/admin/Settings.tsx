import { useState } from "react";
import { useTenant } from "@/contexts/TenantContext";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Building2,
  Bell,
  GraduationCap,
  Clock,
  Wallet,
  Shield,
  Calendar,
  Settings as SettingsIcon,
  Hash,
  Smartphone,
  PenTool,
  Accessibility,
  ShieldCheck,
  Languages,
  Users as UsersIcon,
  ListFilter
} from "lucide-react";

import EstablishmentSettings from "@/components/settings/EstablishmentSettings";
import NotificationSettings from "@/components/settings/NotificationSettings";
import GradingSettings from "@/components/settings/GradingSettings";
import AttendanceSettings from "@/components/settings/AttendanceSettings";
import FinanceSettings from "@/components/settings/FinanceSettings";
import RoleManagement from "@/components/settings/RoleManagement";
import ScheduleSettings from "@/components/settings/ScheduleSettings";
import MatriculeSettings from "@/components/settings/MatriculeSettings";
import { PushNotificationSettings } from "@/components/settings/PushNotificationSettings";
import SignatureSettings from "@/components/settings/SignatureSettings";
import { AccessibilitySettings } from "@/components/accessibility/AccessibilitySettings";
import SaaSSettings from "@/components/settings/SaaSSettings";
import { BrandingSettings } from "@/components/settings/BrandingSettings";
import { SystemSettings } from "@/components/settings/SystemSettings";
import { LanguageSwitcher } from "@/components/settings/LanguageSwitcher";
import { MenuSettings } from "@/components/settings/MenuSettings";
import { SecuritySettings } from "@/components/settings/SecuritySettings";
import { useTranslation } from "react-i18next";
import UsersPage from "./Users";
import { PrivacySettings } from "@/components/settings/PrivacySettings";

// Modular Components
import { SettingsHeader } from "@/components/settings/SettingsHeader";

const Settings = () => {
  const { tenant } = useTenant();
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState("establishment");

  const tabs = [
    { id: "establishment", label: "Établissement", icon: Building2 },
    { id: "branding", label: "Personnalisation", icon: SettingsIcon },
    { id: "menu", label: "Menu", icon: ListFilter },
    { id: "system", label: "Système", icon: SettingsIcon },
    { id: "signatures", label: "Signatures", icon: PenTool },
    { id: "matricule", label: "Matricules", icon: Hash },
    { id: "notifications", label: "Notifications", icon: Bell },
    { id: "grading", label: "Notation", icon: GraduationCap },
    { id: "attendance", label: "Présences", icon: Clock },
    { id: "schedule", label: "Emploi du temps", icon: Calendar },
    { id: "finance", label: "Finances", icon: Wallet },
    { id: "push", label: "Notifications Push", icon: Smartphone },
    { id: "accessibility", label: "Accessibilité", icon: Accessibility },
    { id: "language", label: "Langue", icon: Languages },
    { id: "roles", label: "Rôles", icon: Shield },
    { id: "security", label: "Sécurité", icon: ShieldCheck },
    { id: "privacy", label: "Confidentialité & Données", icon: Shield },
    { id: "users", label: "Utilisateurs", icon: UsersIcon },
    { id: "governance", label: "Gouvernance SaaS", icon: ShieldCheck },
  ];

  return (
    <div className="space-y-6">
      <SettingsHeader />

      {/* Current Tenant Info */}
      {tenant && (
        <Card className="bg-gradient-to-r from-primary/5 to-primary/10 border-primary/20">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-xl bg-primary/20 flex items-center justify-center">
                <Building2 className="w-8 h-8 text-primary" />
              </div>
              <div>
                <h2 className="text-xl font-bold">{tenant.name}</h2>
                <p className="text-muted-foreground">
                  {tenant.type} • {tenant.slug}
                </p>
                <p className="text-sm text-muted-foreground">{tenant.email}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Settings Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="flex flex-wrap h-auto gap-2 bg-muted/50 p-2">
          {tabs.map((tab) => (
            <TabsTrigger
              key={tab.id}
              value={tab.id}
              className="flex items-center gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
            >
              <tab.icon className="w-4 h-4" />
              <span className="hidden sm:inline">{tab.label}</span>
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="establishment">
          <EstablishmentSettings />
        </TabsContent>

        <TabsContent value="branding">
          <BrandingSettings />
        </TabsContent>

        <TabsContent value="menu">
          <MenuSettings />
        </TabsContent>

        <TabsContent value="system">
          <SystemSettings />
        </TabsContent>

        <TabsContent value="signatures">
          <SignatureSettings />
        </TabsContent>

        <TabsContent value="matricule">
          <MatriculeSettings />
        </TabsContent>

        <TabsContent value="notifications">
          <NotificationSettings />
        </TabsContent>

        <TabsContent value="grading">
          <GradingSettings />
        </TabsContent>

        <TabsContent value="attendance">
          <AttendanceSettings />
        </TabsContent>

        <TabsContent value="schedule">
          <ScheduleSettings />
        </TabsContent>

        <TabsContent value="finance">
          <FinanceSettings />
        </TabsContent>

        <TabsContent value="push">
          <PushNotificationSettings />
        </TabsContent>

        <TabsContent value="accessibility">
          <AccessibilitySettings />
        </TabsContent>

        <TabsContent value="roles">
          <RoleManagement />
        </TabsContent>

        <TabsContent value="users">
          <UsersPage />
        </TabsContent>

        <TabsContent value="security">
          <SecuritySettings />
        </TabsContent>

        <TabsContent value="privacy">
          <PrivacySettings />
        </TabsContent>

        <TabsContent value="language">
          <LanguageSwitcher />
        </TabsContent>

        <TabsContent value="governance">
          <SaaSSettings />
        </TabsContent>
      </Tabs>

      {/* Quick Setup Guide */}
      <Card className="border-dashed">
        <CardContent className="p-8 text-center">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <SettingsIcon className="w-6 h-6 text-primary" />
          </div>
          <h3 className="text-lg font-semibold mb-2">Guide de Configuration</h3>
          <p className="text-muted-foreground mb-4">
            Pour commencer à utiliser SchoolFlow Pro, configurez dans l'ordre :
          </p>
          <ol className="text-sm text-muted-foreground space-y-1 text-left max-w-md mx-auto">
            <li className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center font-medium">1</span>
              Informations de l'établissement
            </li>
            <li className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center font-medium">2</span>
              Paramètres de l'emploi du temps
            </li>
            <li className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center font-medium">3</span>
              Système de notation
            </li>
            <li className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center font-medium">4</span>
              Paramètres financiers
            </li>
            <li className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center font-medium">5</span>
              Assignation des rôles utilisateurs
            </li>
          </ol>
        </CardContent>
      </Card>
    </div>
  );
};

export default Settings;
