import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { studentSchema, StudentFormValues, Parent } from "../schema";
import { apiClient } from "@/api/client";
import { toast } from "sonner";
import { useStudents } from "@/features/students/hooks/useStudents";
import { generateMatricule } from "@/lib/matricule";

interface UseStudentFormProps {
    onSuccess: () => void;
    tenantId: string;
    editStudent?: any;
}

export const useStudentForm = ({ onSuccess, tenantId, editStudent }: UseStudentFormProps) => {
    const [selectedParents, setSelectedParents] = useState<Parent[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Use consolidated hook for mutations
    const { create, update } = useStudents(tenantId);

    // Photo state
    const [photoFile, setPhotoFile] = useState<File | null>(null);
    const [photoPreview, setPhotoPreview] = useState<string | null>(
        editStudent?.photo_url ? `${editStudent.photo_url}?t=${Date.now()}` : null
    );

    // Optional subjects state
    const [selectedOptionalSubjects, setSelectedOptionalSubjects] = useState<string[]>([]);

    const form = useForm<StudentFormValues>({
        resolver: zodResolver(studentSchema),
        defaultValues: {
            first_name: editStudent?.first_name || "",
            last_name: editStudent?.last_name || "",
            email: editStudent?.email || "",
            phone: editStudent?.phone || "",
            date_of_birth: editStudent?.date_of_birth || "",
            gender: editStudent?.gender || "",
            nationality: editStudent?.nationality || "",
            address: editStudent?.address || "",
            postal_code: editStudent?.postal_code || "",
            city: editStudent?.city || "",
            state: editStudent?.state || "",
            country: editStudent?.country || "",
            registration_number: editStudent?.registration_number || "",
            student_id_card: editStudent?.student_id_card || "",
            admission_date: editStudent?.admission_date || new Date().toISOString().split('T')[0],
            department_id: editStudent?.department_id || "none",
            level_id: editStudent?.level_id || "none",
            class_id: editStudent?.class_id || "none",
            notes: editStudent?.notes || "",
        },
    });

    // Auto-generate matricule
    const departmentId = form.watch("department_id");
    const admissionDate = form.watch("admission_date");
    const registrationNumber = form.watch("registration_number");

    useEffect(() => {
        const generate = async () => {
            if (!editStudent && departmentId && departmentId !== "none" && admissionDate && !registrationNumber) {
                const { data: dept } = await apiClient.get(`/departments/${departmentId}/`);

                if (dept?.data?.code || dept?.code) {
                    const year = new Date(admissionDate).getFullYear();
                    const { data: countData } = await apiClient.get('/students/', {
                        params: { tenant_id: tenantId, count_only: 'true' },
                    });
                    const sequence = ((countData?.data?.count || countData?.count) || 0) + 1;
                    const matricule = generateMatricule(dept.code, year, sequence);
                    form.setValue("registration_number", matricule);
                }
            }
        };
        generate();
    }, [departmentId, admissionDate, editStudent, tenantId, form, registrationNumber]);

    const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setPhotoFile(file);
            setPhotoPreview(URL.createObjectURL(file));
        }
    };

    const uploadPhoto = async (studentId: string) => {
        if (!photoFile) return editStudent?.photo_url || null;

        const fileExt = photoFile.name.split('.').pop();
        const filePath = `${tenantId}/${studentId}/${Date.now()}.${fileExt}`;

        const uploadFormData = new FormData();
        uploadFormData.append('file', photoFile);
        uploadFormData.append('type', 'student-photo');
        uploadFormData.append('student_id', studentId);

        const { data: uploadData } = await apiClient.post('/storage/upload', uploadFormData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });

        if (uploadData?.url) return uploadData.url;
    };

    const searchParents = async (query: string) => {
        const { data } = await apiClient.get('/parents/', {
            params: { tenant_id: tenantId, search: query },
        });

        return (data.data || data || []) as Parent[];
    };

    const onSubmit = async (values: StudentFormValues) => {
        setIsSubmitting(true);
        try {
            // 1. Check for duplicates (only on create)
            if (!editStudent) {
                const { data: duplicates } = await apiClient.get('/students/', {
                    params: {
                        tenant_id: tenantId,
                        first_name: values.first_name,
                        last_name: values.last_name,
                        date_of_birth: values.date_of_birth || '',
                    },
                });

                if ((duplicates.data || duplicates)?.length > 0) {
                    const confirm = window.confirm("Un étudiant similaire existe déjà. Voulez-vous continuer ?");
                    if (!confirm) {
                        setIsSubmitting(false);
                        return;
                    }
                }
            }

            // 2. Prepare data
            const studentData: any = {
                ...values,
                department_id: values.department_id === "none" ? null : values.department_id,
                level_id: values.level_id === "none" ? null : values.level_id,
            };
            // class_id is handled via enrollment, not direct student field usually, but let's keep logic if schema allows
            // In modern schema, class_id might be on enrollment. 
            // The original code deleted class_id before insert.
            delete studentData.class_id;

            let studentId = editStudent?.id;

            if (editStudent) {
                await update({ id: studentId, data: studentData });
            } else {
                // Create returns the new student
                // Note: create mutator might be void or return data depending on implementation.
                // Our useStudents hook returns { create, ... } where create is mutateAsync usually

                // We need to return the ID from the service for the next steps (photo, parents, enrollment)
                // The new useStudents hook exposes `create` which wraps `studentsService.createStudent`
                // Let's use `studentsService` directly if we need the ID immediately and avoid hook complexity?
                // Or better, use mutateAsync if available.

                // Reviewing useStudents.ts:
                // const { mutateAsync: create } = ...
                // So we can await it.

                const newStudent = await create(studentData);
                // Wait, the create mutation in useStudents.ts calls studentsService.createStudent which returns the student.
                studentId = newStudent?.id;
            }

            if (!studentId) throw new Error("Impossible de récupérer l'ID de l'étudiant");

            // 3. Handle Photo Upload if needed
            if (photoFile) {
                const photoUrl = await uploadPhoto(studentId);
                // Update with photo URL - using the update hook again or direct service?
                // Direct update via hook is fine
                await update({ id: studentId, data: { photo_url: photoUrl } });

                // Also update profile if it exists (legacy/sync)
                await apiClient.patch(`/users/profiles/${studentId}/`, { avatar_url: photoUrl });
            }

            // 4. Link Parents
            if (selectedParents.length > 0) {
                if (editStudent) {
                    await apiClient.delete('/student-parents/', {
                        params: { student_id: studentId },
                    });
                }

                const links = selectedParents.map(p => ({
                    tenant_id: tenantId,
                    student_id: studentId,
                    parent_id: p.id,
                    relationship_type: 'Guardian'
                }));

                await apiClient.post('/student-parents/', links);
            }

            // 5. Inscription if new and class selected
            if (!editStudent && studentData.department_id && studentData.level_id && values.class_id && values.class_id !== "none") {
                const { data: year } = await apiClient.get('/academic-years/', {
                    params: { tenant_id: tenantId, is_current: 'true' },
                });
                const currentYear = year.data || year;

                if (currentYear) {
                    const enrollmentDate = new Date().toISOString().split('T')[0];

                    const { data: existing } = await apiClient.get('/enrollments/', {
                        params: { student_id: studentId, academic_year_id: currentYear.id, class_id: values.class_id },
                    });

                    if (!(existing.data || existing)?.length) {
                        const { data: enrollment } = await apiClient.post('/enrollments/', {
                            tenant_id: tenantId,
                            student_id: studentId,
                            class_id: values.class_id,
                            academic_year_id: currentYear.id,
                            enrollment_date: enrollmentDate,
                            status: 'Active'
                        });

                        const enrollId = enrollment.data?.id || enrollment.id;

                        if (enrollId && selectedOptionalSubjects.length > 0) {
                            const subjectEnrollments = selectedOptionalSubjects.map(subId => ({
                                enrollment_id: enrollId,
                                subject_id: subId,
                                tenant_id: tenantId
                            }));
                            await apiClient.post('/student-subjects/', subjectEnrollments);
                        }
                    }
                }
            }

            // Toast handled by hook usually, but form specific logic might want it
            // The hook handles generic success. 
            // We can call onSuccess callback here.
            onSuccess();
        } catch (error: any) {
            console.error("Error submitting form:", error);
            // Toast handled by hook error or here? 
            // Hook handles generic error, but we have specific steps here.
            toast.error("Erreur: " + error.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    return {
        form,
        onSubmit,
        isSubmitting,
        selectedParents,
        setSelectedParents,
        searchParents,
        photoPreview,
        handlePhotoSelect,
        selectedOptionalSubjects,
        setSelectedOptionalSubjects
    };
};
