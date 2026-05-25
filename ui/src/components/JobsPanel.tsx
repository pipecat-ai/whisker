//
// Copyright (c) 2026, Daily
//
// SPDX-License-Identifier: BSD 2-Clause License
//

import { useMemo, useState } from "react";
import { useStore } from "../state.store";
import { Job } from "../types";
import { JobNode } from "./JobNode";
import { SearchableFilterDropdown } from "./SearchableFilterDropdown";

export function JobsPanel() {
  const allJobs = useStore((s) => s.jobs);
  const workerOrder = useStore((s) => s.workerOrder);
  const selectedJob = useStore((s) => s.selectedJob);
  const setSelectedJob = useStore((s) => s.setSelectedJob);
  const setKeyboardFocus = useStore((s) => s.setKeyboardFocus);

  // Worker filter. Empty set = show all jobs. Non-empty = show jobs whose
  // source or any target matches one of the selected workers.
  const [selectedWorkers, setSelectedWorkers] = useState<Set<string>>(
    () => new Set<string>()
  );

  const allJobsSorted = useMemo<Job[]>(() => {
    const list = Object.values(allJobs);
    list.sort((a, b) => a.started_at - b.started_at);
    return list;
  }, [allJobs]);

  const jobs = useMemo<Job[]>(() => {
    if (selectedWorkers.size === 0) return allJobsSorted;
    // Match only on the job's direct parent (source) — the worker that
    // requested it. Targets are skipped so picking a worker doesn't also
    // surface every job some descendant happens to be doing.
    return allJobsSorted.filter((j) => selectedWorkers.has(j.source));
  }, [allJobsSorted, selectedWorkers]);

  const toggleWorker = (w: string) => {
    setSelectedWorkers((curr) => {
      const next = new Set(curr);
      if (next.has(w)) next.delete(w);
      else next.add(w);
      return next;
    });
  };

  const clearWorkers = () => setSelectedWorkers(new Set());

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    if (jobs.length === 0) return;
    const idx = selectedJob
      ? jobs.findIndex((j) => j.job_id === selectedJob.job_id)
      : -1;
    if (idx < 0) {
      e.preventDefault();
      const first =
        e.key === "ArrowDown" ? jobs[0] : jobs[jobs.length - 1];
      setSelectedJob(first);
      return;
    }
    let nextIdx = idx;
    if (e.key === "ArrowDown" && idx < jobs.length - 1) nextIdx = idx + 1;
    if (e.key === "ArrowUp" && idx > 0) nextIdx = idx - 1;
    if (nextIdx === idx) return;
    e.preventDefault();
    setSelectedJob(jobs[nextIdx]);
  };

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="flex items-center gap-2 px-2 py-1.5 flex-shrink-0 flex-wrap border-b">
        <SearchableFilterDropdown
          label="All workers"
          placeholder="Search workers..."
          availableItems={workerOrder}
          selectedItems={selectedWorkers}
          onToggle={toggleWorker}
          onClear={clearWorkers}
        />
        <span className="text-[11px] text-muted-foreground font-normal">
          {jobs.length} out of {allJobsSorted.length}
        </span>
      </div>
      {jobs.length === 0 ? (
        <div className="flex-1 min-h-0 flex items-center justify-center text-xs text-muted-foreground px-3 text-center">
          {allJobsSorted.length === 0
            ? "No jobs yet."
            : "No jobs match the current filter."}
        </div>
      ) : (
        // Plain ``overflow-y-auto`` div instead of Radix ScrollArea —
        // Radix's Viewport uses ``display: table`` internally, which
        // lets children grow beyond the viewport's width and defeats
        // any ``truncate`` inside.
        <div
          className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden py-1"
          onKeyDown={handleKeyDown}
          onFocus={() => setKeyboardFocus("jobs")}
        >
          {jobs.map((j) => (
            <JobNode key={j.job_id} job={j} depth={0} />
          ))}
        </div>
      )}
    </div>
  );
}
