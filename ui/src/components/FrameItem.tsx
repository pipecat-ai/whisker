//
// Copyright (c) 2025-2026, Daily
//
// SPDX-License-Identifier: BSD 2-Clause License
//

import { useMemo, useRef } from "react";
import { format } from "date-fns";
import { FrameMessage } from "../types";
import { useWhisker } from "../hooks.useWhisker";
import { useStore } from "../state.store";
import { cn } from "@/lib/utils";
import { ArrowUp, ArrowDown, ChevronRight, Cpu, Rocket } from "lucide-react";

type FrameItemProps = {
  frame: FrameMessage;
  isSelected: boolean;
  onClick?: () => void;
};

export function FrameItem({ frame, isSelected, onClick }: FrameItemProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const keyboardFocus = useStore((s) => s.keyboardFocus);

  const { frameBackground } = useWhisker();

  const time = useMemo(
    // Server emits time.time() (seconds since epoch); Date expects ms.
    () => format(new Date(frame.timestamp * 1000), "HH:mm:ss.SSS"),
    [frame.timestamp]
  );

  return (
    <div
      ref={ref}
      tabIndex={0}
      onClick={onClick}
      className={cn(
        "px-2 py-1.5 border rounded-lg bg-background hover:outline hover:outline-2 hover:outline-primary cursor-pointer focus:outline-none focus-visible:outline-none",
        "flex flex-col",
        isSelected && "border-2",
        isSelected &&
          (keyboardFocus === "frames"
            ? "border-foreground"
            : "border-foreground/30")
      )}
      style={{ background: frameBackground(frame) }}
    >
      <div className="flex items-center gap-1.5">
        <div className="flex items-center gap-2 w-12 md:w-28 flex-shrink-0">
          {frame.direction === "upstream" ? (
            <ArrowUp className="h-4 w-4" />
          ) : (
            <ArrowDown className="h-4 w-4" />
          )}
          <strong>
            {frame.action === "process" ? (
              <span className="uppercase">
                <span className="sr-only md:not-sr-only">Process</span>{" "}
                <Cpu className="h-3 w-3 inline" />
              </span>
            ) : (
              <span className="uppercase">
                <span className="sr-only md:not-sr-only">Push</span>{" "}
                <Rocket className="h-3 w-3 inline" />
              </span>
            )}
          </strong>
        </div>
        <strong className="flex-1 min-w-0 truncate" title={frame.name}>
          #{frame.name}
        </strong>
        <span className="text-muted-foreground text-xs text-right flex-shrink-0">
          {time}
        </span>
        <span
          className={cn("flex-shrink-0 transition-transform", {
            "rotate-90": isSelected,
          })}
        >
          <ChevronRight className="h-4 w-4" />
        </span>
      </div>
      {isSelected && (
        <div
          // Payload is text to read / select, not a click target —
          // override the row's ``cursor-pointer`` so the cursor reverts
          // to the default text caret when hovering the JSON.
          className="text-muted-foreground text-xs whitespace-pre-wrap select-text cursor-text mt-2"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="pt-2 whitespace-pre-wrap">
            {JSON.stringify(frame.payload, null, 2)}
          </div>
        </div>
      )}
    </div>
  );
}
