/**
 * StudentCard Component
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Trash2, Edit2, Mail, Phone } from "lucide-react";
import type { Student } from "../types/students";

interface StudentCardProps {
  student: Student;
  onEdit?: (student: Student) => void;
  onDelete?: (id: string) => void;
}

export function StudentCard({ student, onEdit, onDelete }: StudentCardProps) {
  const getStatusColor = (status: Student["status"]) => {
    switch (status) {
      case "ACTIVE":
        return "bg-green-100 text-green-800";
      case "INACTIVE":
        return "bg-gray-100 text-gray-800";
      case "TRANSFERRED":
        return "bg-blue-100 text-blue-800";
      case "GRADUATED":
        return "bg-purple-100 text-purple-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  return (
    <Card className="hover:shadow-lg transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <CardTitle className="text-base">
              {student.first_name} {student.last_name}
            </CardTitle>
            <p className="text-sm text-gray-500 mt-1">Niveau: {student.level_id}</p>
          </div>
          <Badge className={getStatusColor(student.status)} variant="secondary">
            {student.status}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-2">
          {student.email && (
            <div className="flex items-center gap-2 text-sm">
              <Mail className="h-4 w-4 text-gray-400" />
              <a href={`mailto:${student.email}`} className="text-blue-600 hover:underline">
                {student.email}
              </a>
            </div>
          )}
          {student.phone && (
            <div className="flex items-center gap-2 text-sm">
              <Phone className="h-4 w-4 text-gray-400" />
              <a href={`tel:${student.phone}`} className="text-blue-600 hover:underline">
                {student.phone}
              </a>
            </div>
          )}
        </div>

        {student.date_of_birth && (
          <div className="text-sm">
            <p className="text-gray-600">Né(e)</p>
            <p className="font-medium">{new Date(student.date_of_birth).toLocaleDateString("fr-FR")}</p>
          </div>
        )}

        <div className="text-sm">
          <p className="text-gray-600">Inscription</p>
          <p className="font-medium">{new Date(student.enrollment_date).toLocaleDateString("fr-FR")}</p>
        </div>

        <div className="flex gap-2 pt-2 border-t">
          {onEdit && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onEdit(student)}
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
              onClick={() => onDelete(student.id)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
