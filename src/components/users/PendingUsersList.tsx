import { useState, useRef, useMemo } from "react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { useStudentLabel } from "@/hooks/useStudentLabel";
import { useToast } from "@/hooks/use-toast";
import {
    userQueries,
    useConvertToAccount,
    useDeletePendingUser
} from "@/queries/users";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
    UserPlus,
    Search,
    Loader2,
    UserCircle2,
    GraduationCap,
    Users as UsersIcon,
    CheckCircle2,
    AlertCircle,
    Plus,
    XCircle,
    Trash2
} from "lucide-react";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface PendingUser {
    id: string;
    type: 'student' | 'parent';
    first_name: string;
    last_name: string;
    email: string | null;
    phone: string | null;
    registration_number?: string;
}

export function PendingUsersList() {
    const { tenant } = useTenant();
    const { studentLabel, studentsLabel } = useStudentLabel();
    const studentLabelLower = studentLabel.toLowerCase();
    const studentsLabelLower = studentsLabel.toLowerCase();
    const { toast } = useToast();
    const parentRef = useRef<HTMLDivElement>(null);

    // Filter states
    const [searchQuery, setSearchQuery] = useState("");

    // UI states
    const [isAddParentOpen, setIsAddParentOpen] = useState(false);
    const [newParent, setNewParent] = useState({ firstName: "", lastName: "", email: "", phone: "" });
    const [isCreatingParent, setIsCreatingParent] = useState(false);
    const [userToDelete, setUserToDelete] = useState<PendingUser | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const [createdUserCredentials, setCreatedUserCredentials] = useState<{ email: string, password: string } | null>(null);

    const queryClient = useQueryClient();

    // TanStack Query
    const { data: pendingUsers = [], isLoading } = useQuery(userQueries.pending(tenant?.id || ""));
    const convertMutation = useConvertToAccount(tenant?.id || "");
    const deleteMutation = useDeletePendingUser(tenant?.id || "");

    // Filtered data
    const filtered = useMemo(() => {
        return pendingUsers.filter(u =>
            `${u.first_name} ${u.last_name} ${u.email || ''}`.toLowerCase().includes(searchQuery.toLowerCase())
        );
    }, [pendingUsers, searchQuery]);

    // Virtualizer
    const rowVirtualizer = useVirtualizer({
        count: filtered.length,
        getScrollElement: () => parentRef.current,
        estimateSize: () => 73, // Row height
        overscan: 5,
    });

    const handleCreateAccount = async (user: PendingUser) => {
        if (!tenant || !user.email) {
            toast({
                title: "Email manquant",
                description: "Un email est requis pour créer un compte utilisateur.",
                variant: "destructive"
            });
            return;
        }

        const generatedPassword = Math.random().toString(36).slice(-8) + Math.random().toString(36).slice(-2).toUpperCase();

        convertMutation.mutate({
            user: {
                id: user.id,
                first_name: user.first_name,
                last_name: user.last_name,
                email: user.email,
                type: user.type
            },
            tenant: {
                id: tenant.id,
                name: tenant.name,
                slug: tenant.slug,
                logo_url: tenant.logo_url
            },
            generatedPassword
        }, {
            onSuccess: () => {
                setCreatedUserCredentials({ email: user.email!, password: generatedPassword });
            }
        });
    };

    const handleCreateIsolatedParent = async () => {
        if (!tenant || !newParent.email || !newParent.firstName || !newParent.lastName) return;

        setIsCreatingParent(true);
        try {
            const { error } = await supabase
                .from("parents")
                .insert({
                    first_name: newParent.firstName,
                    last_name: newParent.lastName,
                    email: newParent.email,
                    phone: newParent.phone || null,
                    tenant_id: tenant.id
                });

            if (error) throw error;

            toast({
                title: "Parent ajouté",
                description: "Le parent a été ajouté à la liste d'attente.",
            });

            setIsAddParentOpen(false);
            setNewParent({ firstName: "", lastName: "", email: "", phone: "" });
            queryClient.invalidateQueries({ queryKey: ["users", "pending", tenant.id] });
        } catch (error: unknown) {
            console.error("Error creating parent:", error);
            const errorMessage = error instanceof Error ? error.message : "Impossible de créer le parent";
            toast({
                title: "Erreur",
                description: errorMessage,
                variant: "destructive",
            });
        } finally {
            setIsCreatingParent(false);
        }
    };

    const handleDeleteUser = async () => {
        if (!tenant || !userToDelete) return;

        deleteMutation.mutate({ id: userToDelete.id, type: userToDelete.type }, {
            onSuccess: () => {
                setUserToDelete(null);
            }
        });
    };

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-2 mb-4">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                        placeholder={`Rechercher un ${studentLabelLower} ou un parent...`}
                        className="pl-10"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>
                <Dialog open={isAddParentOpen} onOpenChange={setIsAddParentOpen}>
                    <DialogTrigger asChild>
                        <Button variant="outline" className="gap-2">
                            <Plus className="w-4 h-4" />
                            Créer Parent
                        </Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Ajouter un Parent (Isolé)</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4 py-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>Prénom</Label>
                                    <Input
                                        value={newParent.firstName}
                                        onChange={(e) => setNewParent({ ...newParent, firstName: e.target.value })}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>Nom</Label>
                                    <Input
                                        value={newParent.lastName}
                                        onChange={(e) => setNewParent({ ...newParent, lastName: e.target.value })}
                                    />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label>Email</Label>
                                <Input
                                    type="email"
                                    value={newParent.email}
                                    onChange={(e) => setNewParent({ ...newParent, email: e.target.value })}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Téléphone (Optionnel)</Label>
                                <Input
                                    value={newParent.phone}
                                    onChange={(e) => setNewParent({ ...newParent, phone: e.target.value })}
                                />
                            </div>
                            <Button
                                className="w-full"
                                onClick={handleCreateIsolatedParent}
                                disabled={isCreatingParent || !newParent.email || !newParent.firstName || !newParent.lastName}
                            >
                                {isCreatingParent ? (
                                    <>
                                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                        Création...
                                    </>
                                ) : (
                                    "Ajouter à la liste d'attente"
                                )}
                            </Button>
                        </div>
                    </DialogContent>
                </Dialog>
            </div>

            <div className="rounded-xl border bg-card overflow-hidden">
                <Table>
                    <TableHeader>
                        <TableRow className="bg-muted/50">
                            <TableHead>Type</TableHead>
                            <TableHead>Nom</TableHead>
                            <TableHead>Email</TableHead>
                            <TableHead>Contact</TableHead>
                            <TableHead className="text-right">Action</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {isLoading ? (
                            <TableRow>
                                <TableCell colSpan={5} className="text-center py-10">
                                    <Loader2 className="w-6 h-6 animate-spin mx-auto text-primary" />
                                </TableCell>
                            </TableRow>
                        ) : filtered.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={5} className="text-center py-10 text-muted-foreground">
                                    <div className="flex flex-col items-center gap-2">
                                        <CheckCircle2 className="w-10 h-10 text-green-500/50" />
                                        <p>Tous les {studentsLabelLower} et parents ont un compte portail.</p>
                                    </div>
                                </TableCell>
                            </TableRow>
                        ) : (
                            filtered.map((user) => (
                                <TableRow key={user.id} className="hover:bg-muted/30 transition-colors">
                                    <TableCell>
                                        <div className="flex items-center gap-2">
                                            {user.type === 'student' ? (
                                                <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200 gap-1 font-medium">
                                                    <GraduationCap className="w-3 h-3" />
                                                    {studentLabel}
                                                </Badge>
                                            ) : (
                                                <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200 gap-1 font-medium">
                                                    <UsersIcon className="w-3 h-3" />
                                                    Parent
                                                </Badge>
                                            )}
                                        </div>
                                    </TableCell>
                                    <TableCell className="font-bold">
                                        <div className="flex items-center gap-3">
                                            <Avatar className="h-9 w-9 border-2 border-background shadow-sm">
                                                <AvatarFallback className="bg-primary/10 text-primary font-bold">
                                                    {user.first_name?.[0]}{user.last_name?.[0]}
                                                </AvatarFallback>
                                            </Avatar>
                                            <div className="flex flex-col">
                                                <span className="font-bold">{user.first_name} {user.last_name}</span>
                                                {user.registration_number && (
                                                    <span className="block text-[10px] text-muted-foreground font-mono">
                                                        {user.registration_number}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        {user.email ? (
                                            <span className="text-sm">{user.email}</span>
                                        ) : (
                                            <Badge variant="secondary" className="text-[10px] gap-1 bg-red-50 text-red-500">
                                                <AlertCircle className="w-3 h-3" />
                                                Email manquant
                                            </Badge>
                                        )}
                                    </TableCell>
                                    <TableCell className="text-sm text-muted-foreground italic">
                                        {user.phone || "—"}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <Button
                                            size="sm"
                                            onClick={() => handleCreateAccount(user)}
                                            disabled={(convertMutation.isPending && convertMutation.variables?.user.id === user.id) || !user.email}
                                            className="gap-2 shadow-sm rounded-lg"
                                        >
                                            {(convertMutation.isPending && convertMutation.variables?.user.id === user.id) ? (
                                                <Loader2 className="w-3 h-3 animate-spin" />
                                            ) : (
                                                <UserPlus className="w-3 h-3" />
                                            )}
                                            {(convertMutation.isPending && convertMutation.variables?.user.id === user.id) ? "Création..." : "Créer le compte"}
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => setUserToDelete(user)}
                                            className="ml-2 text-destructive hover:text-destructive hover:bg-destructive/10"
                                            title="Supprimer la fiche"
                                        >
                                            <XCircle className="w-4 h-4" />
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>

            <div className="p-4 bg-primary/5 rounded-xl border border-primary/10 flex gap-3 text-sm text-primary/80">
                <UserCircle2 className="w-5 h-5 shrink-0" />
                <p>
                    Les comptes créés ici recevront un email avec leurs identifiants temporaires.
                    Ils seront automatiquement associés à leur fiche {studentLabelLower} ou parent.
                </p>
            </div>

            <AlertDialog open={!!userToDelete} onOpenChange={() => setUserToDelete(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle className="text-destructive flex items-center gap-2">
                            <Trash2 className="w-5 h-5" />
                            Supprimer la fiche ?
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            Voulez-vous vraiment supprimer la fiche de <strong>{userToDelete?.first_name} {userToDelete?.last_name}</strong> ?
                            <br /><br />
                            Attention : Cette action est irréversible et supprimera toutes les données associées à cette personne (inscriptions, notes, etc. pour un {studentLabelLower}).
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isDeleting}>Annuler</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleDeleteUser}
                            className="bg-destructive text-white hover:bg-destructive/90"
                            disabled={isDeleting}
                        >
                            {isDeleting ? "Suppression..." : "Supprimer définitivement"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <Dialog open={!!createdUserCredentials} onOpenChange={(open) => !open && setCreatedUserCredentials(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Compte créé avec succès</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="bg-muted/50 p-4 rounded-lg space-y-3">
                            <div>
                                <Label className="text-xs text-muted-foreground">Email</Label>
                                <div className="font-mono text-sm font-medium flex items-center justify-between">
                                    {createdUserCredentials?.email}
                                </div>
                            </div>
                            <div>
                                <Label className="text-xs text-muted-foreground">Mot de passe temporaire</Label>
                                <div className="font-mono text-lg font-bold bg-background p-2 rounded border flex items-center justify-between">
                                    {createdUserCredentials?.password}
                                </div>
                            </div>
                        </div>
                        <p className="text-sm text-muted-foreground">
                            Veuillez transmettre ces identifiants à l'utilisateur. Il devra changer son mot de passe à la première connexion.
                        </p>
                        <Button onClick={() => setCreatedUserCredentials(null)} className="w-full">
                            Fermer
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
