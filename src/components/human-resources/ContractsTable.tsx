import { useRef, useState } from "react";
import { format } from "date-fns";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Contract, CONTRACT_TYPE_LABELS } from "@/types/humanResources";
import { ContractActions } from "./ContractActions";
import {
    Pagination,
    PaginationContent,
    PaginationItem,
    PaginationLink,
    PaginationNext,
    PaginationPrevious,
} from "@/components/ui/pagination";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";

interface ContractsTableProps {
    contracts: Contract[];
    isLoading: boolean;
    totalCount: number;
    currentPage: number;
    pageSize: number;
    onPageChange: (page: number) => void;
    onPageSizeChange: (pageSize: number) => void;
    currency: string;
    onEdit: (contract: Contract) => void;
    onDelete: (contract: Contract) => void;
}

export function ContractsTable({
    contracts,
    isLoading,
    totalCount,
    currentPage,
    pageSize,
    onPageChange,
    onPageSizeChange,
    currency,
    onEdit,
    onDelete,
}: ContractsTableProps) {
    const totalPages = Math.ceil(totalCount / pageSize);

    return (
        <div className="space-y-4">
            <div className="rounded-md border overflow-hidden">
                <Table>
                    <TableHeader className="sticky top-0 bg-background z-10 shadow-sm">
                        <TableRow>
                            <TableHead>N° Contrat</TableHead>
                            <TableHead>Employé</TableHead>
                            <TableHead>Type</TableHead>
                            <TableHead>Poste</TableHead>
                            <TableHead>Début</TableHead>
                            <TableHead>Fin</TableHead>
                            <TableHead>Salaire brut</TableHead>
                            <TableHead>Statut</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {isLoading ? (
                            <TableRow>
                                <TableCell colSpan={9} className="h-24 text-center">
                                    <div className="flex items-center justify-center gap-2">
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        Chargement...
                                    </div>
                                </TableCell>
                            </TableRow>
                        ) : contracts.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={9} className="h-24 text-center text-muted-foreground">
                                    Aucun contrat trouvé
                                </TableCell>
                            </TableRow>
                        ) : (
                            contracts.map((contract) => (
                                <TableRow key={contract.id}>
                                    <TableCell className="font-mono">{contract.contract_number}</TableCell>
                                    <TableCell>{contract.employee?.first_name} {contract.employee?.last_name}</TableCell>
                                    <TableCell>
                                        <Badge variant="outline">{CONTRACT_TYPE_LABELS[contract.contract_type] || contract.contract_type}</Badge>
                                    </TableCell>
                                    <TableCell>{contract.job_title}</TableCell>
                                    <TableCell>{contract.start_date ? format(new Date(contract.start_date), "dd/MM/yyyy") : "-"}</TableCell>
                                    <TableCell>{contract.end_date ? format(new Date(contract.end_date), "dd/MM/yyyy") : "-"}</TableCell>
                                    <TableCell>{contract.gross_monthly_salary?.toLocaleString("fr-FR")} {currency}</TableCell>
                                    <TableCell>
                                        <Badge variant={contract.is_current ? "default" : "secondary"}>
                                            {contract.is_current ? "En cours" : "Terminé"}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <ContractActions
                                            contract={contract}
                                            onEdit={onEdit}
                                            onDelete={onDelete}
                                        />
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>

            {totalCount > 0 && (
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-2">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <span>Afficher</span>
                        <Select
                            value={pageSize.toString()}
                            onValueChange={(v) => onPageSizeChange(parseInt(v))}
                        >
                            <SelectTrigger className="h-8 w-[70px]">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="10">10</SelectItem>
                                <SelectItem value="20">20</SelectItem>
                                <SelectItem value="50">50</SelectItem>
                                <SelectItem value="100">100</SelectItem>
                            </SelectContent>
                        </Select>
                        <span>par page</span>
                        <span className="ml-4">
                            {(currentPage - 1) * pageSize + 1}-{Math.min(currentPage * pageSize, totalCount)} sur {totalCount}
                        </span>
                    </div>

                    <Pagination>
                        <PaginationContent>
                            <PaginationItem>
                                <PaginationPrevious
                                    onClick={() => onPageChange(Math.max(1, currentPage - 1))}
                                    className={currentPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                                />
                            </PaginationItem>

                            <PaginationItem>
                                <span className="text-sm font-medium">Page {currentPage} sur {totalPages}</span>
                            </PaginationItem>

                            <PaginationItem>
                                <PaginationNext
                                    onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
                                    className={currentPage === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                                />
                            </PaginationItem>
                        </PaginationContent>
                    </Pagination>
                </div>
            )}
        </div>
    );
}
