import { useState } from "react";
import { Search, User } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StudentAvatar } from "@/components/students/StudentAvatar";
import { Student } from "@/queries/students";
import { useStudents } from "@/hooks/queries/useStudents";
import { useTenant } from "@/contexts/TenantContext";
import { useStudentLabel } from "@/hooks/useStudentLabel";

interface StudentSearchProps {
    onSelect: (student: Student) => void;
    selectedStudent: Student | null;
}

export const StudentSearch = ({ onSelect, selectedStudent }: StudentSearchProps) => {
    const { tenant } = useTenant();
    const { studentLabel, studentsLabel } = useStudentLabel();
    const [searchTerm, setSearchTerm] = useState("");

    const { students = [] } = useStudents(tenant?.id || "", false, {
        search: searchTerm,
        pageSize: 5
    });

    return (
        <Card className="border-primary/20 shadow-sm overflow-hidden bg-card/50 backdrop-blur-sm">
            <CardContent className="p-4 space-y-4">
                <div className="flex items-center gap-2">
                    <User className="w-4 h-4 text-primary" />
                    <span className="text-sm font-semibold">{studentLabel}</span>
                </div>

                {!selectedStudent ? (
                    <div className="relative group">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                        <Input
                            placeholder={`Rechercher un ${studentLabel}...`}
                            className="pl-9 bg-background/50 border-primary/10 focus:border-primary/30 transition-all rounded-xl h-11"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />

                        {searchTerm && students.length > 0 && (
                            <div className="absolute top-full left-0 right-0 mt-2 bg-card border border-primary/10 rounded-xl shadow-xl z-10 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                                {students.map((student) => (
                                    <button
                                        key={student.id}
                                        className="w-full flex items-center gap-3 p-3 hover:bg-muted text-left transition-colors border-b border-primary/5 last:border-0"
                                        onClick={() => {
                                            onSelect(student);
                                            setSearchTerm("");
                                        }}
                                    >
                                        <StudentAvatar
                                            photoUrl={student.photo_url}
                                            firstName={student.first_name}
                                            lastName={student.last_name}
                                            className="h-9 w-9 border-2 border-primary/10"
                                        />
                                        <div className="flex-1 min-w-0">
                                            <p className="font-medium text-sm truncate">{student.last_name} {student.first_name}</p>
                                            <p className="text-xs text-muted-foreground font-mono">{student.registration_number}</p>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="flex items-center justify-between p-3 bg-primary/5 rounded-xl border border-primary/10 group">
                        <div className="flex items-center gap-3 min-w-0">
                            <StudentAvatar
                                photoUrl={selectedStudent.photo_url}
                                firstName={selectedStudent.first_name}
                                lastName={selectedStudent.last_name}
                                className="h-10 w-10 border-2 border-primary/20"
                            />
                            <div className="min-w-0">
                                <p className="font-bold text-sm text-primary truncate">{selectedStudent.last_name} {selectedStudent.first_name}</p>
                                <Badge variant="outline" className="text-[10px] h-4 mt-1 font-mono">{selectedStudent.registration_number}</Badge>
                            </div>
                        </div>
                        <button
                            className="text-xs text-muted-foreground hover:text-destructive underline decoration-dotted transition-colors font-medium px-2 py-1 rounded-lg hover:bg-destructive/5"
                            onClick={() => onSelect(null as any)}
                        >
                            Changer
                        </button>
                    </div>
                )}
            </CardContent>
        </Card>
    );
};
