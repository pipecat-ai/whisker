//
// Copyright (c) 2025-2026, Daily
//
// SPDX-License-Identifier: BSD 2-Clause License
//

import { useEffect, useMemo, useRef } from "react";
import { format } from "date-fns";
import { FrameMessage } from "../types";
import { useWhisker } from "../hooks.useWhisker";
import { cn } from "@/lib/utils";
import { ArrowUp, ArrowDown, ChevronRight, Cpu, Rocket } from "lucide-react";

type FrameItemProps = {
  idx: number;
  frame: FrameMessage;
  isSelected: boolean;
  onClick?: () => void;
};

export function FrameItem({ idx, frame, isSelected, onClick }: FrameItemProps) {
  const ref = useRef<HTMLDivElement | null>(null);

  const { frameBackground } = useWhisker();

  const time = useMemo(
    () => format(new Date(frame.timestamp), "HH:mm:ss"),
    [frame.timestamp]
  );

  return (
    <div
      ref={ref}
      className={cn(
        "px-2 py-1.5 border rounded-lg bg-background hover:outline hover:outline-2 hover:outline-primary",
        "flex flex-col",
        "transition-all duration-200 ease-in-out",
        {
          "border-2 border-foreground": isSelected,
        }
      )}
      style={{ background: frameBackground(frame) }}
    >
      <div
        className="flex items-center gap-1.5 cursor-pointer"
        onClick={onClick}
      >
        <div className="flex items-center gap-2 w-12 md:w-28 flex-shrink-0">
          {frame.direction === "upstream" ? (
            <ArrowUp className="h-4 w-4" />
          ) : (
            <ArrowDown className="h-4 w-4" />
          )}
          <strong>
            {frame.event === "process" ? (
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
        <strong className="flex-1 min-w-0">#{frame.name}</strong>
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
      <div
        className={cn(
          "text-muted-foreground text-xs whitespace-pre-wrap select-text overflow-hidden transition-all duration-300 ease-in-out",
          isSelected ? "max-h-[1000px] opacity-100 mt-2" : "max-h-0 opacity-0"
        )}
      >
        <div className="pt-2 whitespace-pre-wrap">
          {JSON.stringify(frame.payload, null, 2)}
        </div>
      </div>
    </div>
  );
}
