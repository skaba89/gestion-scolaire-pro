import React, { useState, useCallback, memo, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { 
  GripVertical, 
  X, 
  Plus, 
  RotateCcw,
  Lock,
  Unlock
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export interface WidgetConfig {
  id: string;
  type: string;
  title: string;
  icon?: React.ReactNode;
  component: React.ReactNode;
  minW?: number;
  minH?: number;
  maxW?: number;
  maxH?: number;
  defaultW?: number;
  defaultH?: number;
}

interface LayoutItem {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
  minW?: number;
  minH?: number;
  maxW?: number;
  maxH?: number;
}

interface DraggableWidgetGridProps {
  widgets: WidgetConfig[];
  availableWidgets: WidgetConfig[];
  onLayoutChange?: (layout: LayoutItem[]) => void;
  onAddWidget?: (widgetId: string) => void;
  onRemoveWidget?: (widgetId: string) => void;
  storageKey?: string;
  cols?: number;
}

const defaultLayout: LayoutItem[] = [
  { i: 'stats', x: 0, y: 0, w: 12, h: 2 },
  { i: 'chart1', x: 0, y: 2, w: 6, h: 4 },
  { i: 'chart2', x: 6, y: 2, w: 6, h: 4 },
  { i: 'activities', x: 0, y: 6, w: 4, h: 4 },
  { i: 'notifications', x: 4, y: 6, w: 4, h: 4 },
  { i: 'calendar', x: 8, y: 6, w: 4, h: 4 },
];

// Simple grid-based layout using CSS Grid
export const DraggableWidgetGrid: React.FC<DraggableWidgetGridProps> = memo(({
  widgets,
  availableWidgets,
  onLayoutChange,
  onAddWidget,
  onRemoveWidget,
  storageKey = 'dashboard-layout',
  cols = 12
}) => {
  const [layout, setLayout] = useState<LayoutItem[]>(() => {
    const saved = localStorage.getItem(storageKey);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return defaultLayout;
      }
    }
    return defaultLayout;
  });
  
  const [isEditMode, setIsEditMode] = useState(false);
  const [draggedItem, setDraggedItem] = useState<string | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  const handleRemoveWidget = useCallback((widgetId: string) => {
    const newLayout = layout.filter(item => item.i !== widgetId);
    setLayout(newLayout);
    localStorage.setItem(storageKey, JSON.stringify(newLayout));
    onRemoveWidget?.(widgetId);
  }, [layout, storageKey, onRemoveWidget]);

  const handleAddWidget = useCallback((widget: WidgetConfig) => {
    const maxY = Math.max(...layout.map(l => l.y + l.h), 0);
    const newItem: LayoutItem = {
      i: widget.id,
      x: 0,
      y: maxY,
      w: widget.defaultW || 4,
      h: widget.defaultH || 3,
      minW: widget.minW,
      minH: widget.minH,
      maxW: widget.maxW,
      maxH: widget.maxH
    };
    const newLayout = [...layout, newItem];
    setLayout(newLayout);
    localStorage.setItem(storageKey, JSON.stringify(newLayout));
    onAddWidget?.(widget.id);
  }, [layout, storageKey, onAddWidget]);

  const handleResetLayout = useCallback(() => {
    setLayout(defaultLayout);
    localStorage.setItem(storageKey, JSON.stringify(defaultLayout));
  }, [storageKey]);

  const handleDragStart = useCallback((e: React.DragEvent, widgetId: string) => {
    if (!isEditMode) return;
    setDraggedItem(widgetId);
    e.dataTransfer.effectAllowed = 'move';
  }, [isEditMode]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (!draggedItem || draggedItem === targetId) {
      setDraggedItem(null);
      return;
    }

    const newLayout = [...layout];
    const draggedIndex = newLayout.findIndex(l => l.i === draggedItem);
    const targetIndex = newLayout.findIndex(l => l.i === targetId);

    if (draggedIndex !== -1 && targetIndex !== -1) {
      // Swap positions
      const temp = { ...newLayout[draggedIndex] };
      newLayout[draggedIndex] = { ...newLayout[draggedIndex], x: newLayout[targetIndex].x, y: newLayout[targetIndex].y };
      newLayout[targetIndex] = { ...newLayout[targetIndex], x: temp.x, y: temp.y };
      
      setLayout(newLayout);
      localStorage.setItem(storageKey, JSON.stringify(newLayout));
      onLayoutChange?.(newLayout);
    }
    setDraggedItem(null);
  }, [draggedItem, layout, storageKey, onLayoutChange]);

  const activeWidgetIds = layout.map(l => l.i);
  const inactiveWidgets = availableWidgets.filter(w => !activeWidgetIds.includes(w.id));

  // Sort layout by position for rendering
  const sortedLayout = [...layout].sort((a, b) => {
    if (a.y !== b.y) return a.y - b.y;
    return a.x - b.x;
  });

  return (
    <div className="w-full">
      {/* Toolbar */}
      <motion.div 
        className="flex items-center justify-between mb-4 p-3 bg-card rounded-lg border shadow-sm"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="flex items-center gap-2">
          <Button
            variant={isEditMode ? "default" : "outline"}
            size="sm"
            onClick={() => setIsEditMode(!isEditMode)}
            className="gap-2"
          >
            {isEditMode ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
            {isEditMode ? 'Verrouiller' : 'Personnaliser'}
          </Button>
          
          {isEditMode && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex gap-2"
            >
              <Button
                variant="outline"
                size="sm"
                onClick={handleResetLayout}
                className="gap-2"
              >
                <RotateCcw className="h-4 w-4" />
                Réinitialiser
              </Button>
              
              {inactiveWidgets.length > 0 && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="gap-2">
                      <Plus className="h-4 w-4" />
                      Ajouter widget
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-56">
                    {inactiveWidgets.map(widget => (
                      <DropdownMenuItem
                        key={widget.id}
                        onClick={() => handleAddWidget(widget)}
                        className="gap-2"
                      >
                        {widget.icon}
                        {widget.title}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </motion.div>
          )}
        </div>
        
        {isEditMode && (
          <motion.p 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-sm text-muted-foreground"
          >
            Glissez les widgets pour réorganiser
          </motion.p>
        )}
      </motion.div>

      {/* Grid */}
      <div 
        ref={gridRef}
        className="grid grid-cols-12 gap-4 auto-rows-[80px]"
      >
        {sortedLayout.map((layoutItem) => {
          const widget = widgets.find(w => w.id === layoutItem.i);
          if (!widget) return null;
          
          return (
            <motion.div
              key={layoutItem.i}
              className={cn(
                "widget-container",
                draggedItem === layoutItem.i && "opacity-50"
              )}
              style={{
                gridColumn: `span ${Math.min(layoutItem.w, cols)}`,
                gridRow: `span ${layoutItem.h}`
              }}
              draggable={isEditMode}
              onDragStart={(e) => handleDragStart(e as any, layoutItem.i)}
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e as any, layoutItem.i)}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              layout
            >
              <Card className={cn(
                "h-full overflow-hidden transition-all duration-200",
                isEditMode && "ring-2 ring-primary/20 hover:ring-primary/40 cursor-move"
              )}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 px-4 pt-3">
                  <div className="flex items-center gap-2">
                    {isEditMode && (
                      <div className="widget-drag-handle cursor-grab active:cursor-grabbing p-1 -ml-1 hover:bg-muted rounded">
                        <GripVertical className="h-4 w-4 text-muted-foreground" />
                      </div>
                    )}
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      {widget.icon}
                      {widget.title}
                    </CardTitle>
                  </div>
                  
                  {isEditMode && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-muted-foreground hover:text-destructive"
                      onClick={() => handleRemoveWidget(layoutItem.i)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </CardHeader>
                <CardContent className="px-4 pb-4 h-[calc(100%-60px)] overflow-auto">
                  {widget.component}
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
});

DraggableWidgetGrid.displayName = 'DraggableWidgetGrid';
