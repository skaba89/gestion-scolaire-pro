import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Check, UserPlus, Search, User } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface LinkParentDialogProps {
  studentId: string;
  tenantId: string;
  onSuccess?: () => void;
}

export function LinkParentDialog({ studentId, tenantId, onSuccess }: LinkParentDialogProps) {
  const [open, setOpen] = useState(false);
  const [selectedParentId, setSelectedParentId] = useState<string>("");
  const [relationship, setRelationship] = useState("parent");
  const queryClient = useQueryClient();

  // Data Parent State
  const [parentSearchTerm, setParentSearchTerm] = useState("");
  const [foundDataParents, setFoundDataParents] = useState<any[]>([]);
  const [isSearchingDataParent, setIsSearchingDataParent] = useState(false);
  const [showNewParentForm, setShowNewParentForm] = useState(false);
  const [newParent, setNewParent] = useState({
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    address: ""
  });


  // Fetch available USER parents (users with PARENT role)
  const { data: availableParents } = useQuery({
    queryKey: ["available-parents", tenantId],
    queryFn: async () => {
      if (!tenantId) return [];
      const { data, error } = await supabase
        .from("profiles")
        .select(`
          id,
          first_name,
          last_name,
          email
        `)
        .in("id", await supabase
          .from("user_roles")
          .select("user_id")
          .eq("tenant_id", tenantId)
          .eq("role", "PARENT")
          .then(({ data }) => data?.map(r => r.user_id) || [])
        );

      if (error) throw error;
      return data || [];
    },
    enabled: !!tenantId && open,
  });

  // Mutation to link USER parent (Account)
  const linkUserParentMutation = useMutation({
    mutationFn: async () => {
      if (!studentId || !selectedParentId) throw new Error("Missing required fields");

      const { error } = await supabase
        .from("parent_students")
        .insert({
          student_id: studentId,
          parent_id: selectedParentId,
          relationship,
          is_primary: false,
          tenant_id: tenantId,
        });

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Compte parent lié avec succès!");
      handleClose();
    },
    onError: (error) => {
      console.error("Error linking parent user:", error);
      toast.error("Erreur lors de la liaison du compte parent");
    },
  });

  // Mutation to link DATA parent (Contact Info)
  const linkDataParentMutation = useMutation({
    mutationFn: async (parentId: string) => {
      const { error } = await supabase.from("student_parents").insert({
        tenant_id: tenantId,
        student_id: studentId,
        parent_id: parentId,
        relationship_type: relationship
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Fiche parent ajoutée avec succès");
      handleClose();
    },
    onError: (error: any) => {
      toast.error("Erreur: " + error.message);
    }
  });

  const searchDataParents = async () => {
    if (!parentSearchTerm || parentSearchTerm.length < 2) return;
    setIsSearchingDataParent(true);
    const { data } = await supabase
      .from("parents")
      .select("*")
      .eq("tenant_id", tenantId)
      .or(`first_name.ilike.%${parentSearchTerm}%,last_name.ilike.%${parentSearchTerm}%,phone.ilike.%${parentSearchTerm}%`)
      .limit(5);
    setFoundDataParents(data || []);
    setIsSearchingDataParent(false);
  };

  const createNewParent = async () => {
    if (!newParent.first_name || !newParent.last_name) {
      toast.error("Nom et prénom requis");
      return;
    }

    const { data, error } = await supabase.from("parents").insert({
      tenant_id: tenantId,
      ...newParent
    }).select().single();

    if (error) {
      toast.error("Erreur création: " + error.message);
      return;
    }

    // Automatically link after create
    linkDataParentMutation.mutate(data.id);
  };

  const handleClose = () => {
    setOpen(false);
    setSelectedParentId("");
    setRelationship("parent");
    setParentSearchTerm("");
    setFoundDataParents([]);
    setShowNewParentForm(false);
    setNewParent({ first_name: "", last_name: "", email: "", phone: "", address: "" });

    queryClient.invalidateQueries({ queryKey: ["student-details"] });
    // Invalidate both queries to be safe
    queryClient.invalidateQueries({ queryKey: ["parent-students-links"] });
    queryClient.invalidateQueries({ queryKey: ["student-parents"] });

    onSuccess?.();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Plus className="w-4 h-4 mr-2" />
          Ajouter Parent
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Ajouter un Responsable</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="account" className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-4">
            <TabsTrigger value="account">Compte Utilisateur</TabsTrigger>
            <TabsTrigger value="data">Fiche Contact</TabsTrigger>
          </TabsList>

          <TabsContent value="account" className="space-y-4">
            <div className="bg-blue-50 text-blue-800 p-3 rounded-md text-xs mb-4">
              Utilisez cette option pour donner accès au <strong>Portail Parents</strong> à un utilisateur existant.
            </div>
            {/* Parent Selection */}
            <div className="space-y-2">
              <Label>Utilisateur Parent *</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    className={cn(
                      "w-full justify-between",
                      !selectedParentId && "text-muted-foreground"
                    )}
                  >
                    {selectedParentId
                      ? availableParents?.find(p => p.id === selectedParentId)
                        ? `${availableParents.find(p => p.id === selectedParentId)?.first_name} ${availableParents.find(p => p.id === selectedParentId)?.last_name}`
                        : "Sélectionner un utilisateur..."
                      : "Sélectionner un utilisateur..."}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-full p-0">
                  <Command>
                    <CommandInput placeholder="Chercher un compte..." />
                    <CommandEmpty>Aucun compte parent trouvé.</CommandEmpty>
                    <CommandList>
                      <CommandGroup>
                        {availableParents?.map((parent) => (
                          <CommandItem
                            key={parent.id}
                            value={parent.id}
                            onSelect={(currentValue) => {
                              setSelectedParentId(
                                currentValue === selectedParentId ? "" : currentValue
                              );
                            }}
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4",
                                selectedParentId === parent.id
                                  ? "opacity-100"
                                  : "opacity-0"
                              )}
                            />
                            <div>
                              <div className="font-medium">
                                {parent.first_name} {parent.last_name}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {parent.email}
                              </div>
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2">
              <Label>Relation</Label>
              <Select value={relationship} onValueChange={setRelationship}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="parent">Parent</SelectItem>
                  <SelectItem value="guardian">Tuteur</SelectItem>
                  <SelectItem value="foster_parent">Parent d'accueil</SelectItem>
                  <SelectItem value="grandparent">Grand-parent</SelectItem>
                  <SelectItem value="other">Autre</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button
              onClick={() => linkUserParentMutation.mutate()}
              disabled={!selectedParentId || linkUserParentMutation.isPending}
              className="w-full"
            >
              {linkUserParentMutation.isPending ? "Liaison..." : "Lier le Compte"}
            </Button>
          </TabsContent>

          <TabsContent value="data" className="space-y-4">
            <div className="bg-amber-50 text-amber-800 p-3 rounded-md text-xs mb-4">
              Utilisez cette option pour ajouter les coordonnées d'un parent (téléphone, email) <strong>sans créer de compte utilisateur</strong>.
            </div>

            {!showNewParentForm ? (
              <div className="space-y-3">
                <Label>Rechercher une fiche existante</Label>
                <div className="flex gap-2">
                  <Input
                    placeholder="Nom, tel..."
                    value={parentSearchTerm}
                    onChange={e => setParentSearchTerm(e.target.value)}
                  />
                  <Button type="button" variant="outline" onClick={searchDataParents} disabled={isSearchingDataParent}>
                    <Search className="w-4 h-4" />
                  </Button>
                </div>

                {foundDataParents.length > 0 && (
                  <div className="border rounded-md p-2 space-y-1 bg-muted/50 max-h-40 overflow-y-auto">
                    {foundDataParents.map(p => (
                      <div key={p.id} className="flex justify-between items-center p-2 hover:bg-white rounded cursor-pointer border border-transparent hover:border-muted group"
                        onClick={() => linkDataParentMutation.mutate(p.id)}
                      >
                        <div>
                          <div className="text-sm font-bold">{p.first_name} {p.last_name}</div>
                          <div className="text-xs text-muted-foreground">{p.phone}</div>
                        </div>
                        <Button size="sm" variant="secondary" className="opacity-0 group-hover:opacity-100">Choisir</Button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="relative py-2">
                  <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
                  <div className="relative flex justify-center text-xs uppercase"><span className="bg-background px-2 text-muted-foreground">Ou</span></div>
                </div>

                <Button type="button" variant="outline" className="w-full" onClick={() => setShowNewParentForm(true)}>
                  <UserPlus className="w-4 h-4 mr-2" /> Créer une nouvelle fiche
                </Button>
              </div>
            ) : (
              <div className="space-y-3 bg-muted/20 p-4 rounded-lg border">
                <h4 className="font-semibold text-sm flex justify-between items-center">
                  Nouveau Parent
                  <Button variant="ghost" size="sm" onClick={() => setShowNewParentForm(false)} className="h-6 w-6 p-0 rounded-full">X</Button>
                </h4>
                <div className="grid grid-cols-2 gap-2">
                  <Input placeholder="Nom" value={newParent.last_name} onChange={e => setNewParent({ ...newParent, last_name: e.target.value })} />
                  <Input placeholder="Prénom" value={newParent.first_name} onChange={e => setNewParent({ ...newParent, first_name: e.target.value })} />
                </div>
                <Input placeholder="Téléphone" value={newParent.phone} onChange={e => setNewParent({ ...newParent, phone: e.target.value })} />
                <Input placeholder="Email" value={newParent.email} onChange={e => setNewParent({ ...newParent, email: e.target.value })} />

                <div className="space-y-2 pt-2">
                  <Label>Relation</Label>
                  <Select value={relationship} onValueChange={setRelationship}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="parent">Parent</SelectItem>
                      <SelectItem value="guardian">Tuteur</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <Button className="w-full mt-2" onClick={createNewParent}>Enregistrer & Lier</Button>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
