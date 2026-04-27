import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { HRStats } from "@/components/human-resources/HRStats";
import { EmployeesTab } from "@/components/human-resources/EmployeesTab";
import { ContractsTab } from "@/components/human-resources/ContractsTab";
import { LeavesTab } from "@/components/human-resources/LeavesTab";
import { PayslipsTab } from "@/components/human-resources/PayslipsTab";

const HumanResources = () => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState("employees");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">{t("humanResources.pageTitle")}</h1>
        <p className="text-muted-foreground">{t("humanResources.pageSubtitle")}</p>
      </div>

      <HRStats />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="employees">{t("humanResources.tabEmployees")}</TabsTrigger>
          <TabsTrigger value="contracts">{t("humanResources.tabContracts")}</TabsTrigger>
          <TabsTrigger value="leaves">{t("humanResources.tabLeaves")}</TabsTrigger>
          <TabsTrigger value="payslips">{t("humanResources.tabPayslips")}</TabsTrigger>
        </TabsList>

        <TabsContent value="employees">
          <EmployeesTab />
        </TabsContent>

        <TabsContent value="contracts">
          <ContractsTab />
        </TabsContent>

        <TabsContent value="leaves">
          <LeavesTab />
        </TabsContent>

        <TabsContent value="payslips">
          <PayslipsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default HumanResources;
