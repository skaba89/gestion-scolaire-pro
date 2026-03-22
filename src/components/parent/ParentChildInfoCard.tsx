import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Users,
    FileText,
    CreditCard,
    Calendar,
    MapPin,
    Phone,
    ClipboardList,
    Eye
} from "lucide-react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

interface Student {
    id: string;
    first_name: string;
    last_name: string;
    registration_number: string;
    photo_url: string | null;
    date_of_birth?: string;
    gender?: string;
    phone?: string;
    address?: string;
}

interface ParentChildInfoCardProps {
    student: Student;
    isPrimary: boolean;
    getTenantUrl: (path: string) => string;
    onViewAttendance: (student: { id: string, name: string }) => void;
}

export const ParentChildInfoCard = ({
    student,
    isPrimary,
    getTenantUrl,
    onViewAttendance
}: ParentChildInfoCardProps) => {
    return (
        <Card className="overflow-hidden h-full flex flex-col border-primary/10 hover:shadow-lg transition-all duration-300">
            <CardHeader className="bg-gradient-to-r from-primary/5 to-primary/10 border-b p-6">
                <div className="flex items-center gap-4">
                    <div className="w-16 h-16 rounded-2xl bg-primary/20 flex items-center justify-center shrink-0 shadow-inner overflow-hidden border-2 border-primary/10">
                        {student.photo_url ? (
                            <img
                                src={student.photo_url}
                                alt={`${student.first_name} ${student.last_name}`}
                                className="w-full h-full object-cover"
                            />
                        ) : (
                            <span className="text-2xl font-bold text-primary">
                                {student.first_name?.[0]}{student.last_name?.[0]}
                            </span>
                        )}
                    </div>
                    <div className="flex-1 min-w-0">
                        <CardTitle className="text-xl font-display font-bold truncate text-primary/80">
                            {student.first_name} {student.last_name}
                        </CardTitle>
                        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                            <Badge variant="outline" className="bg-background/50 font-mono text-[10px] uppercase tracking-wider">
                                {student.registration_number}
                            </Badge>
                            {isPrimary && (
                                <Badge variant="secondary" className="bg-primary/10 text-primary border-none text-[10px]">
                                    Contact principal
                                </Badge>
                            )}
                        </div>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="p-6 space-y-4 flex-1 bg-card/50">
                <div className="grid grid-cols-2 gap-4">
                    <div className="flex items-center gap-2.5 text-xs text-muted-foreground bg-muted/30 p-2 rounded-lg">
                        <Calendar className="w-3.5 h-3.5 text-primary/60 shrink-0" />
                        <span className="font-medium truncate">
                            {student.date_of_birth
                                ? format(new Date(student.date_of_birth), "dd MMM yyyy", { locale: fr })
                                : "N/A"
                            }
                        </span>
                    </div>
                    <div className="flex items-center gap-2.5 text-xs text-muted-foreground bg-muted/30 p-2 rounded-lg">
                        <Users className="w-3.5 h-3.5 text-primary/60 shrink-0" />
                        <span className="font-medium">
                            {student.gender === "M" ? "Masculin" : student.gender === "F" ? "Féminin" : "N/A"}
                        </span>
                    </div>
                </div>

                {student.phone && (
                    <div className="flex items-center gap-2.5 text-xs text-muted-foreground px-1">
                        <Phone className="w-3.5 h-3.5 text-primary/40 shrink-0" />
                        <span className="truncate">{student.phone}</span>
                    </div>
                )}

                {student.address && (
                    <div className="flex items-center gap-2.5 text-xs text-muted-foreground px-1">
                        <MapPin className="w-3.5 h-3.5 text-primary/40 shrink-0" />
                        <span className="truncate line-clamp-1">{student.address}</span>
                    </div>
                )}

                <div className="flex flex-wrap gap-2 pt-5 border-t mt-auto">
                    <Link to={getTenantUrl(`/parent/children/${student.id}`)} className="flex-1 min-w-[140px]">
                        <Button variant="default" size="sm" className="w-full bg-primary hover:bg-primary/90 font-semibold shadow-sm">
                            <Eye className="w-4 h-4 mr-2" />
                            Détails & Notes
                        </Button>
                    </Link>
                    <Link to={getTenantUrl(`/parent/report-cards?student=${student.id}`)}>
                        <Button variant="outline" size="sm" className="h-9">
                            <FileText className="w-4 h-4 mr-2" />
                            Bulletins
                        </Button>
                    </Link>
                    <Link to={getTenantUrl(`/parent/invoices?student=${student.id}`)}>
                        <Button variant="outline" size="sm" className="h-9">
                            <CreditCard className="w-4 h-4 mr-2" />
                            Factures
                        </Button>
                    </Link>
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-9"
                        onClick={() => onViewAttendance({
                            id: student.id,
                            name: `${student.first_name} ${student.last_name}`
                        })}
                    >
                        <ClipboardList className="w-4 h-4 mr-2" />
                        Présences
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
};
