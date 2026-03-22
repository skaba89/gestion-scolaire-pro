import { useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { useCurrency } from "@/hooks/useCurrency";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText, Plus, Pencil, Trash2 } from "lucide-react";
import { Fee } from "../types";
import { EmptyState } from "@/components/ui/empty-state";

interface FeeListProps {
    fees: Fee[];
    isLoading: boolean;
    onNewFee: () => void;
    onEditFee: (fee: Fee) => void;
    onDeleteFee: (fee: Fee) => void;
}

export const FeeList = ({ fees, isLoading, onNewFee, onEditFee, onDeleteFee }: FeeListProps) => {
    const { formatCurrency } = useCurrency();
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);

    const totalItems = fees.length;
    const totalPages = Math.ceil(totalItems / pageSize);
    const paginatedFees = fees.slice(
        (currentPage - 1) * pageSize,
        currentPage * pageSize
    );

    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                    <FileText className="w-5 h-5" />
                    Types de Frais ({fees.length})
                </CardTitle>
                <Button onClick={onNewFee}>
                    <Plus className="w-4 h-4 mr-2" />
                    Ajouter un frais
                </Button>
            </CardHeader>
            <CardContent>
                {isLoading ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {[1, 2, 3].map((i) => (
                            <Card key={i} className="border-dashed">
                                <CardContent className="p-4 space-y-3">
                                    <Skeleton className="h-5 w-1/2" />
                                    <Skeleton className="h-4 w-3/4" />
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                ) : fees.length === 0 ? (
                    <EmptyState
                        icon={FileText}
                        title="Aucun type de frais configuré"
                        description="Ajoutez des types de frais (ex: Scolarité, Cantine) pour les facturer aux élèves."
                        actionLabel="Ajouter un frais"
                        onAction={onNewFee}
                    />
                ) : (
                    <div className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {paginatedFees.map((fee) => (
                                <Card key={fee.id} className="border-dashed">
                                    <CardContent className="p-4">
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <p className="font-medium">{fee.name}</p>
                                                <p className="text-sm text-muted-foreground">{fee.description}</p>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <p className="font-bold text-primary">
                                                    {formatCurrency(Number(fee.amount))}
                                                </p>
                                                <Button variant="ghost" size="icon" onClick={() => onEditFee(fee)}>
                                                    <Pencil className="w-4 h-4" />
                                                </Button>
                                                <Button variant="ghost" size="icon" onClick={() => onDeleteFee(fee)}>
                                                    <Trash2 className="w-4 h-4 text-destructive" />
                                                </Button>
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            ))}
                        </div>

                        {/* Pagination Controls */}
                        {totalItems > 0 && (
                            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-6">
                                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                    <span>Afficher</span>
                                    <Select
                                        value={pageSize.toString()}
                                        onValueChange={(v) => {
                                            setPageSize(parseInt(v));
                                            setCurrentPage(1);
                                        }}
                                    >
                                        <SelectTrigger className="h-8 w-[70px]">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="10">10</SelectItem>
                                            <SelectItem value="20">20</SelectItem>
                                            <SelectItem value="50">50</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    <span>par page</span>
                                    <span className="ml-4">
                                        {(currentPage - 1) * pageSize + 1}-{Math.min(currentPage * pageSize, totalItems)} sur {totalItems}
                                    </span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                                        disabled={currentPage === 1}
                                    >
                                        Précédent
                                    </Button>
                                    <div className="flex items-center gap-1">
                                        {Array.from({ length: totalPages }, (_, i) => i + 1)
                                            .filter(p => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
                                            .map((p, i, arr) => (
                                                <div key={p} className="flex items-center gap-1">
                                                    {i > 0 && arr[i - 1] !== p - 1 && <span className="text-muted-foreground">...</span>}
                                                    <Button
                                                        variant={currentPage === p ? "default" : "outline"}
                                                        size="sm"
                                                        className="w-8 h-8 p-0"
                                                        onClick={() => setCurrentPage(p)}
                                                    >
                                                        {p}
                                                    </Button>
                                                </div>
                                            ))}
                                    </div>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                                        disabled={currentPage === totalPages || totalPages === 0}
                                    >
                                        Suivant
                                    </Button>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </CardContent>
        </Card>
    );
};
