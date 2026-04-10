/**
 * GradeCard Component
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Trash2, Edit2 } from "lucide-react";
import type { Grade } from "../types/grades";
import { useStudentLabel } from "@/hooks/useStudentLabel";

interface GradeCardProps {
  grade: Grade;
  onEdit?: (grade: Grade) => void;
  onDelete?: (id: string) => void;
  showStudent?: boolean;
}

export function GradeCard({
  grade,
  onEdit,
  onDelete,
  showStudent = false,
}: GradeCardProps) {
  const { StudentLabel } = useStudentLabel();
  const getGradeColor = (score: number) => {
    if (score >= 90) return "bg-green-100 text-green-800";
    if (score >= 80) return "bg-blue-100 text-blue-800";
    if (score >= 70) return "bg-yellow-100 text-yellow-800";
    if (score >= 60) return "bg-orange-100 text-orange-800";
    return "bg-red-100 text-red-800";
  };

  return (
    <Card className="hover:shadow-lg transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <CardTitle className="text-base">{grade.subject_id}</CardTitle>
            {showStudent && (
              <p className="text-sm text-gray-500 mt-1">{StudentLabel}: {grade.student_id}</p>
            )}
          </div>
          <Badge className={getGradeColor(grade.grade)} variant="secondary">
            {grade.grade}%
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div>
            <p className="text-gray-600">Échelle</p>
            <p className="font-medium">{grade.grading_scale}</p>
          </div>
          <div>
            <p className="text-gray-600">Année</p>
            <p className="font-medium">{grade.academic_year_id}</p>
          </div>
        </div>
        {grade.comment && (
          <div>
            <p className="text-sm text-gray-600">Remarque</p>
            <p className="text-sm mt-1 line-clamp-2">{grade.comment}</p>
          </div>
        )}
        <p className="text-xs text-gray-400">
          {new Date(grade.created_at).toLocaleDateString("fr-FR")}
        </p>
        <div className="flex gap-2 pt-2 border-t">
          {onEdit && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onEdit(grade)}
              className="flex-1"
            >
              <Edit2 className="h-4 w-4 mr-1" />
              Modifier
            </Button>
          )}
          {onDelete && (
            <Button
              variant="ghost"
              size="sm"
              className="text-red-600 hover:text-red-700 hover:bg-red-50"
              onClick={() => onDelete(grade.id)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
