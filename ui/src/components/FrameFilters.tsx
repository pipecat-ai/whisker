//
// Copyright (c) 2025-2026, Daily
//
// SPDX-License-Identifier: BSD 2-Clause License
//

import { ArrowDown, ArrowUp, Cpu, LucideIcon, Rocket } from "lucide-react";
import { SearchableFilterDropdown } from "./SearchableFilterDropdown";

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
  visibleCount: number;
  totalCount: number;
};

// Pill colors. ``push`` and ``process`` mirror the FrameItem backgrounds so
// the pill matches the row tint at a glance. ``upstream`` / ``downstream``
// don't have row backgrounds in the frame list; pick complementary hues that
// stay distinct from push/process.
const PILL_STYLES = {
  push: { bg: "rgba(59,130,246,0.15)", fg: "hsl(220, 80%, 55%)" },
  process: { bg: "rgba(16,185,129,0.15)", fg: "hsl(150, 60%, 40%)" },
  upstream: { bg: "rgba(245, 158, 11, 0.15)", fg: "hsl(35, 80%, 50%)" },
  downstream: { bg: "rgba(168, 85, 247, 0.15)", fg: "hsl(280, 60%, 55%)" },
} as const;

type PillKind = keyof typeof PILL_STYLES;

function PillToggle({
  label,
  kind,
  icon: Icon,
  enabled,
  onToggle,
}: {
  label: string;
  kind: PillKind;
  icon: LucideIcon;
  enabled: boolean;
  onToggle: () => void;
}) {
  const style = PILL_STYLES[kind];
  return (
    <button
      onClick={onToggle}
      className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium uppercase tracking-wide transition-opacity"
      style={{
        backgroundColor: style.bg,
        color: style.fg,
        opacity: enabled ? 1 : 0.3,
      }}
    >
      <Icon size={10} />
      {label}
    </button>
  );
}

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
  visibleCount,
  totalCount,
}: FrameFiltersProps) {
  const toggleType = (t: string) => {
    const next = new Set(selectedTypes);
    if (next.has(t)) next.delete(t);
    else next.add(t);
    onTypesChange(next);
  };

  const clearAll = () => onTypesChange(new Set());

  return (
    <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
      <PillToggle
        label="Push"
        kind="push"
        icon={Rocket}
        enabled={showPush}
        onToggle={() => onShowPushChange(!showPush)}
      />
      <PillToggle
        label="Process"
        kind="process"
        icon={Cpu}
        enabled={showProcess}
        onToggle={() => onShowProcessChange(!showProcess)}
      />
      <PillToggle
        label="Upstream"
        kind="upstream"
        icon={ArrowUp}
        enabled={showUpstream}
        onToggle={() => onShowUpstreamChange(!showUpstream)}
      />
      <PillToggle
        label="Downstream"
        kind="downstream"
        icon={ArrowDown}
        enabled={showDownstream}
        onToggle={() => onShowDownstreamChange(!showDownstream)}
      />
      <SearchableFilterDropdown
        label="All frames"
        placeholder="Search frames..."
        availableItems={availableTypes}
        selectedItems={selectedTypes}
        onToggle={toggleType}
        onClear={clearAll}
      />
      <span className="text-[11px] text-muted-foreground font-normal">
        {visibleCount} out of {totalCount}
      </span>
    </div>
  );
}
