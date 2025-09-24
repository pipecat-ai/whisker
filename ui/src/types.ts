//
// Copyright (c) 2025, Daily
//
// SPDX-License-Identifier: BSD 2-Clause License
//

export type Processor = {
  id: string;
  name: string;
  parent: string | null;
  type: string;
};

export type Versions = {
  platform: string;
  python: string;
  pipecat: string;
  whisker: string;
};

export type Connection = { from: string; to: string };

export type PipelineMessage = {
  type: "pipeline";
  processors: Processor[];
  connections: Connection[];
  versions?: Versions;
};

export type FrameMessage = {
  type: "frame";
  id: number;
  name: string;
  from: string;
  event: "process" | "push";
  direction: "upstream" | "downstream";
  timestamp: number;
  payload: any;
};

export type ServerMessage = PipelineMessage | FrameMessage;
