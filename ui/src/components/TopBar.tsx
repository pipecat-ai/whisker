//
// Copyright (c) 2025, Daily
//
// SPDX-License-Identifier: BSD 2-Clause License
//

import { useRef, useState } from "react";
import { useStore } from "../state.store";
import { usePipecatSocket } from "../hooks.usePipecatSocket";
import { useWhisker } from "../hooks.useWhisker";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Upload, Info, Link, Link2Off, Settings } from "lucide-react";
import { ConnectionStatus } from "./ConnectionStatus";
import { ThemeToggle } from "./ThemeToggle";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./ui/tooltip";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "./ui/sheet";

export function TopBar() {
  const connected = useStore((s) => s.connected);
  const url = useStore((s) => s.wsUrl);
  const setUrl = useStore((s) => s.setWsUrl);
  const resetPipeline = useStore((s) => s.resetPipeline);
  const { connect, disconnect } = usePipecatSocket();
  const { loadMessages } = useWhisker();
  const [sheetOpen, setSheetOpen] = useState(false);

  const handleButtonClick = () => {
    fileInputRef.current?.click(); // open file dialog
  };

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();

    reader.readAsArrayBuffer(file);

    reader.onload = () => {
      const CLEAR_PIPELINE_MS = 500;

      resetPipeline();

      // We just give time to Cytoscape to clear everything.
      setTimeout(() => {
        loadMessages(reader.result);
        e.target.value = "";
      }, CLEAR_PIPELINE_MS);
    };

    reader.onerror = () => {
      console.error("Error reading file", reader.error);
    };
  };

  return (
    <div className="flex items-center gap-3 px-3.5 py-2.5 border-b bg-card flex-nowrap overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
      <div className="font-bold flex-shrink-0">ᓚᘏᗢ Whisker</div>
      <ConnectionStatus connected={connected} />

      {/* Controls visible on md screens and above (>=768px) */}
      <div className="hidden md:flex items-center gap-3">
        <Input
          placeholder="ws://host:port"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          className="min-w-[260px] max-w-[300px]"
        />
        {connected ? (
          <Button
            variant="destructive"
            onClick={disconnect}
            className="flex-shrink-0"
          >
            <Link2Off className="h-4 w-4" />
            <span className="sr-only">Disconnect</span>
            <span className="hidden lg:inline">Disconnect</span>
          </Button>
        ) : (
          <Button onClick={connect} className="flex-shrink-0">
            <Link className="h-4 w-4" />
            <span className="sr-only">Connect</span>
            <span className="hidden lg:inline">Connect</span>
          </Button>
        )}

        <Button onClick={handleButtonClick} className="flex-shrink-0">
          <Upload className="h-4 w-4" />
          <span className="sr-only">Load session</span>
          <span className="hidden lg:inline">Load session</span>
        </Button>
      </div>

      <input
        type="file"
        ref={fileInputRef}
        className="hidden"
        onChange={handleFileChange}
      />

      {/* Spacer pushes next item to far right */}
      <div className="flex-1" />

      {/* Controls visible on md screens and above (>=768px) */}
      <div className="hidden md:flex items-center gap-3">
        {/* Show tip text on xl screens and above (>=1280px), tooltip on smaller screens */}
        <div className="hidden xl:block text-sm text-muted-foreground flex-shrink-0">
          Tip: Connect any time, frames are buffered while disconnected.
        </div>

        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="xl:hidden h-8 w-8 flex-shrink-0"
                aria-label="Tip"
              >
                <Info className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>
                Tip: Connect any time, frames are buffered while disconnected.
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <ThemeToggle />
      </div>

      {/* Settings sheet for screens < 768px */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden h-8 w-8 flex-shrink-0"
            aria-label="Settings"
          >
            <Settings className="h-4 w-4" />
          </Button>
        </SheetTrigger>
        <SheetContent side="right" className="w-[300px] sm:w-[400px]">
          <SheetHeader>
            <SheetTitle>Settings</SheetTitle>
            <SheetDescription>
              Configure connection and application settings.
            </SheetDescription>
          </SheetHeader>
          <div className="mt-6 space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">WebSocket URL</label>
              <Input
                placeholder="ws://host:port"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="w-full"
              />
            </div>
            <div className="flex gap-2">
              {connected ? (
                <Button
                  variant="destructive"
                  onClick={() => {
                    disconnect();
                    setSheetOpen(false);
                  }}
                  className="flex-1"
                >
                  <Link2Off className="h-4 w-4" />
                  Disconnect
                </Button>
              ) : (
                <Button
                  onClick={() => {
                    connect();
                    setSheetOpen(false);
                  }}
                  className="flex-1"
                >
                  <Link className="h-4 w-4" />
                  Connect
                </Button>
              )}
              <Button
                onClick={() => {
                  handleButtonClick();
                  setSheetOpen(false);
                }}
                className="flex-1"
              >
                <Upload className="h-4 w-4" />
                Load session
              </Button>
            </div>
            <div className="pt-4 border-t">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Theme</span>
                <ThemeToggle />
              </div>
            </div>
            <div className="pt-2 border-t">
              <div className="text-sm text-muted-foreground">
                Tip: Connect any time, frames are buffered while disconnected.
              </div>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
