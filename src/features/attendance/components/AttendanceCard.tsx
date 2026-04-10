/**
 * AttendanceCard Component
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Trash2, Edit2, Clock } from "lucide-react";
import type { AttendanceRecord } from "../types/attendance";
import { useStudentLabel } from "@/hooks/useStudentLabel";

interface AttendanceCardProps {
  record: AttendanceRecord;
  showStudent?: boolean;
  onEdit?: (record: AttendanceRecord) => void;
  onDelete?: (id: string) => void;
}

export function AttendanceCard({
  record,
  showStudent = false,
  onEdit,
  onDelete,
}: AttendanceCardProps) {
  const { StudentLabel } = useStudentLabel();
  const getStatusColor = (status: AttendanceRecord["status"]) => {
    switch (status) {
      case "PRESENT":
        return "bg-green-100 text-green-800";
      case "ABSENT":
        return "bg-red-100 text-red-800";
      case "LATE":
        return "bg-orange-100 text-orange-800";
      case "EXCUSED":
        return "bg-blue-100 text-blue-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const getStatusLabel = (status: AttendanceRecord["status"]) => {
    const labels: Record<AttendanceRecord["status"], string> = {
      PRESENT: "Présent(e)",
      ABSENT: "Absent(e)",
      LATE: "En retard",
      EXCUSED: "Excusé(e)",
    };
    return labels[status];
  };

  return (
    <Card className="hover:shadow-lg transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <CardTitle className="text-base">
              {new Date(record.date).toLocaleDateString("fr-FR", {
                weekday: "short",
                month: "short",
                day: "numeric",
              })}
            </CardTitle>
            {showStudent && (
              <p className="text-sm text-gray-500 mt-1">{StudentLabel}: {record.student_id}</p>
            )}
          </div>
          <Badge className={getStatusColor(record.status)} variant="secondary">
            {getStatusLabel(record.status)}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-gray-400" />
          <span className="text-sm text-gray-600">
            {new Date(record.created_at).toLocaleTimeString("fr-FR", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        </div>

        {record.reason && (
          <div>
            <p className="text-sm text-gray-600">Raison</p>
            <p className="text-sm mt-1 line-clamp-2">{record.reason}</p>
          </div>
        )}

        {record.marked_by && (
          <p className="text-xs text-gray-400">Marqué par: {record.marked_by}</p>
        )}

        <div className="flex gap-2 pt-2 border-t">
          {onEdit && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onEdit(record)}
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
              onClick={() => onDelete(record.id)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
