//
// Copyright (c) 2025, Daily
//
// SPDX-License-Identifier: BSD 2-Clause License
//

import { TopBar } from "./components/TopBar";
import { Pipeline } from "./components/Pipeline";
import { FrameInspector } from "./components/FrameInspector";
import { FramePath } from "./components/FramePath";
import { usePipecatSocket } from "./hooks.usePipecatSocket";
import { useStore } from "./state.store";
import { Card, CardContent, CardHeader, CardTitle } from "./components/ui/card";
import { Group, Panel, Separator } from "react-resizable-panels";

export default function App() {
  usePipecatSocket();
  const versions = useStore((s) => s.versions);
  const selectedProcessor = useStore((s) => s.selectedProcessor);
  const selectedFrame = useStore((s) => s.selectedFrame);

  return (
    <div className="grid grid-rows-[56px_1fr] h-screen max-h-screen overflow-hidden">
      <TopBar />
      <div className="grid grid-cols-[1fr_1.4fr] grid-rows-1 gap-2.5 p-2.5 min-h-0 overflow-hidden h-[calc(100vh-56px)] max-h-[calc(100vh-56px)]">
        <Card className="flex flex-col min-h-0 overflow-hidden">
          <CardHeader className="pb-2 flex-shrink-0 px-4 pt-4">
            <CardTitle className="text-sm text-muted-foreground">
              Pipeline{" "}
              {versions
                ? `(Whisker: ${versions.whisker}, Pipecat: ${versions.pipecat}, Python: ${versions.python}, Platform: ${versions.platform})`
                : ""}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col min-h-0 overflow-hidden p-2">
            <div className="flex-1 rounded-xl overflow-hidden border border-dashed">
              <Pipeline />
            </div>
            <div className="text-muted-foreground text-xs mt-2 flex-shrink-0">
              Tip: Click a processor node to inspect frames.
            </div>
          </CardContent>
        </Card>
        <div className="flex flex-col min-h-0 overflow-hidden h-full">
          <Group orientation="vertical" className="flex-1 min-h-0">
            <Panel defaultSize={60} minSize={20}>
              <Card className="flex flex-col min-h-0 overflow-hidden h-full">
                <CardHeader className="pb-2 flex-shrink-0 px-4 pt-4">
                  <CardTitle className="text-sm text-muted-foreground">
                    Frames{" "}
                    {selectedProcessor
                      ? `(processor: ${selectedProcessor.name})`
                      : ""}
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex-1 min-h-0 overflow-hidden p-2">
                  <FrameInspector />
                </CardContent>
              </Card>
            </Panel>
            <Separator className="flex-none group/resize-handle flex items-center justify-center bg-transparent hover:bg-border/30 transition-all duration-200 cursor-row-resize data-[resize-handle-active]:bg-primary/20 data-[resize-handle-active]:hover:bg-primary/30 outline-none py-1">
              <div className="w-12 h-1.5 rounded-full bg-border/60 group-hover/resize-handle:bg-primary/40 group-hover/resize-handle:w-16 data-[resize-handle-active]:bg-primary data-[resize-handle-active]:w-16 transition-all duration-200" />
            </Separator>
            <Panel defaultSize={40} minSize={20}>
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
          <div className="text-muted-foreground text-xs px-4 flex-shrink-0 mt-4">
            Tip: Click a frame in the path and press{" "}
            <span className="font-mono text-[11px] px-1.5 py-0.5 border rounded-md bg-background">
              Up
            </span>{" "}
            or{" "}
            <span className="font-mono text-[11px] px-1.5 py-0.5 border rounded-md bg-background">
              Down
            </span>{" "}
            to move between processors.
          </div>
        </div>
      </div>
    </div>
  );
}
