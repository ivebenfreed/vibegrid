import React from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { 
  Layers, 
  ChevronDown, 
  ChevronUp, 
  X, 
  Settings,
  Maximize2,
  Minimize2
} from 'lucide-react';
import type { Column } from '../types';
import { cn } from '@/lib/utils';

interface GroupingControlsProps {
  columns: Column[];
  groupBy: string[];
  onGroupByChange: (groupBy: string[]) => void;
  onExpandAll: () => void;
  onCollapseAll: () => void;
  onClearGrouping: () => void;
  className?: string;
}

export function GroupingControls({
  columns,
  groupBy,
  onGroupByChange,
  onExpandAll,
  onCollapseAll,
  onClearGrouping,
  className
}: GroupingControlsProps) {
  // Filter columns to only show single relationship columns
  const groupableColumns = columns.filter(col => 
    col.cellType === 'relationship-single' && 
    col.id !== '__selection'
  );
  
  const currentGroupColumn = groupBy[0] || '';
  const isGrouped = groupBy.length > 0;
  
  const handleGroupByChange = (columnId: string) => {
    if (columnId === 'none') {
      onGroupByChange([]);
    } else {
      onGroupByChange([columnId]);
    }
  };
  
  return (
    <div className={cn("flex items-center gap-2", className)}>
      {/* Group By Selector */}
      <div className="flex items-center gap-2">
        <Layers className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">Group by:</span>
        <Select
          value={currentGroupColumn || 'none'}
          onValueChange={handleGroupByChange}
        >
          <SelectTrigger className="w-[180px] h-8">
            <SelectValue placeholder="Select field to group by" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">
              <span className="text-muted-foreground">No grouping</span>
            </SelectItem>
            <SelectMenuSeparator />
            {groupableColumns.map(column => (
              <SelectItem key={column.id} value={column.id}>
                {column.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      
      {/* Group Actions */}
      {isGrouped && (
        <>
          <div className="h-4 w-px bg-border" />
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-2"
              >
                <Settings className="h-4 w-4 mr-1" />
                Actions
                <ChevronDown className="h-3 w-3 ml-1" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onExpandAll}>
                <Maximize2 className="h-4 w-4 mr-2" />
                Expand all groups
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onCollapseAll}>
                <Minimize2 className="h-4 w-4 mr-2" />
                Collapse all groups
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onClearGrouping}>
                <X className="h-4 w-4 mr-2" />
                Clear grouping
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      )}
    </div>
  );
}

// Compact version for toolbar integration
export function GroupingControlsCompact({
  columns,
  groupBy,
  onGroupByChange,
  className
}: Pick<GroupingControlsProps, 'columns' | 'groupBy' | 'onGroupByChange' | 'className'>) {
  const groupableColumns = columns.filter(col => 
    col.cellType === 'relationship-single' && 
    col.id !== '__selection'
  );
  
  const currentGroupColumn = groupBy[0] || '';
  
  return (
    <Select
      value={currentGroupColumn || 'none'}
      onValueChange={(value) => onGroupByChange(value === 'none' ? [] : [value])}
    >
      <SelectTrigger className={cn("w-[140px] h-7 text-xs", className)}>
        <Layers className="h-3 w-3 mr-1" />
        <SelectValue placeholder="Group by..." />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="none" className="text-xs">
          No grouping
        </SelectItem>
        <SelectMenuSeparator />
        {groupableColumns.map(column => (
          <SelectItem key={column.id} value={column.id} className="text-xs">
            {column.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// Workaround for missing SelectMenuSeparator
const SelectMenuSeparator = () => (
  <div className="h-px bg-border my-1 -mx-1" />
);