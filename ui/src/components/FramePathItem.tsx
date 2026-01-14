//
// Copyright (c) 2025, Daily
//
// SPDX-License-Identifier: BSD 2-Clause License
//

import React, { useEffect, useMemo } from "react";
import { format } from "date-fns";
import { FrameMessage, Processor } from "../types";
import { useWhisker } from "../hooks.useWhisker";
import { cn } from "@/lib/utils";
import { ArrowUp, ArrowDown, Cpu, Rocket } from "lucide-react";

type FramePathItemProps = {
  idx: number;
  frame: FrameMessage;
  processor: Processor;
  isSelected: boolean;
  onClick: () => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLDivElement>) => void;
};

export const FramePathItem = React.forwardRef<
  HTMLDivElement,
  FramePathItemProps
>(({ idx, frame, processor, isSelected, onClick, onKeyDown }, ref) => {
  useEffect(() => {
    if (
      isSelected &&
      ref &&
      typeof ref === "object" &&
      "current" in ref &&
      ref.current
    ) {
      ref.current.scrollIntoView({ block: "nearest" });
    }
  }, [isSelected, ref]);

  const { frameBackground } = useWhisker();

  const time = useMemo(
    () => format(new Date(frame.timestamp), "HH:mm:ss"),
    [frame.timestamp]
  );

  return (
    <div
      ref={ref}
      data-key={`path-${frame.id}-${idx}`}
      className={cn(
        "px-2 py-1.5 border rounded-lg bg-background hover:outline hover:outline-2 hover:outline-primary",
        "flex flex-col",
        {
          "border-2 border-foreground": isSelected,
        }
      )}
      tabIndex={0} // makes it keyboard focusable
      style={{ background: frameBackground(frame) }}
      onClick={onClick}
      onKeyDown={onKeyDown}
    >
      <div className="flex items-center gap-1.5">
        <div className="flex items-center gap-2 w-12 md:w-28 flex-shrink-0">
          {frame.direction === "upstream" ? (
            <ArrowUp className="h-4 w-4" />
          ) : (
            <ArrowDown className="h-4 w-4" />
          )}
          <strong>
            {frame.event === "process" ? (
              <span className="uppercase">
                <span className="sr-only md:not-sr-only">Process</span> <Cpu className="h-3 w-3 inline" />
              </span>
            ) : (
              <span className="uppercase">
                <span className="sr-only md:not-sr-only">Push</span> <Rocket className="h-3 w-3 inline" />
              </span>
            )}
          </strong>
        </div>
        <strong className="flex-1 min-w-0">#{processor.name}</strong>
        <span className="text-muted-foreground text-xs text-right flex-shrink-0">
          {time}
        </span>
      </div>
    </div>
  );
});

FramePathItem.displayName = "FramePathItem";
