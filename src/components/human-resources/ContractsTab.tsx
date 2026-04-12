import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

import { useHumanResources } from "@/hooks/useHumanResources";
import { Contract, CONTRACT_TYPE_LABELS } from "@/types/humanResources";
import { useTenant } from "@/contexts/TenantContext";
import { useCurrency } from "@/hooks/useCurrency";
import { ContractsTable } from "./ContractsTable";
import { ContractDialog } from "./ContractDialog";
import { toast } from "sonner";

export function ContractsTab() {
    const { tenant } = useTenant();
    const { useContracts, useCreateContract, useUpdateContract, useDeleteContract, useEmployees } = useHumanResources();

    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);

    const { data: contractsData, isLoading } = useContracts({ page: currentPage, pageSize });
    const contracts = contractsData?.contracts || [];
    const totalCount = contractsData?.totalCount || 0;

    const { data: employeesData } = useEmployees({ page: 1, pageSize: 1000 }); // All employees for selection
    const employees = (employeesData as any)?.employees || [];

    const createContractMutation = useCreateContract();
    const updateContractMutation = useUpdateContract();
    const deleteContractMutation = useDeleteContract();

    const [isContractDialogOpen, setIsContractDialogOpen] = useState(false);
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
    const [selectedContract, setSelectedContract] = useState<Contract | null>(null);

    const currency = useCurrency().currencyCode;

    const handleOpenCreate = () => {
        setSelectedContract(null);
        setIsContractDialogOpen(true);
    };

    const handleOpenEdit = (contract: Contract) => {
        setSelectedContract(contract);
        setIsContractDialogOpen(true);
    };

    const handleOpenDelete = (contract: Contract) => {
        setSelectedContract(contract);
        setIsDeleteDialogOpen(true);
    };

    const handleFormSubmit = (data: any) => {
        if (selectedContract) {
            updateContractMutation.mutate({ id: selectedContract.id, ...data }, {
                onSuccess: () => setIsContractDialogOpen(false)
            });
        } else {
            createContractMutation.mutate(data, {
                onSuccess: () => setIsContractDialogOpen(false)
            });
        }
    };

    const handleDelete = () => {
        if (selectedContract) {
            deleteContractMutation.mutate(selectedContract.id, {
                onSuccess: () => {
                    setIsDeleteDialogOpen(false);
                    setSelectedContract(null);
                }
            });
        }
    };

    const handleDownloadContract = (contract: Contract) => {
        try {
            const { generateCDIContract, generateCDDContract } = require("@/utils/contractPdfGenerator");

            // Préparer les données du tenant
            const tenantData = {
                name: tenant?.name || "Mon Établissement",
                address: tenant?.address,
                phone: tenant?.phone,
                email: tenant?.email,
                settings: {
                    currency: currency,
                    urssafNumber: (tenant?.settings as any)?.urssafNumber,
                    conventionCollective: (tenant?.settings as any)?.conventionCollective,
                    bankName: (tenant?.settings as any)?.bankName,
                    bankAccount: (tenant?.settings as any)?.bankAccount,
                    bankIBAN: (tenant?.settings as any)?.bankIBAN,
                }
            };

            // Générer le PDF selon le type de contrat
            let doc;
            if (contract.contract_type === "CDD") {
                doc = generateCDDContract(contract, tenantData);
            } else {
                // CDI par défaut
                doc = generateCDIContract(contract, tenantData);
            }

            // Télécharger le PDF
            doc.save(`contrat-${contract.contract_number}.pdf`);
            toast.success("Contrat téléchargé avec succès");
        } catch (error: any) {
            console.error("PDF generation error:", error);

            // Messages d'erreur spécifiques
            if (error.message?.includes("numéro de contrat")) {
                toast.error("Erreur : Le numéro de contrat est manquant");
            } else if (error.message?.includes("poste")) {
                toast.error("Erreur : Le poste est manquant");
            } else if (error.message?.includes("date")) {
                toast.error("Erreur : Une date est invalide ou manquante");
            } else if (error.message?.includes("salaire")) {
                toast.error("Erreur : Le salaire doit être supérieur à 0");
            } else if (error.message?.includes("heures")) {
                toast.error("Erreur : Les heures hebdomadaires doivent être supérieures à 0");
            } else {
                toast.error(`Erreur lors de la génération du PDF : ${error.message || "Erreur inconnue"}`);
            }
        }
    };

    return (
        <Card>
            <CardHeader>
                <div className="flex justify-between items-center">
                    <div>
                        <CardTitle>Contrats de travail</CardTitle>
                        <CardDescription>Gérez les contrats de travail du personnel</CardDescription>
                    </div>
                    <Button onClick={handleOpenCreate} disabled={!tenant}>
                        <Plus className="h-4 w-4 mr-2" /> Nouveau contrat
                    </Button>
                </div>
            </CardHeader>
            <CardContent>
                {isLoading ? (
                    <div className="flex justify-center items-center py-12">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                    </div>
                ) : (
                    <ContractsTable
                        contracts={contracts}
                        isLoading={isLoading}
                        totalCount={totalCount}
                        currentPage={currentPage}
                        pageSize={pageSize}
                        onPageChange={setCurrentPage}
                        onPageSizeChange={setPageSize}
                        currency={currency}
                        onEdit={handleOpenEdit}
                        onDelete={handleOpenDelete}
                    />
                )}
            </CardContent>

            <ContractDialog
                open={isContractDialogOpen}
                onOpenChange={setIsContractDialogOpen}
                onSubmit={handleFormSubmit}
                contract={selectedContract}
                employees={employees}
                currency={currency}
            />

            <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Êtes-vous sûr ?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Cette action est irréversible. Le contrat sera définitivement supprimé.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Annuler</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">
                            Supprimer
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </Card>
    );
}
