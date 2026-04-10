import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, MapPin, Edit, ExternalLink, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

interface OfferViewProps {
    offers: any[];
    searchTerm: string;
    onSearchChange: (value: string) => void;
    onEdit: (offer: any) => void;
    onDelete: (id: string) => void;
}

export function OfferView({ offers, searchTerm, onSearchChange, onEdit, onDelete }: OfferViewProps) {
    const getOfferTypeBadge = (type: string) => {
        const variants: any = {
            INTERNSHIP: { label: "Stage", variant: "default" },
            JOB: { label: "Emploi", variant: "secondary" },
            APPRENTICESHIP: { label: "Alternance", variant: "outline" },
            VOLUNTEER: { label: "Bénévolat", variant: "destructive" },
        };
        const { label, variant } = variants[type] || { label: type, variant: "default" };
        return <Badge variant={variant}>{label}</Badge>;
    };

    const filteredOffers = offers.filter(offer =>
        offer.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        offer.company_name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="space-y-4">
            <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                    placeholder="Rechercher une offre..."
                    value={searchTerm}
                    onChange={(e) => onSearchChange(e.target.value)}
                    className="pl-10"
                />
            </div>

            <Card>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Offre</TableHead>
                            <TableHead>Type</TableHead>
                            <TableHead>Lieu</TableHead>
                            <TableHead>Date limite</TableHead>
                            <TableHead>Statut</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {filteredOffers.map((offer) => (
                            <TableRow key={offer.id}>
                                <TableCell>
                                    <div>
                                        <p className="font-medium">{offer.title}</p>
                                        <p className="text-sm text-muted-foreground">{offer.company_name}</p>
                                    </div>
                                </TableCell>
                                <TableCell>{getOfferTypeBadge(offer.offer_type)}</TableCell>
                                <TableCell>
                                    <div className="flex items-center gap-1">
                                        {offer.is_remote && <Badge variant="outline">Remote</Badge>}
                                        {offer.location && (
                                            <span className="flex items-center gap-1 text-sm">
                                                <MapPin className="h-3 w-3" />
                                                {offer.location}
                                            </span>
                                        )}
                                    </div>
                                </TableCell>
                                <TableCell>
                                    {offer.application_deadline
                                        ? format(new Date(offer.application_deadline), "dd MMM yyyy", { locale: fr })
                                        : "-"}
                                </TableCell>
                                <TableCell>
                                    <Badge variant={offer.is_active ? "default" : "secondary"}>
                                        {offer.is_active ? "Active" : "Inactive"}
                                    </Badge>
                                </TableCell>
                                <TableCell className="text-right">
                                    <div className="flex items-center justify-end gap-2">
                                        <Button variant="ghost" size="icon" onClick={() => onEdit(offer)}>
                                            <Edit className="h-4 w-4" />
                                        </Button>
                                        {offer.external_url && (
                                            <Button variant="ghost" size="icon" asChild>
                                                <a href={offer.external_url} target="_blank" rel="noopener noreferrer">
                                                    <ExternalLink className="h-4 w-4" />
                                                </a>
                                            </Button>
                                        )}
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => onDelete(offer.id)}
                                        >
                                            <Trash2 className="h-4 w-4 text-destructive" />
                                        </Button>
                                    </div>
                                </TableCell>
                            </TableRow>
                        ))}
                        {filteredOffers.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                                    Aucune offre trouvée
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </Card>
        </div>
    );
}
