/**
 * HomeworkCard - Display a homework item in card format
 */

import { format } from "date-fns";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { Homework } from "../types/homework";

interface HomeworkCardProps {
  homework: Homework;
  onEdit?: (homework: Homework) => void;
  onDelete?: (homeworkId: string) => void;
  onView?: (homeworkId: string) => void;
  showActions?: boolean;
}

export function HomeworkCard({
  homework,
  onEdit,
  onDelete,
  onView,
  showActions = true,
}: HomeworkCardProps) {
  const statusColors: Record<string, string> = {
    DRAFT: "bg-gray-100 text-gray-800",
    PUBLISHED: "bg-blue-100 text-blue-800",
    COMPLETED: "bg-green-100 text-green-800",
    ARCHIVED: "bg-gray-200 text-gray-600",
  };

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex justify-between items-start gap-4">
          <div className="flex-1">
            <CardTitle className="line-clamp-2">{homework.title}</CardTitle>
            <CardDescription>{homework.description}</CardDescription>
          </div>
          <Badge className={statusColors[homework.status]}>
            {homework.status}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2 text-sm">
          {homework.due_date && (
            <div>
              <span className="font-medium">Due: </span>
              <span>
                {format(new Date(homework.due_date), "MMM dd, yyyy")}
              </span>
            </div>
          )}
          {homework.class_id && (
            <div>
              <span className="font-medium">Class: </span>
              <span>{homework.class_id}</span>
            </div>
          )}
        </div>

        {showActions && (
          <div className="flex gap-2 mt-4">
            {onView && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => onView(homework.id)}
              >
                View
              </Button>
            )}
            {onEdit && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => onEdit(homework)}
              >
                Edit
              </Button>
            )}
            {onDelete && (
              <Button
                size="sm"
                variant="destructive"
                onClick={() => onDelete(homework.id)}
              >
                Delete
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
