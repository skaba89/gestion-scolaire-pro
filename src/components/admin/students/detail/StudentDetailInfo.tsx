import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar, Mail, Phone, Shield, MapPin, Users, Trash2, AlertTriangle } from "lucide-react";
import { StudentAvatar } from "@/components/students/StudentAvatar";
import { LinkParentDialog } from "@/components/students/LinkParentDialog";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { isStudentMinor } from "@/lib/studentAge";

interface StudentDetailInfoProps {
    student: any;
    linkedParents: any[];
    tenantId: string;
    studentLabel: string;
    onRefresh: () => void;
    onRemoveParent: (linkId: string, type: string) => void;
}

export function StudentDetailInfo({
    student,
    linkedParents,
    tenantId,
    studentLabel,
    onRefresh,
    onRemoveParent
}: StudentDetailInfoProps) {
    const isMinor = isStudentMinor(student.date_of_birth);
    const hasNoParents = linkedParents.length === 0;

    return (
        <div className="space-y-6">
            {/* Alert for Minors without Parents */}
            {isMinor && hasNoParents && (
                <Alert variant="destructive" className="bg-orange-50 border-orange-200 text-orange-800">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>Attention : {studentLabel} Mineur</AlertTitle>
                    <AlertDescription className="flex items-center justify-between">
                        <span>
                            Cet {studentLabel.toLowerCase()} est mineur et n'a pas de responsable légal lié. Veuillez lier un parent ou un tuteur.
                        </span>
                        <LinkParentDialog
                            studentId={student.id}
                            tenantId={tenantId}
                            onSuccess={onRefresh}
                        />
                    </AlertDescription>
                </Alert>
            )}

            <Card>
                <CardContent className="pt-6">
                    <div className="flex flex-col md:flex-row gap-6">
                        <StudentAvatar
                            photoUrl={student.photo_url}
                            firstName={student.first_name}
                            lastName={student.last_name}
                            className="h-24 w-24"
                            fallbackClassName="text-2xl"
                        />
                        <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div>
                                <h2 className="text-xl font-bold">{student.last_name} {student.first_name}</h2>
                                {student.registration_number && (
                                    <Badge variant="outline" className="mt-1">{student.registration_number}</Badge>
                                )}
                                <div className="mt-2 space-y-1 text-sm text-muted-foreground">
                                    {student.date_of_birth && (
                                        <p className="flex items-center gap-2">
                                            <Calendar className="h-4 w-4" />
                                            {new Date(student.date_of_birth).toLocaleDateString("fr-FR")}
                                        </p>
                                    )}
                                    {student.email && (
                                        <p className="flex items-center gap-2">
                                            <Mail className="h-4 w-4" />
                                            {student.email}
                                        </p>
                                    )}
                                    {student.phone && (
                                        <p className="flex items-center gap-2">
                                            <Phone className="h-4 w-4" />
                                            {student.phone}
                                        </p>
                                    )}
                                    {student.student_id_card && (
                                        <p className="flex items-center gap-2">
                                            <Shield className="h-4 w-4" />
                                            CNI: {student.student_id_card}
                                        </p>
                                    )}
                                </div>
                            </div>
                            <div>
                                <h3 className="font-medium mb-2 flex items-center gap-2">
                                    <MapPin className="h-4 w-4" />
                                    Adresse
                                </h3>
                                <div className="text-sm text-muted-foreground">
                                    {student.address && <p>{student.address}</p>}
                                    {(student.city || student.country) && (
                                        <p>{[student.city, student.country].filter(Boolean).join(", ")}</p>
                                    )}
                                    {student.nationality && <p>Nationalité: {student.nationality}</p>}
                                </div>
                            </div>
                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <h3 className="font-medium flex items-center gap-2">
                                        <Users className="h-4 w-4" />
                                        Responsables
                                    </h3>
                                    <LinkParentDialog
                                        studentId={student.id}
                                        tenantId={tenantId}
                                        onSuccess={onRefresh}
                                    />
                                </div>
                                <div className="space-y-3">
                                    {linkedParents.length === 0 ? (
                                        <p className="text-muted-foreground text-sm">Aucun responsable lié</p>
                                    ) : (
                                        linkedParents.map((link) => (
                                            <div key={`${link.type}-${link.id}`} className="bg-muted p-3 rounded border">
                                                <div className="flex items-start justify-between">
                                                    <div className="text-sm flex-1">
                                                        <div className="flex items-center gap-2 mb-1">
                                                            {link.is_primary && <Badge variant="default">Principal</Badge>}
                                                            <Badge variant={link.type === 'user' ? "secondary" : "outline"} className="text-[10px]">
                                                                {link.type === 'user' ? "Compte" : "Contact"}
                                                            </Badge>
                                                        </div>
                                                        <p className="font-medium">{link.parent.first_name} {link.parent.last_name}</p>
                                                        <p className="text-muted-foreground truncate">{link.parent.email || link.parent.phone || "Sans contact"}</p>
                                                        {link.relationship && (
                                                            <p className="text-xs text-muted-foreground mt-1">Relation: {link.relationship}</p>
                                                        )}
                                                    </div>
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => onRemoveParent(link.id, link.type)}
                                                        className="text-destructive hover:text-destructive h-8 w-8 p-0"
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
