//
// Copyright (c) 2025-2026, Daily
//
// SPDX-License-Identifier: BSD 2-Clause License
//

import { useState } from "react";
import { Network } from "lucide-react";
import { TopBar } from "./components/TopBar";
import { FrameInspector } from "./components/FrameInspector";
import { FramePath } from "./components/FramePath";
import { WorkerTree } from "./components/WorkerTree";
import { PipelinePanel } from "./components/PipelinePanel";
import { JobsPanel } from "./components/JobsPanel";
import { BusEvents } from "./components/BusEvents";
import { DetailsPanel } from "./components/DetailsPanel";
import { PipelineGraphDialog } from "./components/PipelineGraphDialog";
import { usePipecatSocket } from "./hooks.usePipecatSocket";
import { useStore } from "./state.store";
import { Card, CardContent, CardHeader, CardTitle } from "./components/ui/card";
import { Group, Panel, Separator } from "react-resizable-panels";

const VERTICAL_HANDLE_CLASS =
  "flex-none group/resize-handle flex items-center justify-center bg-transparent hover:bg-border/30 transition-all duration-200 cursor-row-resize data-[resize-handle-active]:bg-primary/20 data-[resize-handle-active]:hover:bg-primary/30 outline-none py-1";
const VERTICAL_HANDLE_GRIP_CLASS =
  "w-12 h-1.5 rounded-full bg-border/60 group-hover/resize-handle:bg-primary/40 group-hover/resize-handle:w-16 data-[resize-handle-active]:bg-primary data-[resize-handle-active]:w-16 transition-all duration-200";
const HORIZONTAL_HANDLE_CLASS =
  "flex-none group/resize-handle flex items-center justify-center bg-transparent hover:bg-border/30 transition-all duration-200 cursor-col-resize data-[resize-handle-active]:bg-primary/20 data-[resize-handle-active]:hover:bg-primary/30 outline-none px-1";
const HORIZONTAL_HANDLE_GRIP_CLASS =
  "h-12 w-1.5 rounded-full bg-border/60 group-hover/resize-handle:bg-primary/40 group-hover/resize-handle:h-16 data-[resize-handle-active]:bg-primary data-[resize-handle-active]:h-16 transition-all duration-200";

