import React from 'react';
import { ChevronRight, ChevronDown, Users, Folder, Calendar, Tag } from 'lucide-react';
import type { GroupNode } from '../types';
import { cn } from '@/lib/utils';
import { createLogger, type LogLevel } from '@/logger/simple-logger';

// File-level log control - explicit override
const LOG_LEVEL: LogLevel | undefined = 'debug';  // OVERRIDE: Force debug for group headers
const log = createLogger('GroupHeaderRow', LOG_LEVEL);

interface GroupHeaderRowProps {
  groupNode: GroupNode;
  isCollapsed: boolean;
  depth: number;
  width: number;
  onToggle: () => void;
  className?: string;
}

// Icon mapping for common relationship types
const RELATIONSHIP_ICONS: Record<string, React.ComponentType<any>> = {
  project: Folder,
  assignee: Users,
  user: Users,
  status: Tag,
  tag: Tag,
  date: Calendar,
};

export function GroupHeaderRow({
  groupNode,
  isCollapsed,
  depth,
  width,
  onToggle,
  className
}: GroupHeaderRowProps) {
  // Get icon based on field name
  const IconComponent = RELATIONSHIP_ICONS[groupNode.field] || Folder;
  
  // Calculate indentation
  const indentPx = depth * 24;
  
  // Example logging usage
  log.debug('Rendering group header', { 
    field: groupNode.field, 
    value: groupNode.displayValue,
    rowCount: groupNode.rowCount,
    isCollapsed 
  });
  
  return (
    <div 
      className={cn(
        "group flex items-center h-10 px-4 bg-muted/50 hover:bg-muted/70 transition-colors cursor-pointer border-b",
        className
      )}
      style={{ width }}
      onClick={onToggle}
    >
      {/* Indentation */}
      <div style={{ width: indentPx }} />
      
      {/* Expand/Collapse Icon */}
      <button
        className="mr-2 p-1 hover:bg-background/50 rounded transition-colors"
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
      >
        {isCollapsed ? (
          <ChevronRight className="h-4 w-4" />
        ) : (
          <ChevronDown className="h-4 w-4" />
        )}
      </button>
      
      {/* Group Icon */}
      <IconComponent className="h-4 w-4 mr-2 text-muted-foreground" />
      
      {/* Group Name */}
      <span className="font-medium text-sm flex-1">
        {groupNode.displayValue || 'Unnamed Group'}
      </span>
      
      {/* Item Count Badge */}
      <span className="text-xs text-muted-foreground bg-background px-2 py-0.5 rounded-full">
        {groupNode.rowCount} {groupNode.rowCount === 1 ? 'item' : 'items'}
      </span>
      
      {/* Summary Data (if configured) */}
      {groupNode.summary && Object.keys(groupNode.summary).length > 0 && (
        <div className="ml-4 flex items-center gap-4">
          {Object.entries(groupNode.summary).map(([key, value]) => (
            <div key={key} className="text-xs text-muted-foreground">
              <span className="font-medium">{key}:</span> {value}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Canvas-based group header for performance
export function renderGroupHeaderCanvas(
  ctx: CanvasRenderingContext2D,
  groupNode: GroupNode,
  isCollapsed: boolean,
  depth: number,
  x: number,
  y: number,
  width: number,
  height: number,
  theme: 'light' | 'dark'
) {
  // Background
  ctx.fillStyle = theme === 'dark' ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.03)';
  ctx.fillRect(x, y, width, height);
  
  // Border
  ctx.strokeStyle = theme === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';
  ctx.beginPath();
  ctx.moveTo(x, y + height);
  ctx.lineTo(x + width, y + height);
  ctx.stroke();
  
  // Indentation
  const indentPx = depth * 24;
  
  // Chevron
  ctx.save();
  ctx.translate(x + indentPx + 12, y + height / 2);
  ctx.strokeStyle = theme === 'dark' ? '#888' : '#666';
  ctx.lineWidth = 2;
  ctx.beginPath();
  
  if (isCollapsed) {
    // Right chevron
    ctx.moveTo(-4, -6);
    ctx.lineTo(2, 0);
    ctx.lineTo(-4, 6);
  } else {
    // Down chevron
    ctx.moveTo(-6, -2);
    ctx.lineTo(0, 4);
    ctx.lineTo(6, -2);
  }
  ctx.stroke();
  ctx.restore();
  
  // Group name
  ctx.fillStyle = theme === 'dark' ? '#e5e5e5' : '#1a1a1a';
  ctx.font = '500 14px Inter, system-ui, sans-serif';
  ctx.textBaseline = 'middle';
  ctx.fillText(
    groupNode.displayValue || 'Unnamed Group',
    x + indentPx + 36,
    y + height / 2
  );
  
  // Item count
  const countText = `${groupNode.rowCount} ${groupNode.rowCount === 1 ? 'item' : 'items'}`;
  ctx.font = '400 12px Inter, system-ui, sans-serif';
  ctx.fillStyle = theme === 'dark' ? '#888' : '#666';
  const textWidth = ctx.measureText(countText).width;
  
  // Count background
  ctx.fillStyle = theme === 'dark' ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)';
  ctx.roundRect(x + width - textWidth - 24, y + (height - 20) / 2, textWidth + 16, 20, 10);
  ctx.fill();
  
  // Count text
  ctx.fillStyle = theme === 'dark' ? '#888' : '#666';
  ctx.fillText(countText, x + width - textWidth - 16, y + height / 2);
}