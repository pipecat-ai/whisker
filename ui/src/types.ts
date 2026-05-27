//
// Copyright (c) 2025-2026, Daily
//
// SPDX-License-Identifier: BSD 2-Clause License
//

export type Processor = {
  id: string;
  name: string;
  parent: string | null;
  type: string;
};

export type Connection = { from: string; to: string };

export type Topology = {
  processors: Processor[];
  connections: Connection[];
};

export type Versions = {
  platform: string;
  python: string;
  pipecat: string;
  whisker: string;
};

export type FrameType = "frame" | "frame:whisker" | "frame:whisker-urgent";

export type FrameMessage = {
  type: FrameType;
  id: number;
  worker_id: string;
  name: string;
  from: string;
  action: "process" | "push";
  direction: "upstream" | "downstream";
  timestamp: number;
  payload: any;
};

export type WorkerDescriptor = {
  worker_id: string;
  added_at: number;
  topology: Topology;
  parent?: string | null;
};

export type SnapshotMessage = {
  type: "snapshot";
  protocol: string;
  timestamp: number;
  server: Versions;
  workers: WorkerDescriptor[];
};

export type WorkerAddedMessage = {
  type: "worker_added";
  timestamp: number;
  worker_id: string;
  added_at: number;
  topology: Topology;
  parent?: string | null;
};

export type BusMessageCategory = "frame" | "job" | "lifecycle" | "other";

export type BusMessage = {
  type: "bus_message";
  timestamp: number;
  message_type: string;
  category: BusMessageCategory;
  source_worker: string | null;
  target_worker: string | null;
  data: any;
};

export type ServerMessage =
  | SnapshotMessage
  | WorkerAddedMessage
  | FrameMessage
  | BusMessage;

// Job lifecycle derived client-side by replaying the BusJob* bus events.
export type JobStatus =
  | "running"
  | "completed"
  | "cancelled"
  | "failed"
  | "error";

export type Job = {
  job_id: string;
  job_name: string | null;
  source: string;
  targets: string[];
  status: JobStatus;
  started_at: number;
  completed_at: number | null;
};
