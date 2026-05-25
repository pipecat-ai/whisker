//
// Copyright (c) 2026, Daily
//
// SPDX-License-Identifier: BSD 2-Clause License
//

import { ListTodo } from "lucide-react";
import { Job, JobStatus } from "../types";
import { useStore } from "../state.store";
import { cn } from "@/lib/utils";

const JOB_STATUS_COLORS: Record<JobStatus, { bg: string; fg: string }> = {
  running: { bg: "hsla(45, 90%, 45%, 0.15)", fg: "hsl(45, 90%, 45%)" },
  completed: { bg: "hsla(150, 60%, 40%, 0.15)", fg: "hsl(150, 60%, 40%)" },
  failed: { bg: "hsla(0, 65%, 50%, 0.15)", fg: "hsl(0, 65%, 50%)" },
  error: { bg: "hsla(0, 65%, 50%, 0.15)", fg: "hsl(0, 65%, 50%)" },
  cancelled: { bg: "hsla(0, 0%, 50%, 0.12)", fg: "hsl(0, 0%, 50%)" },
};

type Props = {
  job: Job;
  depth: number;
};

export function JobNode({ job, depth }: Props) {
  const selectedJob = useStore((s) => s.selectedJob);
  const setSelectedJob = useStore((s) => s.setSelectedJob);
  const keyboardFocus = useStore((s) => s.keyboardFocus);

  const status = JOB_STATUS_COLORS[job.status] ?? JOB_STATUS_COLORS.running;
  const label = job.job_name || job.job_id;
  const isSelected = selectedJob?.job_id === job.job_id;

  const onSelect = () => {
    // Jobs live alongside the worker's pipeline + frame selections —
    // selecting a job shouldn't reset those since we're not switching
    // worker context.
    setSelectedJob(job);
  };

  return (
    <div
      className={cn(
        "group flex items-center mx-1 rounded-lg border-b border-border/60 last:border-b-0 hover:bg-accent/30 transition-colors",
        isSelected && "bg-accent/40 ring-2 ring-inset",
        isSelected &&
          (keyboardFocus === "jobs"
            ? "ring-foreground"
            : "ring-foreground/30")
      )}
      style={depth > 0 ? { paddingLeft: `${depth * 16}px` } : undefined}
    >
      <button
        onClick={onSelect}
        className="flex-1 flex items-center gap-1.5 px-2 py-1 text-xs min-w-0 text-left focus:outline-none focus-visible:outline-none"
      >
        <ListTodo size={11} className="shrink-0 text-muted-foreground" />
        {/* Name + source share the remaining width and truncate as
            needed. The spans need their own ``min-w-0`` so they're
            shrinkable below their natural content width — without it
            ``truncate`` does nothing in a flex row. */}
        <div className="flex-1 min-w-0 flex items-center gap-2 overflow-hidden">
          <span
            className="font-mono truncate min-w-0"
            title={job.job_id}
          >
            {label}
          </span>
          <span
            className="text-muted-foreground opacity-70 truncate min-w-0"
            title={job.source}
          >
            {job.source}
          </span>
        </div>
        {/* Status pill is ``shrink-0`` so it always fits. */}
        <span
          className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium uppercase tracking-wide"
          style={{ backgroundColor: status.bg, color: status.fg }}
        >
          {job.status}
        </span>
      </button>
    </div>
  );
}
