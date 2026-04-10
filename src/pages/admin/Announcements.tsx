import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTenant } from "@/contexts/TenantContext";
import { useStudentLabel } from "@/hooks/useStudentLabel";
import { Loader2 } from "lucide-react";

// Queries
import {
    communicationQueries,
    useCreateAnnouncement,
    useDeleteAnnouncement
} from "@/queries/communication";

// Modular Components
import { AnnouncementHeader } from "@/components/communication/AnnouncementHeader";
import { AnnouncementList } from "@/components/communication/AnnouncementList";
import { AnnouncementDialog } from "@/components/communication/AnnouncementDialog";

export default function Announcements() {
    const { tenant } = useTenant();
    const { StudentLabel } = useStudentLabel();
    const [isDialogOpen, setIsDialogOpen] = useState(false);

    const ROLE_LABELS: Record<string, string> = {
        TENANT_ADMIN: "Admin",
        DIRECTOR: "Directeur",
        TEACHER: "Enseignant",
        STUDENT: StudentLabel,
        PARENT: "Parent",
        STAFF: "Personnel",
    };

    // Fetch announcements
    const { data: announcements = [], isLoading } = useQuery({
        ...communicationQueries.announcements(tenant?.id || ""),
        enabled: !!tenant?.id,
    });

    const createMutation = useCreateAnnouncement();
    const deleteMutation = useDeleteAnnouncement();

    const handleCreateAnnouncement = async (data: any) => {
        try {
            await createMutation.mutateAsync({
                ...data,
                tenant_id: tenant?.id || "",
                author_id: null, // Can be set from context if needed
            });
            setIsDialogOpen(false);
        } catch (error) {
            // Error handled by hook
        }
    };

    return (
        <div className="space-y-6">
            <AnnouncementHeader onAddClick={() => setIsDialogOpen(true)} />

            {isLoading ? (
                <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
            ) : (
                <AnnouncementList
                    announcements={announcements}
                    onDelete={(id) => deleteMutation.mutate(id)}
                    roleLabels={ROLE_LABELS}
                />
            )}

            <AnnouncementDialog
                open={isDialogOpen}
                onOpenChange={setIsDialogOpen}
                onSubmit={handleCreateAnnouncement}
                isPending={createMutation.isPending}
                roleLabels={ROLE_LABELS}
            />
        </div>
    );
}
