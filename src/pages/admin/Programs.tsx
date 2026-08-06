import { useState } from "react";
import { useTenant } from "@/contexts/TenantContext";
import { useAuth } from "@/contexts/AuthContext";
import { hasPermission } from "@/lib/permissions";
import { usePrograms, useCreateProgram, useUpdateProgram, useDeleteProgram, type Program } from "@/queries/programs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
import { Plus, Pencil, Trash2, GraduationCap, Loader2, Search } from "lucide-react";
import { toast } from "sonner";

/**
 * Filières / Programmes — until this page existed, there was no way for a
 * tenant (not even TENANT_ADMIN/SUPER_ADMIN) to rename or remove a program
 * once created: the backend only ever exposed GET/POST on
 * /infrastructure/programs/, never PATCH/DELETE, and no admin screen called
 * them at all. Tenants seeded with generic placeholders ("Licence 1",
 * "Master 1", ...) had no way to replace them with their real filières.
 */
const Programs = () => {
  const { tenant } = useTenant();
  const { roles } = useAuth();
  const canManage = hasPermission(roles, "classrooms:manage");

  const { data: programs = [], isLoading } = usePrograms(tenant?.id);
  const createMutation = useCreateProgram();
  const updateMutation = useUpdateProgram();
  const deleteMutation = useDeleteProgram();

  const [searchQuery, setSearchQuery] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Program | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Program | null>(null);
  const [form, setForm] = useState({ name: "", code: "", description: "" });

  const isPending = createMutation.isPending || updateMutation.isPending;

  const filtered = programs.filter(
    (p) =>
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.code || "").toLowerCase().includes(searchQuery.toLowerCase())
  );

  const openCreate = () => {
    setEditing(null);
    setForm({ name: "", code: "", description: "" });
    setDialogOpen(true);
  };

  const openEdit = (program: Program) => {
    setEditing(program);
    setForm({ name: program.name, code: program.code || "", description: program.description || "" });
    setDialogOpen(true);
  };

  const handleSubmit = async () => {
    if (!form.name.trim()) {
      toast.error("Le nom de la filière est requis");
      return;
    }
    const payload = {
      name: form.name.trim(),
      code: form.code.trim() || null,
      description: form.description.trim() || null,
    };
    try {
      if (editing) {
        await updateMutation.mutateAsync({ id: editing.id, updates: payload });
        toast.success("Filière mise à jour");
      } else {
        await createMutation.mutateAsync(payload);
        toast.success("Filière créée");
      }
      setDialogOpen(false);
      setEditing(null);
    } catch (error: any) {
      toast.error(error?.response?.data?.detail || "Une erreur est survenue");
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteMutation.mutateAsync(deleteTarget.id);
      toast.success("Filière supprimée");
      setDeleteTarget(null);
    } catch (error: any) {
      toast.error(error?.response?.data?.detail || "Impossible de supprimer cette filière");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <GraduationCap className="w-6 h-6 text-primary" />
            Filières & Programmes
          </h1>
          <p className="text-muted-foreground text-sm">
            Gérez les filières affichées sur votre page publique et utilisées pour vos classes.
          </p>
        </div>
        {canManage && (
          <Button onClick={openCreate}>
            <Plus className="w-4 h-4 mr-2" />
            Nouvelle filière
          </Button>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Liste des filières</CardTitle>
          <CardDescription>{programs.length} filière(s) au total</CardDescription>
          <div className="relative mt-2 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Rechercher par nom ou code..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-center text-muted-foreground py-10">
              {programs.length === 0
                ? "Aucune filière pour le moment."
                : "Aucune filière ne correspond à votre recherche."}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Nom</TableHead>
                  <TableHead>Description</TableHead>
                  {canManage && <TableHead className="text-right">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((program) => (
                  <TableRow key={program.id}>
                    <TableCell className="font-mono font-medium">{program.code || "—"}</TableCell>
                    <TableCell className="font-medium">{program.name}</TableCell>
                    <TableCell className="text-muted-foreground max-w-md truncate">
                      {program.description || "—"}
                    </TableCell>
                    {canManage && (
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(program)}>
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(program)}>
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Modifier la filière" : "Nouvelle filière"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-1 block">Nom *</label>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Ex : Économie, Droit, Génie Informatique..."
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Code</label>
              <Input
                value={form.code}
                onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
                placeholder="Ex : ECO, DRT, INFO..."
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Description</label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Description courte affichée sur la page publique"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Annuler
            </Button>
            <Button onClick={handleSubmit} disabled={isPending}>
              {isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {editing ? "Enregistrer" : "Créer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer cette filière ?</AlertDialogTitle>
            <AlertDialogDescription>
              « {deleteTarget?.name} » sera définitivement supprimée. Les classes déjà rattachées à
              cette filière ne seront pas supprimées, mais perdront leur association.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Programs;
