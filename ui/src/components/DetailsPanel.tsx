//
// Copyright (c) 2026, Daily
//
// SPDX-License-Identifier: BSD 2-Clause License
//

import { useEffect, useState } from "react";
import { useStore } from "../state.store";

function formatTimestamp(ts: number): string {
  return new Date(ts * 1000).toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    fractionalSecondDigits: 3,
  } as Intl.DateTimeFormatOptions);
}

function formatUptime(startedAt: number): string {
  const seconds = Date.now() / 1000 - startedAt;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  if (seconds < 3600)
    return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

function UptimeTicker({ startedAt }: { startedAt: number }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);
  return <>{formatUptime(startedAt)}</>;
}

function formatJobDuration(
  startedAt: number,
  completedAt: number | null
): string {
  const end = completedAt ?? Date.now() / 1000;
  const seconds = end - startedAt;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
}

function JobDurationTicker({
  startedAt,
  completedAt,
}: {
  startedAt: number;
  completedAt: number | null;
}) {
  const [, setTick] = useState(0);
  const isRunning = completedAt === null;
  useEffect(() => {
    if (!isRunning) return;
    const id = setInterval(() => setTick((t) => t + 1), 200);
    return () => clearInterval(id);
  }, [isRunning]);
  return <>{formatJobDuration(startedAt, completedAt)}</>;
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className="flex items-baseline gap-3 py-1.5 border-b last:border-b-0">
      <span className="text-[11px] font-medium w-20 shrink-0 text-muted-foreground uppercase tracking-wide">
        {label}
      </span>
      <span className="text-xs min-w-0 break-words">{value}</span>
    </div>
  );
}

export function DetailsPanel() {
  const activeWorkerId = useStore((s) => s.activeWorkerId);
  const worker = useStore((s) =>
    activeWorkerId ? s.workers[activeWorkerId] : undefined
  );
  const selectedProcessor = useStore((s) => s.selectedProcessor);
  // ``store.selectedJob`` is a point-in-time snapshot captured when the
  // user clicked the row. Read the live entry from ``store.jobs`` so the
  // duration / status keep up as ``BusJob*`` updates flow in.
  const selectedJob = useStore((s) =>
    s.selectedJob ? (s.jobs[s.selectedJob.job_id] ?? s.selectedJob) : undefined
  );
  const framesLen =
    worker && selectedProcessor
      ? (worker.frames[selectedProcessor.id]?.length ?? 0)
      : 0;

  const proc =
    selectedProcessor && worker?.processors[selectedProcessor.id]
      ? selectedProcessor
      : null;

  const flags: string[] = [];
  if (worker?.bridged) flags.push("bridged");
  if (worker?.active === true) flags.push("active");
  else if (worker?.bridged && worker?.active === false) flags.push("idle");

  const sectionTitle =
    !worker && !selectedJob
      ? ""
      : selectedJob
        ? "Job"
        : proc
          ? "Processor"
          : "Worker";

  return (
    <div className="h-full border-t flex flex-col min-h-0">
      <div className="px-3 py-1.5 border-b flex-shrink-0 flex items-center gap-2">
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Details
        </span>
        {sectionTitle && (
          <span className="font-mono text-[11px] text-muted-foreground truncate">
            {sectionTitle}
          </span>
        )}
      </div>
      {!worker && !selectedJob ? (
        <div className="flex-1 min-h-0 flex items-center justify-center text-xs text-muted-foreground px-3 text-center">
          Select a worker, processor, or task.
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-auto px-3 py-1.5">
          {selectedJob ? (
            <>
              <Row
                label="ID"
                value={<span className="font-mono">{selectedJob.job_id}</span>}
              />
              {selectedJob.job_name && (
                <Row
                  label="Name"
                  value={
                    <span className="font-mono">{selectedJob.job_name}</span>
                  }
                />
              )}
              <Row
                label="Source"
                value={<span className="font-mono">{selectedJob.source}</span>}
              />
              {selectedJob.targets.length > 0 && (
                <Row
                  label="Targets"
                  value={
                    <span className="font-mono">
                      {selectedJob.targets.join(", ")}
                    </span>
                  }
                />
              )}
              <Row
                label="Status"
                value={
                  <span className="uppercase tracking-wide text-[10px] font-medium">
                    {selectedJob.status}
                  </span>
                }
              />
              <Row
                label="Started"
                value={formatTimestamp(selectedJob.started_at)}
              />
              {selectedJob.completed_at != null && (
                <Row
                  label="Ended"
                  value={formatTimestamp(selectedJob.completed_at)}
                />
              )}
              <Row
                label="Duration"
                value={
                  <JobDurationTicker
                    startedAt={selectedJob.started_at}
                    completedAt={selectedJob.completed_at}
                  />
                }
              />
            </>
          ) : proc && worker ? (
            <>
              <Row
                label="Name"
                value={<span className="font-mono">{proc.name}</span>}
              />
              <Row
                label="Type"
                value={<span className="font-mono">{proc.type}</span>}
              />
              {proc.parent && (
                <Row
                  label="Parent"
                  value={<span className="font-mono">{proc.parent}</span>}
                />
              )}
              <Row
                label="Worker"
                value={<span className="font-mono">{worker.worker_id}</span>}
              />
              <Row label="Frames" value={framesLen} />
            </>
          ) : worker ? (
            <>
              <Row
                label="ID"
                value={<span className="font-mono">{worker.worker_id}</span>}
              />
              {worker.runner && (
                <Row
                  label="Runner"
                  value={<span className="font-mono">{worker.runner}</span>}
                />
              )}
              {worker.parent && (
                <Row
                  label="Parent"
                  value={<span className="font-mono">{worker.parent}</span>}
                />
              )}
              {worker.status && (
                <Row
                  label="Status"
                  value={
                    <span className="uppercase tracking-wide text-[10px] font-medium">
                      {worker.status}
                    </span>
                  }
                />
              )}
              {flags.length > 0 && (
                <Row
                  label="Flags"
                  value={
                    <span className="uppercase tracking-wide text-[10px] font-medium">
                      {flags.join(" · ")}
                    </span>
                  }
                />
              )}
              <Row
                label="Processors"
                value={worker.topology.processors.length}
              />
              {worker.started_at != null && (
                <Row
                  label="Uptime"
                  value={<UptimeTicker startedAt={worker.started_at} />}
                />
              )}
              {worker.started_at != null && (
                <Row
                  label="Started"
                  value={formatTimestamp(worker.started_at)}
                />
              )}
              <Row label="Added" value={formatTimestamp(worker.added_at)} />
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}
