import { useState, useEffect, useCallback } from "react";
import { apiClient } from "@/api/client";
import { toast } from "sonner";
import {
  Plus,
  Search,
  FileText,
  MoreHorizontal,
  Pencil,
  Eye,
  Copy,
  Trash2,
  ChevronUp,
  ChevronDown,
  Loader2,
  Globe,
  FilePlus,
  Palette,
  LayoutGrid,
} from "lucide-react";

// shadcn/ui components
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

// ─── Types ───────────────────────────────────────────────────────────────────

interface PublicPage {
  id: string;
  title: string;
  slug: string;
  page_type: string;
  template: string;
  content: Record<string, unknown>;
  is_published: boolean;
  show_in_nav: boolean;
  nav_label: string | null;
  meta_title: string | null;
  meta_description: string | null;
  primary_color: string | null;
  secondary_color: string | null;
  sort_order: number;
  tenant_id: string;
  created_at: string;
  updated_at: string;
}

interface PageFormData {
  title: string;
  slug: string;
  page_type: string;
  template: string;
  content: string;
  is_published: boolean;
  show_in_nav: boolean;
  nav_label: string;
  meta_title: string;
  meta_description: string;
  primary_color: string;
  secondary_color: string;
  sort_order: number;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const PAGE_TYPES: Record<string, string> = {
  HOME: "Accueil",
  ABOUT: "À propos",
  ADMISSION: "Admissions",
  PROGRAMS: "Programmes",
  RESEARCH: "Recherche",
  CAMPUS: "Campus",
  CONTACT: "Contact",
  CUSTOM: "Personnalisé",
};

const TEMPLATES: Record<string, string> = {
  default: "Défaut",
  modern: "Moderne",
  classic: "Classique",
  minimal: "Minimal",
};

const PAGE_TYPE_COLORS: Record<string, string> = {
  HOME: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  ABOUT: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  ADMISSION: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  PROGRAMS: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  RESEARCH: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200",
  CAMPUS: "bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200",
  CONTACT: "bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200",
  CUSTOM: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200",
};

const EMPTY_FORM: PageFormData = {
  title: "",
  slug: "",
  page_type: "CUSTOM",
  template: "default",
  content: "{}",
  is_published: false,
  show_in_nav: false,
  nav_label: "",
  meta_title: "",
  meta_description: "",
  primary_color: "#3b82f6",
  secondary_color: "#1e293b",
  sort_order: 0,
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
}

function isValidJson(str: string): boolean {
  try {
    JSON.parse(str);
    return true;
  } catch {
    return false;
  }
}

function formatJson(str: string): string {
  try {
    return JSON.stringify(JSON.parse(str), null, 2);
  } catch {
    return str;
  }
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function PublicPagesManager() {
  // Data state
  const [pages, setPages] = useState<PublicPage[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");

  // Dialog state
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingPage, setEditingPage] = useState<PublicPage | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Delete state
  const [deleteTarget, setDeleteTarget] = useState<PublicPage | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Form state
  const [form, setForm] = useState<PageFormData>(EMPTY_FORM);
  const [contentError, setContentError] = useState<string | null>(null);

  // ─── Fetch pages ───────────────────────────────────────────────────────

  const fetchPages = useCallback(async () => {
    setIsLoading(true);
    try {
      const params: Record<string, string> = {};
      if (filterType !== "all") params.page_type = filterType;
      if (filterStatus === "published") params.is_published = "true";
      if (filterStatus === "draft") params.is_published = "false";

      const response = await apiClient.get<PublicPage[]>("/public-pages/", {
        params,
      });
      setPages(response.data);
    } catch {
      toast.error("Erreur lors du chargement des pages");
    } finally {
      setIsLoading(false);
    }
  }, [filterType, filterStatus]);

  useEffect(() => {
    fetchPages();
  }, [fetchPages]);

  // ─── Stats ─────────────────────────────────────────────────────────────

  const stats = {
    total: pages.length,
    published: pages.filter((p) => p.is_published).length,
    draft: pages.filter((p) => !p.is_published).length,
  };

  // ─── Filtered pages ────────────────────────────────────────────────────

  const filteredPages = pages
    .filter(
      (p) =>
        p.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.slug.toLowerCase().includes(searchQuery.toLowerCase())
    )
    .sort((a, b) => a.sort_order - b.sort_order);

  // ─── Form helpers ──────────────────────────────────────────────────────

  const updateField = <K extends keyof PageFormData>(
    key: K,
    value: PageFormData[K]
  ) => {
    setForm((prev) => {
      const updated = { ...prev, [key]: value };
      // Auto-generate slug from title
      if (key === "title") {
        updated.slug = slugify(value as string);
        // Auto-fill nav_label from title
        if (!prev.nav_label || prev.nav_label === prev.title) {
          updated.nav_label = value as string;
        }
      }
      // Validate content JSON
      if (key === "content") {
        if (value && !isValidJson(value as string)) {
          setContentError("JSON invalide");
        } else {
          setContentError(null);
        }
      }
      return updated;
    });
  };

  const openCreateDialog = () => {
    setEditingPage(null);
    setForm(EMPTY_FORM);
    setContentError(null);
    setIsFormOpen(true);
  };

  const openEditDialog = (page: PublicPage) => {
    setEditingPage(page);
    setForm({
      title: page.title,
      slug: page.slug,
      page_type: page.page_type,
      template: page.template,
      content: JSON.stringify(page.content, null, 2),
      is_published: page.is_published,
      show_in_nav: page.show_in_nav,
      nav_label: page.nav_label || "",
      meta_title: page.meta_title || "",
      meta_description: page.meta_description || "",
      primary_color: page.primary_color || "#3b82f6",
      secondary_color: page.secondary_color || "#1e293b",
      sort_order: page.sort_order,
    });
    setContentError(null);
    setIsFormOpen(true);
  };

  const closeForm = () => {
    setIsFormOpen(false);
    setEditingPage(null);
    setContentError(null);
  };

  // ─── CRUD operations ───────────────────────────────────────────────────

  const handleSave = async () => {
    if (!form.title.trim()) {
      toast.error("Le titre est requis");
      return;
    }
    if (contentError) {
      toast.error("Veuillez corriger le contenu JSON");
      return;
    }

    setIsSaving(true);
    try {
      const payload = {
        title: form.title,
        slug: form.slug || slugify(form.title),
        page_type: form.page_type,
        template: form.template,
        content: JSON.parse(form.content || "{}"),
        is_published: form.is_published,
        show_in_nav: form.show_in_nav,
        nav_label: form.nav_label || null,
        meta_title: form.meta_title || null,
        meta_description: form.meta_description || null,
        primary_color: form.primary_color || null,
        secondary_color: form.secondary_color || null,
        sort_order: form.sort_order,
      };

      if (editingPage) {
        await apiClient.put(`/public-pages/${editingPage.id}/`, payload);
        toast.success("Page mise à jour avec succès");
      } else {
        await apiClient.post("/public-pages/", payload);
        toast.success("Page créée avec succès");
      }

      closeForm();
      fetchPages();
    } catch {
      toast.error(
        editingPage
          ? "Erreur lors de la mise à jour de la page"
          : "Erreur lors de la création de la page"
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await apiClient.delete(`/public-pages/${deleteTarget.id}/`);
      toast.success("Page supprimée avec succès");
      setDeleteTarget(null);
      fetchPages();
    } catch {
      toast.error("Erreur lors de la suppression de la page");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDuplicate = async (page: PublicPage) => {
    try {
      const payload = {
        title: `${page.title} (copie)`,
        slug: `${page.slug}-copie`,
        page_type: page.page_type,
        template: page.template,
        content: page.content,
        is_published: false,
        show_in_nav: false,
        nav_label: null,
        meta_title: page.meta_title,
        meta_description: page.meta_description,
        primary_color: page.primary_color,
        secondary_color: page.secondary_color,
        sort_order: page.sort_order + 1,
      };
      await apiClient.post("/public-pages/", payload);
      toast.success("Page dupliquée avec succès");
      fetchPages();
    } catch {
      toast.error("Erreur lors de la duplication de la page");
    }
  };

  const handlePreview = (page: PublicPage) => {
    window.open(`/p/${page.slug}`, "_blank");
  };

  const handleMoveUp = async (page: PublicPage) => {
    const sorted = [...pages].sort((a, b) => a.sort_order - b.sort_order);
    const idx = sorted.findIndex((p) => p.id === page.id);
    if (idx <= 0) return;
    const prevPage = sorted[idx - 1];
    try {
      await apiClient.post("/public-pages/reorder/", {
        items: [
          { page_id: page.id, sort_order: prevPage.sort_order },
          { page_id: prevPage.id, sort_order: page.sort_order },
        ],
      });
      fetchPages();
    } catch {
      toast.error("Erreur lors du réordonnancement");
    }
  };

  const handleMoveDown = async (page: PublicPage) => {
    const sorted = [...pages].sort((a, b) => a.sort_order - b.sort_order);
    const idx = sorted.findIndex((p) => p.id === page.id);
    if (idx < 0 || idx >= sorted.length - 1) return;
    const nextPage = sorted[idx + 1];
    try {
      await apiClient.post("/public-pages/reorder/", {
        items: [
          { page_id: page.id, sort_order: nextPage.sort_order },
          { page_id: nextPage.id, sort_order: page.sort_order },
        ],
      });
      fetchPages();
    } catch {
      toast.error("Erreur lors du réordonnancement");
    }
  };

  // ─── Render ────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Globe className="h-6 w-6 text-primary" />
            Pages publiques
          </h1>
          <p className="text-muted-foreground mt-1">
            Gérez les pages publiques de votre établissement
          </p>
        </div>
        <Button onClick={openCreateDialog} className="gap-2">
          <Plus className="h-4 w-4" />
          Nouvelle page
        </Button>
      </div>

      {/* ── Stats & Filters ─────────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        {/* Stats badges */}
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" className="gap-1.5 px-3 py-1.5 text-sm">
            <FileText className="h-3.5 w-3.5" />
            {stats.total} page{stats.total !== 1 ? "s" : ""}
          </Badge>
          <Badge className="gap-1.5 px-3 py-1.5 text-sm bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 border-green-200 dark:border-green-800">
            <Globe className="h-3.5 w-3.5" />
            {stats.published} publiée{stats.published !== 1 ? "s" : ""}
          </Badge>
          <Badge variant="secondary" className="gap-1.5 px-3 py-1.5 text-sm">
            <FilePlus className="h-3.5 w-3.5" />
            {stats.draft} brouillon{stats.draft !== 1 ? "s" : ""}
          </Badge>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Rechercher..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 w-[200px]"
            />
          </div>
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="w-[170px]">
              <SelectValue placeholder="Type de page" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les types</SelectItem>
              {Object.entries(PAGE_TYPES).map(([key, label]) => (
                <SelectItem key={key} value={key}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Statut" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous</SelectItem>
              <SelectItem value="published">Publiées</SelectItem>
              <SelectItem value="draft">Brouillons</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* ── Table ───────────────────────────────────────────────────────── */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : filteredPages.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="rounded-full bg-muted p-4 mb-4">
            <FileText className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold">Aucune page trouvée</h3>
          <p className="text-muted-foreground mt-1 max-w-md">
            {searchQuery || filterType !== "all" || filterStatus !== "all"
              ? "Aucune page ne correspond à vos filtres. Essayez de modifier vos critères."
              : "Commencez par créer votre première page publique."}
          </p>
          {!searchQuery && filterType === "all" && filterStatus === "all" && (
            <Button onClick={openCreateDialog} className="mt-4 gap-2">
              <Plus className="h-4 w-4" />
              Créer une page
            </Button>
          )}
        </div>
      ) : (
        <div className="rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[250px]">Titre</TableHead>
                <TableHead className="w-[180px]">Slug</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Template</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead className="text-center">Ordre</TableHead>
                <TableHead className="text-center">Navigation</TableHead>
                <TableHead className="w-[60px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredPages.map((page, idx) => (
                <TableRow
                  key={page.id}
                  className="cursor-pointer"
                  onClick={() => openEditDialog(page)}
                >
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div>
                        <div className="font-medium">{page.title}</div>
                        {page.meta_title && (
                          <div className="text-xs text-muted-foreground truncate max-w-[220px]">
                            SEO: {page.meta_title}
                          </div>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <code className="text-xs bg-muted px-2 py-1 rounded font-mono">
                      {page.slug}
                    </code>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={PAGE_TYPE_COLORS[page.page_type] || ""}
                    >
                      {PAGE_TYPES[page.page_type] || page.page_type}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <LayoutGrid className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-sm">
                        {TEMPLATES[page.template] || page.template}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    {page.is_published ? (
                      <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 border-green-200 dark:border-green-800">
                        Publiée
                      </Badge>
                    ) : (
                      <Badge variant="secondary">Brouillon</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        disabled={idx === 0}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleMoveUp(page);
                        }}
                      >
                        <ChevronUp className="h-4 w-4" />
                      </Button>
                      <span className="text-sm text-muted-foreground w-6 text-center">
                        {page.sort_order}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        disabled={idx === filteredPages.length - 1}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleMoveDown(page);
                        }}
                      >
                        <ChevronDown className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                  <TableCell className="text-center">
                    {page.show_in_nav ? (
                      <Badge
                        variant="outline"
                        className="bg-primary/10 text-primary border-primary/20"
                      >
                        <Globe className="h-3 w-3 mr-1" />
                        Oui
                      </Badge>
                    ) : (
                      <span className="text-sm text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <MoreHorizontal className="h-4 w-4" />
                          <span className="sr-only">Actions</span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            openEditDialog(page);
                          }}
                        >
                          <Pencil className="h-4 w-4 mr-2" />
                          Modifier
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            handlePreview(page);
                          }}
                        >
                          <Eye className="h-4 w-4 mr-2" />
                          Prévisualiser
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDuplicate(page);
                          }}
                        >
                          <Copy className="h-4 w-4 mr-2" />
                          Dupliquer
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteTarget(page);
                          }}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Supprimer
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* ── Create / Edit Sheet ──────────────────────────────────────────── */}
      <Sheet open={isFormOpen} onOpenChange={(open) => !open && closeForm()}>
        <SheetContent
          side="right"
          className="sm:max-w-2xl w-full overflow-y-auto p-0"
        >
          <SheetHeader className="p-6 pb-0">
            <SheetTitle>
              {editingPage ? "Modifier la page" : "Nouvelle page"}
            </SheetTitle>
            <SheetDescription>
              {editingPage
                ? "Modifiez les informations de la page publique."
                : "Remplissez les informations pour créer une nouvelle page publique."}
            </SheetDescription>
          </SheetHeader>

          <Tabs defaultValue="general" className="px-6">
            <TabsList className="w-full grid grid-cols-3 mt-4">
              <TabsTrigger value="general">Général</TabsTrigger>
              <TabsTrigger value="design">Design & Apparence</TabsTrigger>
              <TabsTrigger value="seo">SEO & Contenu</TabsTrigger>
            </TabsList>

            {/* ── Tab: General ─────────────────────────────────────────── */}
            <TabsContent value="general" className="space-y-4 mt-4 pb-24">
              <div className="space-y-2">
                <Label htmlFor="page-title">Titre *</Label>
                <Input
                  id="page-title"
                  placeholder="Titre de la page"
                  value={form.title}
                  onChange={(e) => updateField("title", e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="page-slug">Slug</Label>
                <Input
                  id="page-slug"
                  placeholder="auto-genere-du-titre"
                  value={form.slug}
                  onChange={(e) => updateField("slug", e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Généré automatiquement à partir du titre. Utilisé dans l'URL.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="page-type">Type de page</Label>
                  <Select
                    value={form.page_type}
                    onValueChange={(v) => updateField("page_type", v)}
                  >
                    <SelectTrigger id="page-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(PAGE_TYPES).map(([key, label]) => (
                        <SelectItem key={key} value={key}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="page-template">Template</Label>
                  <Select
                    value={form.template}
                    onValueChange={(v) => updateField("template", v)}
                  >
                    <SelectTrigger id="page-template">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(TEMPLATES).map(([key, label]) => (
                        <SelectItem key={key} value={key}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="page-sort-order">Ordre d'affichage</Label>
                <Input
                  id="page-sort-order"
                  type="number"
                  min={0}
                  value={form.sort_order}
                  onChange={(e) =>
                    updateField("sort_order", parseInt(e.target.value) || 0)
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Ordre de tri (0 = premier). Vous pouvez aussi réordonner via
                  les flèches dans le tableau.
                </p>
              </div>

              {/* Toggles */}
              <div className="space-y-4 pt-2">
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div className="space-y-0.5">
                    <Label htmlFor="page-published" className="cursor-pointer">
                      Publiée
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      La page sera visible publiquement
                    </p>
                  </div>
                  <Switch
                    id="page-published"
                    checked={form.is_published}
                    onCheckedChange={(v) => updateField("is_published", v)}
                  />
                </div>

                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div className="space-y-0.5">
                    <Label htmlFor="page-show-nav" className="cursor-pointer">
                      Afficher dans la navigation
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Ajouter un lien vers cette page dans le menu de
                      navigation
                    </p>
                  </div>
                  <Switch
                    id="page-show-nav"
                    checked={form.show_in_nav}
                    onCheckedChange={(v) => updateField("show_in_nav", v)}
                  />
                </div>

                {form.show_in_nav && (
                  <div className="space-y-2">
                    <Label htmlFor="page-nav-label">Label de navigation</Label>
                    <Input
                      id="page-nav-label"
                      placeholder="Texte affiché dans le menu"
                      value={form.nav_label}
                      onChange={(e) => updateField("nav_label", e.target.value)}
                    />
                  </div>
                )}
              </div>
            </TabsContent>

            {/* ── Tab: Design ──────────────────────────────────────────── */}
            <TabsContent value="design" className="space-y-4 mt-4 pb-24">
              <div className="space-y-2">
                <Label htmlFor="page-primary-color">
                  Couleur principale
                </Label>
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <input
                      type="color"
                      id="page-primary-color-picker"
                      value={form.primary_color}
                      onChange={(e) =>
                        updateField("primary_color", e.target.value)
                      }
                      className="absolute inset-0 opacity-0 cursor-pointer h-10 w-10"
                    />
                    <div
                      className="h-10 w-10 rounded-lg border-2 border-border shadow-sm cursor-pointer"
                      style={{ backgroundColor: form.primary_color }}
                    />
                  </div>
                  <Input
                    id="page-primary-color"
                    placeholder="#3b82f6"
                    value={form.primary_color}
                    onChange={(e) => updateField("primary_color", e.target.value)}
                    className="flex-1 font-mono"
                    maxLength={7}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Utilisée pour les titres, boutons et éléments principaux
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="page-secondary-color">
                  Couleur secondaire
                </Label>
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <input
                      type="color"
                      id="page-secondary-color-picker"
                      value={form.secondary_color}
                      onChange={(e) =>
                        updateField("secondary_color", e.target.value)
                      }
                      className="absolute inset-0 opacity-0 cursor-pointer h-10 w-10"
                    />
                    <div
                      className="h-10 w-10 rounded-lg border-2 border-border shadow-sm cursor-pointer"
                      style={{ backgroundColor: form.secondary_color }}
                    />
                  </div>
                  <Input
                    id="page-secondary-color"
                    placeholder="#1e293b"
                    value={form.secondary_color}
                    onChange={(e) =>
                      updateField("secondary_color", e.target.value)
                    }
                    className="flex-1 font-mono"
                    maxLength={7}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Utilisée pour les arrière-plans et éléments secondaires
                </p>
              </div>

              {/* Color preview */}
              <div className="rounded-lg border p-4 space-y-2">
                <Label className="text-sm font-medium">Aperçu des couleurs</Label>
                <div className="flex gap-3">
                  <div className="flex-1 space-y-1">
                    <div
                      className="h-16 rounded-lg flex items-center justify-center text-white text-sm font-medium"
                      style={{ backgroundColor: form.primary_color }}
                    >
                      Principale
                    </div>
                    <p className="text-xs text-center text-muted-foreground">
                      {form.primary_color}
                    </p>
                  </div>
                  <div className="flex-1 space-y-1">
                    <div
                      className="h-16 rounded-lg flex items-center justify-center text-white text-sm font-medium"
                      style={{ backgroundColor: form.secondary_color }}
                    >
                      Secondaire
                    </div>
                    <p className="text-xs text-center text-muted-foreground">
                      {form.secondary_color}
                    </p>
                  </div>
                </div>
              </div>

              {/* Template preview */}
              <div className="rounded-lg border p-4 space-y-2">
                <Label className="text-sm font-medium">Template sélectionné</Label>
                <div className="text-center py-6 rounded-lg bg-muted/50 border-2 border-dashed">
                  <Palette className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                  <p className="text-sm font-medium">
                    {TEMPLATES[form.template] || form.template}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Modèle de mise en page appliqué à la page
                  </p>
                </div>
              </div>
            </TabsContent>

            {/* ── Tab: SEO & Content ───────────────────────────────────── */}
            <TabsContent value="seo" className="space-y-4 mt-4 pb-24">
              <div className="space-y-2">
                <Label htmlFor="page-meta-title">Meta titre (SEO)</Label>
                <Input
                  id="page-meta-title"
                  placeholder="Titre affiché dans les résultats de recherche"
                  value={form.meta_title}
                  onChange={(e) => updateField("meta_title", e.target.value)}
                  maxLength={70}
                />
                <p className="text-xs text-muted-foreground">
                  {form.meta_title.length}/70 caractères recommandés
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="page-meta-description">
                  Meta description (SEO)
                </Label>
                <Textarea
                  id="page-meta-description"
                  placeholder="Description affichée dans les résultats de recherche"
                  value={form.meta_description}
                  onChange={(e) =>
                    updateField("meta_description", e.target.value)
                  }
                  rows={3}
                  maxLength={160}
                />
                <p className="text-xs text-muted-foreground">
                  {form.meta_description.length}/160 caractères recommandés
                </p>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="page-content">Contenu (JSON)</Label>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs gap-1"
                    onClick={() => {
                      const formatted = formatJson(form.content);
                      updateField("content", formatted);
                    }}
                  >
                    Formater
                  </Button>
                </div>
                <Textarea
                  id="page-content"
                  placeholder='{"hero": {"title": "Bienvenue"}, "sections": []}'
                  value={form.content}
                  onChange={(e) => updateField("content", e.target.value)}
                  rows={12}
                  className={`font-mono text-xs ${contentError ? "border-destructive" : ""}`}
                />
                {contentError && (
                  <p className="text-xs text-destructive">{contentError}</p>
                )}
                <p className="text-xs text-muted-foreground">
                  Structure JSON décrivant le contenu de la page (sections,
                  composants, etc.)
                </p>
              </div>

              {/* Content structure preview */}
              {form.content && isValidJson(form.content) && (
                <div className="rounded-lg border p-4 space-y-2">
                  <Label className="text-sm font-medium">
                    Structure du contenu
                  </Label>
                  <div className="bg-muted/50 rounded-lg p-3 font-mono text-xs overflow-auto max-h-48">
                    <ContentStructurePreview
                      content={JSON.parse(form.content)}
                    />
                  </div>
                </div>
              )}
            </TabsContent>
          </Tabs>

          {/* ── Sheet Footer ──────────────────────────────────────────── */}
          <SheetFooter className="absolute bottom-0 left-0 right-0 p-4 bg-background border-t flex gap-2">
            <Button
              variant="outline"
              onClick={closeForm}
              disabled={isSaving}
              className="flex-1"
            >
              Annuler
            </Button>
            <Button
              onClick={handleSave}
              disabled={isSaving}
              className="flex-1 gap-2"
            >
              {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
              {editingPage ? "Enregistrer" : "Créer la page"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* ── Delete Confirmation Dialog ──────────────────────────────────── */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer la page</AlertDialogTitle>
            <AlertDialogDescription>
              Êtes-vous sûr de vouloir supprimer la page{" "}
              <span className="font-semibold text-foreground">
                "{deleteTarget?.title}"
              </span>{" "}
              ? Cette action est irréversible. Toutes les données associées à
              cette page seront définitivement supprimées.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>
              Annuler
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Suppression...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Supprimer
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Sub-component: Content Structure Preview ───────────────────────────────

function ContentStructurePreview({
  content,
}: {
  content: Record<string, unknown>;
}) {
  const renderValue = (value: unknown, depth = 0): React.ReactNode => {
    if (value === null || value === undefined) {
      return (
        <span className="text-muted-foreground italic">null</span>
      );
    }
    if (typeof value === "string") {
      return (
        <span className="text-green-600 dark:text-green-400">
          &quot;{value.length > 50 ? value.substring(0, 50) + "..." : value}
          &quot;
        </span>
      );
    }
    if (typeof value === "number" || typeof value === "boolean") {
      return (
        <span className="text-blue-600 dark:text-blue-400">
          {String(value)}
        </span>
      );
    }
    if (Array.isArray(value)) {
      if (value.length === 0) return <span className="text-muted-foreground">[]</span>;
      return (
        <div>
          <span className="text-yellow-600 dark:text-yellow-400">[</span>
          {value.map((item, idx) => (
            <div key={idx} className="pl-4 border-l border-muted">
              {renderValue(item, depth + 1)}
              {idx < value.length - 1 && (
                <span className="text-muted-foreground">,</span>
              )}
            </div>
          ))}
          <span className="text-yellow-600 dark:text-yellow-400">]</span>
        </div>
      );
    }
    if (typeof value === "object") {
      const entries = Object.entries(value as Record<string, unknown>);
      if (entries.length === 0)
        return <span className="text-muted-foreground">{"{}"}</span>;
      return (
        <div>
          <span className="text-yellow-600 dark:text-yellow-400">{"{"}</span>
          {entries.map(([key, val], idx) => (
            <div key={key} className="pl-4 border-l border-muted">
              <span className="text-purple-600 dark:text-purple-400">
                {key}
              </span>
              <span className="text-muted-foreground">: </span>
              {renderValue(val, depth + 1)}
              {idx < entries.length - 1 && (
                <span className="text-muted-foreground">,</span>
              )}
            </div>
          ))}
          <span className="text-yellow-600 dark:text-yellow-400">{"}"}</span>
        </div>
      );
    }
    return <span>{String(value)}</span>;
  };

  return <div className="space-y-0.5">{renderValue(content)}</div>;
}
