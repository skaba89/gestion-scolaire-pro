import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
    User,
    Users,
    MapPin,
    School,
    Calendar,
    FileText,
    Download,
    Mail,
    Phone,
    Briefcase,
    StickyNote,
    FileWarning,
} from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { AdmissionApplication } from "@/queries/admissions";

// Reprend exactement les libellés de src/pages/public/AdmissionForm.tsx —
// c'est là que ces document_type sont produits, le dossier admin doit les
// afficher avec les mêmes noms que ceux vus par le candidat au dépôt.
const DOCUMENT_TYPE_LABELS: Record<string, string> = {
    birth_certificate: "Extrait de naissance ou carte d'identité",
    id_photo: "Photo d'identité récente",
    previous_transcript: "Relevé de notes de l'année précédente",
    previous_school_certificate: "Certificat de scolarité (établissement précédent)",
};

const GENDER_LABELS: Record<string, string> = {
    M: "Masculin",
    F: "Féminin",
    male: "Masculin",
    female: "Féminin",
};

interface InfoRowProps {
    icon: React.ReactNode;
    label: string;
    value?: string | null;
}

function InfoRow({ icon, label, value }: InfoRowProps) {
    if (!value) return null;
    return (
        <div className="flex items-start gap-3 text-sm">
            <span className="text-muted-foreground mt-0.5">{icon}</span>
            <div>
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="font-medium">{value}</p>
            </div>
        </div>
    );
}

interface AdmissionDetailDialogProps {
    application: AdmissionApplication | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    studentLabel: string;
}

export const AdmissionDetailDialog = ({
    application,
    open,
    onOpenChange,
    studentLabel,
}: AdmissionDetailDialogProps) => {
    if (!application) return null;

    const documents = application.documents ?? [];

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>
                        Dossier de {application.student_first_name} {application.student_last_name}
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-6">
                    {/* Étudiant */}
                    <section className="space-y-3">
                        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                            {studentLabel}
                        </h3>
                        <div className="grid grid-cols-2 gap-4">
                            <InfoRow
                                icon={<User className="w-4 h-4" />}
                                label="Nom complet"
                                value={`${application.student_first_name} ${application.student_last_name}`}
                            />
                            <InfoRow
                                icon={<Calendar className="w-4 h-4" />}
                                label="Date de naissance"
                                value={
                                    application.student_date_of_birth
                                        ? format(new Date(application.student_date_of_birth), "dd MMMM yyyy", { locale: fr })
                                        : undefined
                                }
                            />
                            <InfoRow
                                icon={<User className="w-4 h-4" />}
                                label="Genre"
                                value={application.student_gender ? (GENDER_LABELS[application.student_gender] || application.student_gender) : undefined}
                            />
                            <InfoRow
                                icon={<School className="w-4 h-4" />}
                                label="Niveau demandé"
                                value={application.level_name}
                            />
                            <InfoRow
                                icon={<MapPin className="w-4 h-4" />}
                                label="Adresse"
                                value={application.student_address}
                            />
                            <InfoRow
                                icon={<School className="w-4 h-4" />}
                                label="Établissement précédent"
                                value={application.student_previous_school}
                            />
                        </div>
                    </section>

                    <Separator />

                    {/* Parent / Tuteur */}
                    <section className="space-y-3">
                        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                            Parent / Tuteur
                        </h3>
                        <div className="grid grid-cols-2 gap-4">
                            <InfoRow
                                icon={<Users className="w-4 h-4" />}
                                label="Nom complet"
                                value={`${application.parent_first_name} ${application.parent_last_name}`}
                            />
                            <InfoRow
                                icon={<Mail className="w-4 h-4" />}
                                label="Email"
                                value={application.parent_email}
                            />
                            <InfoRow
                                icon={<Phone className="w-4 h-4" />}
                                label="Téléphone"
                                value={application.parent_phone}
                            />
                            <InfoRow
                                icon={<Briefcase className="w-4 h-4" />}
                                label="Profession"
                                value={application.parent_occupation}
                            />
                            <InfoRow
                                icon={<MapPin className="w-4 h-4" />}
                                label="Adresse"
                                value={application.parent_address}
                            />
                        </div>
                    </section>

                    {application.notes && (
                        <>
                            <Separator />
                            <section className="space-y-2">
                                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                                    <StickyNote className="w-4 h-4" /> Notes du candidat
                                </h3>
                                <p className="text-sm bg-muted/50 rounded-lg p-3">{application.notes}</p>
                            </section>
                        </>
                    )}

                    <Separator />

                    {/* Documents */}
                    <section className="space-y-3">
                        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                            Documents déposés ({documents.length})
                        </h3>
                        {documents.length === 0 ? (
                            <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 rounded-lg p-3">
                                <FileWarning className="w-4 h-4 shrink-0" />
                                Aucun document n'a été déposé avec cette candidature.
                            </div>
                        ) : (
                            <ul className="space-y-2">
                                {documents.map((doc, idx) => (
                                    <li
                                        key={doc.key || idx}
                                        className="flex items-center justify-between gap-3 border rounded-lg p-3"
                                    >
                                        <div className="flex items-center gap-3 min-w-0">
                                            <FileText className="w-5 h-5 text-primary shrink-0" />
                                            <div className="min-w-0">
                                                <p className="text-sm font-medium">
                                                    {DOCUMENT_TYPE_LABELS[doc.document_type] || doc.document_type}
                                                </p>
                                                <p className="text-xs text-muted-foreground truncate">{doc.filename}</p>
                                            </div>
                                        </div>
                                        <Button asChild variant="outline" size="sm" className="shrink-0">
                                            <a href={doc.url} target="_blank" rel="noopener noreferrer">
                                                <Download className="w-3.5 h-3.5 mr-1.5" />
                                                Voir
                                            </a>
                                        </Button>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </section>

                    <div className="flex items-center justify-between pt-2 text-xs text-muted-foreground">
                        <span>
                            Soumis le{" "}
                            {application.submitted_at
                                ? format(new Date(application.submitted_at), "dd MMM yyyy 'à' HH:mm", { locale: fr })
                                : "—"}
                        </span>
                        <Badge variant="outline">{application.status}</Badge>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
};
