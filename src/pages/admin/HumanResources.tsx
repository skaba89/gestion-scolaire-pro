import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { HRStats } from "@/components/human-resources/HRStats";
import { EmployeesTab } from "@/components/human-resources/EmployeesTab";
import { ContractsTab } from "@/components/human-resources/ContractsTab";
import { LeavesTab } from "@/components/human-resources/LeavesTab";
import { PayslipsTab } from "@/components/human-resources/PayslipsTab";

const HumanResources = () => {
  const [activeTab, setActiveTab] = useState("employees");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Ressources Humaines</h1>
        <p className="text-muted-foreground">Gestion du personnel, contrats, congés et paie</p>
      </div>

      <HRStats />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="employees">Employés</TabsTrigger>
          <TabsTrigger value="contracts">Contrats</TabsTrigger>
          <TabsTrigger value="leaves">Congés</TabsTrigger>
          <TabsTrigger value="payslips">Fiches de paie</TabsTrigger>
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
