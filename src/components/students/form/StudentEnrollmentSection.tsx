import { UseFormReturn } from "react-hook-form";
import { FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StudentFormValues } from "./schema";
import { useEffect, useState } from "react";
import { apiClient } from "@/api/client";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { HelpTooltip } from "@/components/ui/help-tooltip";

interface StudentEnrollmentSectionProps {
    form: UseFormReturn<StudentFormValues>;
    departments: any[];
    levels: any[];
    selectedOptionalSubjects: string[];
    onOptionalSubjectToggle: (id: string) => void;
}

export const StudentEnrollmentSection = ({
    form,
    departments,
    levels,
    selectedOptionalSubjects,
    onOptionalSubjectToggle
}: StudentEnrollmentSectionProps) => {
    const [classes, setClasses] = useState<any[]>([]);
    const [optionalSubjects, setOptionalSubjects] = useState<any[]>([]);

    const departmentId = form.watch("department_id");
    const levelId = form.watch("level_id");
    const classId = form.watch("class_id");

    useEffect(() => {
        const fetchClasses = async () => {
            if (departmentId && departmentId !== "none" && levelId && levelId !== "none") {
                const { data } = await apiClient.get('/classrooms/', {
                    params: { level_id: levelId, department_id: departmentId },
                });

                if (data) {
                    setClasses(data.data || data || []);
                } else {
                    setClasses([]);
                }
            } else if (levelId && levelId !== "none") {
                const { data } = await apiClient.get('/classrooms/', {
                    params: { level_id: levelId },
                });
                setClasses(data.data || data || []);
            } else {
                setClasses([]);
            }
        };
        fetchClasses();
    }, [departmentId, levelId]);

    useEffect(() => {
        const fetchOptionalSubjects = async () => {
            if (classId && classId !== "none") {
                const { data } = await apiClient.get('/subjects/', {
                    params: { is_optional: true },
                });

                if (data) {
                    setOptionalSubjects(data.data || data || []);
                }
            } else {
                setOptionalSubjects([]);
            }
        };
        fetchOptionalSubjects();
    }, [classId]);

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                    control={form.control}
                    name="registration_number"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>
                                Matricule (généré aut. si vide)
                                <HelpTooltip content="Identifiant unique. Laissez vide pour une génération automatique." />
                            </FormLabel>
                            <FormControl>
                                <Input placeholder="2025-SCI-001" {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <FormField
                    control={form.control}
                    name="admission_date"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Date d'admission</FormLabel>
                            <FormControl>
                                <Input type="date" {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <FormField
                    control={form.control}
                    name="department_id"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Département / Filière</FormLabel>
                            <Select onValueChange={(val) => { field.onChange(val); form.setValue("class_id", "none"); }} defaultValue={field.value}>
                                <FormControl>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Choisir un département" />
                                    </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                    <SelectItem value="none">Aucun</SelectItem>
                                    {departments?.map((dept) => (
                                        <SelectItem key={dept.id} value={dept.id}>
                                            {dept.code ? `[${dept.code}] ` : ""}{dept.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <FormField
                    control={form.control}
                    name="level_id"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Niveau</FormLabel>
                            <Select onValueChange={(val) => { field.onChange(val); form.setValue("class_id", "none"); }} defaultValue={field.value}>
                                <FormControl>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Choisir un niveau" />
                                    </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                    <SelectItem value="none">Aucun</SelectItem>
                                    {levels?.map((lvl) => (
                                        <SelectItem key={lvl.id} value={lvl.id}>
                                            {lvl.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                {classes.length > 0 && (
                    <FormField
                        control={form.control}
                        name="class_id"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>
                                    Classe (pour inscription)
                                    <HelpTooltip content="Sélectionnez la classe pour l'année scolaire en cours." />
                                </FormLabel>
                                <Select onValueChange={field.onChange} defaultValue={field.value}>
                                    <FormControl>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Choisir une classe" />
                                        </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                        <SelectItem value="none">Aucune</SelectItem>
                                        {classes.map((cls) => (
                                            <SelectItem key={cls.id} value={cls.id}>
                                                {cls.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                )}
            </div>

            {optionalSubjects.length > 0 && (
                <div className="space-y-4 pt-4 border-t">
                    <h4 className="text-sm font-medium">Matières Optionnelles</h4>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                        {optionalSubjects.map((subject) => (
                            <div key={subject.id} className="flex items-center space-x-2">
                                <Checkbox
                                    id={`subject-${subject.id}`}
                                    checked={selectedOptionalSubjects.includes(subject.id)}
                                    onCheckedChange={() => onOptionalSubjectToggle(subject.id)}
                                />
                                <Label htmlFor={`subject-${subject.id}`} className="text-xs cursor-pointer truncate">
                                    {subject.name}
                                </Label>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};
