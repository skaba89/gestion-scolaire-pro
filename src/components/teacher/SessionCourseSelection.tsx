import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Play, Square, Camera } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface SessionCourseSelectionProps {
    classrooms: any[];
    subjects: any[];
    selectedClassroom: string;
    selectedSubject: string;
    onClassroomChange: (val: string) => void;
    onSubjectChange: (val: string) => void;
    activeSession: any;
    onStartSession: () => void;
    onEndSession: () => void;
    onShowScanner: () => void;
    isPending: boolean;
}

export const SessionCourseSelection = ({
    classrooms,
    subjects,
    selectedClassroom,
    selectedSubject,
    onClassroomChange,
    onSubjectChange,
    activeSession,
    onStartSession,
    onEndSession,
    onShowScanner,
    isPending,
}: SessionCourseSelectionProps) => {
    return (
        <Card>
            <CardHeader>
                <CardTitle>Sélection du cours</CardTitle>
            </CardHeader>
            <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <label className="text-sm font-medium">Classe</label>
                        <Select
                            value={selectedClassroom}
                            onValueChange={onClassroomChange}
                            disabled={!!activeSession}
                        >
                            <SelectTrigger>
                                <SelectValue placeholder="Sélectionner une classe" />
                            </SelectTrigger>
                            <SelectContent>
                                {classrooms.map((c) => (
                                    <SelectItem key={c.id} value={c.id}>
                                        {c.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-2">
                        <label className="text-sm font-medium">Matière</label>
                        <Select
                            value={selectedSubject}
                            onValueChange={onSubjectChange}
                            disabled={!selectedClassroom || !!activeSession}
                        >
                            <SelectTrigger>
                                <SelectValue placeholder="Sélectionner une matière" />
                            </SelectTrigger>
                            <SelectContent>
                                {subjects.map((s) => (
                                    <SelectItem key={s.id} value={s.id}>
                                        {s.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                {selectedClassroom && selectedSubject && (
                    <div className="mt-4 flex gap-2">
                        {!activeSession ? (
                            <Button
                                onClick={onStartSession}
                                disabled={isPending}
                            >
                                <Play className="h-4 w-4 mr-2" />
                                Démarrer la session
                            </Button>
                        ) : (
                            <>
                                <Button
                                    onClick={onShowScanner}
                                    variant="default"
                                    className="bg-green-600 hover:bg-green-700"
                                >
                                    <Camera className="h-4 w-4 mr-2" />
                                    Scanner un badge
                                </Button>
                                <Button
                                    onClick={onEndSession}
                                    variant="destructive"
                                    disabled={isPending}
                                >
                                    <Square className="h-4 w-4 mr-2" />
                                    Terminer la session
                                </Button>
                            </>
                        )}
                    </div>
                )}
            </CardContent>
        </Card>
    );
};
