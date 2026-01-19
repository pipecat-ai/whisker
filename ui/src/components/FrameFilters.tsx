//
// Copyright (c) 2025-2026, Daily
//
// SPDX-License-Identifier: BSD 2-Clause License
//

import { useState, useMemo } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Checkbox } from "./ui/checkbox";
import { Label } from "./ui/label";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
} from "./ui/dropdown-menu";
import { ScrollArea } from "./ui/scroll-area";
import { Badge } from "./ui/badge";
import { ChevronDown, ChevronUp, X } from "lucide-react";

type FrameFiltersProps = {
  availableTypes: string[];
  selectedTypes: Set<string>;
  onTypesChange: (types: Set<string>) => void;
  showPush: boolean;
  showProcess: boolean;
  showUpstream: boolean;
  showDownstream: boolean;
  onShowPushChange: (show: boolean) => void;
  onShowProcessChange: (show: boolean) => void;
  onShowUpstreamChange: (show: boolean) => void;
  onShowDownstreamChange: (show: boolean) => void;
};

export function FrameFilters({
  availableTypes,
  selectedTypes,
  onTypesChange,
  showPush,
  showProcess,
  showUpstream,
  showDownstream,
  onShowPushChange,
  onShowProcessChange,
  onShowUpstreamChange,
  onShowDownstreamChange,
}: FrameFiltersProps) {
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [typeSearch, setTypeSearch] = useState("");

  const filteredTypes = useMemo(() => {
    if (!typeSearch) return availableTypes;
    const q = typeSearch.toLowerCase();
    return availableTypes.filter((t) => t.toLowerCase().includes(q));
  }, [availableTypes, typeSearch]);

  const allFilteredSelected = useMemo(() => {
    return (
      filteredTypes.length > 0 &&
      filteredTypes.every((type) => selectedTypes.has(type))
    );
  }, [filteredTypes, selectedTypes]);

  const hasSelectedTypes = selectedTypes.size > 0;
  const hasFilteredTypes = filteredTypes.length > 0;
  const showSelectAll = hasFilteredTypes && !allFilteredSelected;
  const showClearAll = hasSelectedTypes;

  const toggleType = (type: string) => {
    const next = new Set(selectedTypes);
    if (next.has(type)) {
      next.delete(type);
    } else {
      next.add(type);
    }
    onTypesChange(next);
  };

  const selectAll = () => {
    onTypesChange(new Set(filteredTypes));
  };

  const clearAll = () => {
    onTypesChange(new Set());
  };

  return (
    <div className="flex flex-col gap-2 flex-shrink-0">
      <div className="flex items-center gap-2 flex-wrap">
        <DropdownMenu
          open={isFilterOpen}
          onOpenChange={setIsFilterOpen}
          modal={false}
        >
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              className="grow md:min-w-80 justify-between"
            >
              <span>
                {selectedTypes.size === 0
                  ? "All frames"
                  : `${selectedTypes.size} frame type${
                      selectedTypes.size > 1 ? "s" : ""
                    } selected`}
              </span>
              {isFilterOpen ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-[var(--radix-dropdown-menu-trigger-width)]">
            {(showSelectAll || showClearAll) && (
              <div className="flex gap-2 p-2 border-b border-border">
                {showSelectAll && (
                  <Button
                    variant="outline"
                    size="sm"
                    className={showClearAll ? "flex-1" : "w-full"}
                    onClick={(e) => {
                      e.preventDefault();
                      selectAll();
                    }}
                  >
                    Select All
                  </Button>
                )}
                {showClearAll && (
                  <Button
                    variant="outline"
                    size="sm"
                    className={showSelectAll ? "flex-1" : "w-full"}
                    onClick={(e) => {
                      e.preventDefault();
                      clearAll();
                    }}
                  >
                    Clear
                  </Button>
                )}
              </div>
            )}
            <div className="p-2 border-b border-border">
              <Input
                placeholder="Search frames..."
                value={typeSearch}
                onChange={(e) => setTypeSearch(e.target.value)}
                onKeyDown={(e) => e.stopPropagation()}
                className="h-8"
              />
            </div>
            <ScrollArea className="h-[200px]">
              {filteredTypes.length === 0 ? (
                <div className="p-3 text-sm text-muted-foreground text-center">
                  No frames available
                </div>
              ) : (
                filteredTypes.map((type) => (
                  <DropdownMenuCheckboxItem
                    key={type}
                    checked={selectedTypes.has(type)}
                    onCheckedChange={() => toggleType(type)}
                    onSelect={(e) => e.preventDefault()}
                  >
                    {type}
                  </DropdownMenuCheckboxItem>
                ))
              )}
            </ScrollArea>
          </DropdownMenuContent>
        </DropdownMenu>
        <div className="flex gap-2 flex-wrap">
          <div className="flex gap-2 px-3 py-2 border rounded-md">
            <div className="flex items-center gap-2">
              <Checkbox
                id="show-push"
                checked={showPush}
                onCheckedChange={(checked) =>
                  onShowPushChange(checked === true)
                }
              />
              <Label
                htmlFor="show-push"
                className="text-xs cursor-pointer uppercase"
              >
                Push
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="show-process"
                checked={showProcess}
                onCheckedChange={(checked) =>
                  onShowProcessChange(checked === true)
                }
              />
              <Label
                htmlFor="show-process"
                className="text-xs cursor-pointer uppercase"
              >
                Process
              </Label>
            </div>
          </div>
          <div className="flex gap-2 px-3 py-2 border rounded-md">
            <div className="flex items-center gap-2">
              <Checkbox
                id="show-upstream"
                checked={showUpstream}
                onCheckedChange={(checked) =>
                  onShowUpstreamChange(checked === true)
                }
              />
              <Label
                htmlFor="show-upstream"
                className="text-xs cursor-pointer uppercase"
              >
                Upstream
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="show-downstream"
                checked={showDownstream}
                onCheckedChange={(checked) =>
                  onShowDownstreamChange(checked === true)
                }
              />
              <Label
                htmlFor="show-downstream"
                className="text-xs cursor-pointer uppercase"
              >
                Downstream
              </Label>
            </div>
          </div>
        </div>
      </div>
      {selectedTypes.size > 0 && (
        <div className="flex gap-2 flex-wrap items-center">
          {Array.from(selectedTypes).map((type) => (
            <Badge
              key={type}
              variant="outline"
              className="cursor-pointer hover:bg-secondary/80 transition-colors pr-1"
              onClick={() => toggleType(type)}
            >
              <span className="mr-1">{type}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  toggleType(type);
                }}
                className="ml-1 rounded-full hover:bg-background/30 p-0.5 transition-colors"
                aria-label={`Remove ${type} filter`}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
