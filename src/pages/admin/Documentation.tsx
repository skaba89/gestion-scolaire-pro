import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Download, FileText } from "lucide-react";
import { useStudentLabel } from "@/hooks/useStudentLabel";
import { getDocumentationModules, getDocCategories } from "@/data/documentation";
import { DocModuleCard } from "@/components/documentation/DocModuleCard";
import { generateDocumentationPDF } from "@/utils/documentationUtils";

export default function Documentation() {
  const { studentLabel, studentsLabel, StudentLabel, StudentsLabel } = useStudentLabel();
  const [selectedCategory, setSelectedCategory] = useState<string>("admin");
  const [isGenerating, setIsGenerating] = useState(false);

  const modules = getDocumentationModules(studentLabel, studentsLabel, StudentLabel, StudentsLabel);
  const categories = getDocCategories(studentLabel);

  const filteredModules = modules.filter(m => m.category === selectedCategory);

  const handleGeneratePDF = async () => {
    setIsGenerating(true);
    await generateDocumentationPDF({
      modules,
      categories,
      studentLabel,
      studentsLabel,
      onComplete: () => setIsGenerating(false)
    });
  };

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <FileText className="h-8 w-8 text-primary" />
            Documentation
          </h1>
          <p className="text-muted-foreground mt-1">
            Manuel complet d'utilisation de la plateforme
          </p>
        </div>
        <Button onClick={handleGeneratePDF} disabled={isGenerating} size="lg">
          <Download className="h-5 w-5 mr-2" />
          {isGenerating ? "Génération..." : "Télécharger PDF"}
        </Button>
      </div>

      <Tabs value={selectedCategory} onValueChange={setSelectedCategory}>
        <TabsList className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 mb-6 h-auto">
          {categories.map(cat => (
            <TabsTrigger key={cat.id} value={cat.id} className="flex items-center gap-2 py-3">
              {cat.icon}
              <span className="hidden sm:inline">{cat.label}</span>
            </TabsTrigger>
          ))}
        </TabsList>

        {categories.map(cat => (
          <TabsContent key={cat.id} value={cat.id}>
            <ScrollArea className="h-[calc(100vh-280px)] pr-4">
              <div className="grid gap-6">
                {filteredModules.map(module => (
                  <DocModuleCard key={module.id} module={module} />
                ))}
              </div>
            </ScrollArea>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