export default function App() {
  usePipecatSocket();
  const versions = useStore((s) => s.versions);
  const selectedFrame = useStore((s) => s.selectedFrame);
  const workerCount = useStore((s) => s.workerOrder.length);
  const activeWorkerId = useStore((s) => s.activeWorkerId);
  const [graphOpen, setGraphOpen] = useState(false);

  return (
    <div className="flex flex-col h-screen max-h-screen overflow-hidden">
      <TopBar />
      <div className="flex-1 min-h-0 overflow-hidden p-2.5">
        <Group orientation="horizontal" className="h-full">
          {/* LEFT COLUMN: Workers / Jobs / Details */}
          <Panel defaultSize={20} minSize={10}>
            <Card className="flex flex-col min-h-0 overflow-hidden h-full">
          <CardHeader className="pb-2 flex-shrink-0 px-4 pt-4">
            <CardTitle className="text-sm text-muted-foreground">
              Workers {workerCount > 0 ? `(${workerCount})` : ""}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 min-h-0 overflow-hidden p-0">
            <Group orientation="vertical" className="h-full">
              <Panel defaultSize={40} minSize={15}>
                <WorkerTree />
              </Panel>
              <Separator className={VERTICAL_HANDLE_CLASS}>
                <div className={VERTICAL_HANDLE_GRIP_CLASS} />
              </Separator>
              <Panel defaultSize={35} minSize={15}>
                <div className="h-full border-t flex flex-col min-h-0">
                  <div className="px-3 py-1.5 border-b flex-shrink-0">
                    <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      Jobs
                    </span>
                  </div>
                  <div className="flex-1 min-h-0 overflow-hidden">
                    <JobsPanel />
                  </div>
                </div>
              </Panel>
              <Separator className={VERTICAL_HANDLE_CLASS}>
                <div className={VERTICAL_HANDLE_GRIP_CLASS} />
              </Separator>
              <Panel defaultSize={25} minSize={15}>
                <DetailsPanel />
              </Panel>
            </Group>
          </CardContent>
            </Card>
          </Panel>
          <Separator className={HORIZONTAL_HANDLE_CLASS}>
            <div className={HORIZONTAL_HANDLE_GRIP_CLASS} />
          </Separator>
          <Panel defaultSize={80} minSize={40}>
            {/* RIGHT COLUMN: Bus messages on top, Pipeline | Frames | Frame path on bottom */}
            <div className="flex flex-col min-h-0 overflow-hidden h-full">
          <Group orientation="vertical" className="flex-1 min-h-0">
            <Panel defaultSize={40} minSize={15}>
              <BusEvents />
            </Panel>
            <Separator className={VERTICAL_HANDLE_CLASS}>
              <div className={VERTICAL_HANDLE_GRIP_CLASS} />
            </Separator>
            <Panel defaultSize={60} minSize={20}>
              <Group orientation="horizontal" className="h-full">
                <Panel defaultSize={22} minSize={10}>
                  <Card className="flex flex-col min-h-0 overflow-hidden h-full">
                    <CardHeader className="pb-2 flex-shrink-0 px-4 pt-4 flex flex-row items-center gap-2">
                      <CardTitle className="text-sm text-muted-foreground truncate">
                        Pipeline
                      </CardTitle>
                      {activeWorkerId && (
                        <span className="font-mono text-[11px] text-muted-foreground truncate flex-1">
                          {activeWorkerId}
                        </span>
                      )}
                      {activeWorkerId && (
                        <button
                          onClick={() => setGraphOpen(true)}
                          className="shrink-0 p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent focus:outline-none focus-visible:outline-none"
                          title="View pipeline graph"
                          aria-label="View pipeline graph"
                        >
                          <Network size={14} />
                        </button>
                      )}
                    </CardHeader>
                    <CardContent className="flex-1 min-h-0 overflow-hidden p-0">
                      <PipelinePanel />
                    </CardContent>
                  </Card>
                  {activeWorkerId && (
                    <PipelineGraphDialog
                      workerId={activeWorkerId}
                      open={graphOpen}
                      onOpenChange={setGraphOpen}
                    />
                  )}
                </Panel>
                <Separator className={HORIZONTAL_HANDLE_CLASS}>
                  <div className={HORIZONTAL_HANDLE_GRIP_CLASS} />
                </Separator>
                <Panel defaultSize={50} minSize={15}>
                  <FrameInspector />
                </Panel>
                <Separator className={HORIZONTAL_HANDLE_CLASS}>
                  <div className={HORIZONTAL_HANDLE_GRIP_CLASS} />
                </Separator>
                <Panel defaultSize={28} minSize={10}>
                  <Card className="flex flex-col min-h-0 overflow-hidden h-full">
                    <CardHeader className="pb-2 flex-shrink-0 px-4 pt-4">
                      <CardTitle className="text-sm text-muted-foreground">
                        Frame path{" "}
                        {selectedFrame ? `(frame: ${selectedFrame.name})` : ""}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="flex-1 min-h-0 overflow-hidden p-2">
                      <FramePath />
                    </CardContent>
                  </Card>
                </Panel>
              </Group>
            </Panel>
          </Group>
              {versions && (
                <div className="flex justify-end text-muted-foreground text-xs px-4 flex-shrink-0 mt-4">
                  <span className="text-right truncate">
                    Whisker {versions.whisker} · Pipecat {versions.pipecat} ·
                    Python {versions.python.split(" ")[0]} · {versions.platform}
                  </span>
                </div>
              )}
            </div>
          </Panel>
        </Group>
      </div>
    </div>
  );
}
