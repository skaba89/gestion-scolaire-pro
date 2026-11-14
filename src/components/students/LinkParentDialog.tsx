import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/api/client";
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
import { Trans, useTranslation } from "react-i18next";

interface LinkParentDialogProps {
  studentId: string;
  tenantId: string;
  onSuccess?: () => void;
}

export function LinkParentDialog({ studentId, tenantId, onSuccess }: LinkParentDialogProps) {
  const { t } = useTranslation();
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
      const { data: rolesData } = await apiClient.get('/users/roles/', {
        params: { tenant_id: tenantId, role: 'PARENT' },
      });
      const parentUserIds = (rolesData.data || rolesData || []).map((r: any) => r.user_id);

      const { data } = await apiClient.get('/users/profiles/', {
        params: { tenant_id: tenantId, ids: parentUserIds.join(',') },
      });

      return data.data || data || [];
    },
    enabled: !!tenantId && open,
  });

  // Mutation to link USER parent (Account)
  const linkUserParentMutation = useMutation({
    mutationFn: async () => {
      if (!studentId || !selectedParentId) throw new Error("Missing required fields");

      await apiClient.post('/parents/link/', {
        student_id: studentId,
        parent_id: selectedParentId,
        relation_type: relationship,
        is_primary: false,
        tenant_id: tenantId,
      });
    },
    onSuccess: () => {
      toast.success(t("studentsAdmin.compteParentLieAvecSucces"));
      handleClose();
    },
    onError: (error) => {
      console.error("Error linking parent user:", error);
      toast.error(t("studentsAdmin.erreurLorsDeLaLiaison"));
    },
  });

  // Mutation to link DATA parent (Contact Info)
  const linkDataParentMutation = useMutation({
    mutationFn: async (parentId: string) => {
      await apiClient.post('/student-parents/', {
        tenant_id: tenantId,
        student_id: studentId,
        parent_id: parentId,
        relation_type: relationship
      });
      // apiClient throws on error
    },
    onSuccess: () => {
      toast.success(t("studentsAdmin.ficheParentAjouteeAvecSucces"));
      handleClose();
    },
    onError: (error: any) => {
      toast.error(t("studentsAdmin.erreur") + error.message);
    }
  });

  const searchDataParents = async () => {
    if (!parentSearchTerm || parentSearchTerm.length < 2) return;
    setIsSearchingDataParent(true);
    const { data } = await apiClient.get('/parents/', {
      params: { tenant_id: tenantId, search: parentSearchTerm },
    });
    setFoundDataParents(data.data || data || []);
    setIsSearchingDataParent(false);
  };

  const createNewParent = async () => {
    if (!newParent.first_name || !newParent.last_name || !newParent.email) {
      toast.error(t("studentsAdmin.nomPrenomEtEmailRequis"));
      return;
    }

    const { data } = await apiClient.post('/parents/', {
      tenant_id: tenantId,
      ...newParent
    });

    // Automatically link after create
    linkDataParentMutation.mutate(data.data?.id || data.id);
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
          {t("studentsAdmin.ajouterParent")}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{t("studentsAdmin.ajouterUnResponsable")}</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="account" className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-4">
            <TabsTrigger value="account">{t("studentsAdmin.compteUtilisateur")}</TabsTrigger>
            <TabsTrigger value="data">{t("studentsAdmin.ficheContact")}</TabsTrigger>
          </TabsList>

          <TabsContent value="account" className="space-y-4">
            <div className="bg-blue-50 text-blue-800 p-3 rounded-md text-xs mb-4">
              <Trans i18nKey="studentsAdmin.linkAccountHint" components={{ strong: <strong /> }} />
            </div>
            {/* Parent Selection */}
            <div className="space-y-2">
              <Label>{t("studentsAdmin.utilisateurParent")}</Label>
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
                        : t("studentsAdmin.selectionnerUnUtilisateur")
                      : t("studentsAdmin.selectionnerUnUtilisateur")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-full p-0">
                  <Command>
                    <CommandInput placeholder={t("studentsAdmin.chercherUnCompte")} />
                    <CommandEmpty>{t("studentsAdmin.aucunCompteParentTrouve")}</CommandEmpty>
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
              <Label>{t("studentsAdmin.relation")}</Label>
              <Select value={relationship} onValueChange={setRelationship}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="parent">{t("studentsAdmin.parent")}</SelectItem>
                  <SelectItem value="guardian">{t("studentsAdmin.tuteur")}</SelectItem>
                  <SelectItem value="foster_parent">{t("studentsAdmin.parentDAccueil")}</SelectItem>
                  <SelectItem value="grandparent">{t("studentsAdmin.grandParent")}</SelectItem>
                  <SelectItem value="other">{t("studentsAdmin.autre")}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button
              onClick={() => linkUserParentMutation.mutate()}
              disabled={!selectedParentId || linkUserParentMutation.isPending}
              className="w-full"
            >
              {linkUserParentMutation.isPending ? "Liaison..." : t("studentsAdmin.lierLeCompte")}
            </Button>
          </TabsContent>

          <TabsContent value="data" className="space-y-4">
            <div className="bg-amber-50 text-amber-800 p-3 rounded-md text-xs mb-4">
              <Trans i18nKey="studentsAdmin.contactRecordHint" components={{ strong: <strong /> }} />
            </div>

            {!showNewParentForm ? (
              <div className="space-y-3">
                <Label>{t("studentsAdmin.rechercherUneFicheExistante")}</Label>
                <div className="flex gap-2">
                  <Input
                    placeholder={t("studentsAdmin.nomTel")}
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
                        <Button size="sm" variant="secondary" className="opacity-0 group-hover:opacity-100">{t("studentsAdmin.choisir")}</Button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="relative py-2">
                  <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
                  <div className="relative flex justify-center text-xs uppercase"><span className="bg-background px-2 text-muted-foreground">{t("studentsAdmin.ou")}</span></div>
                </div>

                <Button type="button" variant="outline" className="w-full" onClick={() => setShowNewParentForm(true)}>
                  <UserPlus className="w-4 h-4 mr-2" /> {t("studentsAdmin.createNewRecord")}
                </Button>
              </div>
            ) : (
              <div className="space-y-3 bg-muted/20 p-4 rounded-lg border">
                <h4 className="font-semibold text-sm flex justify-between items-center">
                  {t("studentsAdmin.nouveauParent")}
                  <Button variant="ghost" size="sm" onClick={() => setShowNewParentForm(false)} className="h-6 w-6 p-0 rounded-full">X</Button>
                </h4>
                <div className="grid grid-cols-2 gap-2">
                  <Input placeholder={t("studentsAdmin.nom")} value={newParent.last_name} onChange={e => setNewParent({ ...newParent, last_name: e.target.value })} />
                  <Input placeholder={t("studentsAdmin.prenom")} value={newParent.first_name} onChange={e => setNewParent({ ...newParent, first_name: e.target.value })} />
                </div>
                <Input placeholder={t("studentsAdmin.telephone")} value={newParent.phone} onChange={e => setNewParent({ ...newParent, phone: e.target.value })} />
                <Input placeholder={t("studentsAdmin.email")} value={newParent.email} onChange={e => setNewParent({ ...newParent, email: e.target.value })} />

                <div className="space-y-2 pt-2">
                  <Label>{t("studentsAdmin.relation")}</Label>
                  <Select value={relationship} onValueChange={setRelationship}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="parent">{t("studentsAdmin.parent")}</SelectItem>
                      <SelectItem value="guardian">{t("studentsAdmin.tuteur")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <Button className="w-full mt-2" onClick={createNewParent}>{t("studentsAdmin.enregistrerLier")}</Button>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
