//
// Copyright (c) 2025-2026, Daily
//
// SPDX-License-Identifier: BSD 2-Clause License
//

import { useEffect, useRef } from "react";
import { FrameMessage } from "../types";
import { useWhisker } from "../hooks.useWhisker";
import { cn } from "@/lib/utils";
import {
  ArrowUp,
  ArrowDown,
  Settings,
  Rocket,
  ChevronDown,
  ChevronRight,
} from "lucide-react";

type FrameItemProps = {
  idx: number;
  frame: FrameMessage;
  isSelected: boolean;
  onClick?: () => void;
};

export function FrameItem({
  idx,
  frame,
  isSelected,
  onClick,
}: FrameItemProps) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (isSelected && ref.current) {
      ref.current.scrollIntoView({ block: "nearest" });
    }
  }, [isSelected]);

  const { frameBackground } = useWhisker();

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
      <div className="flex items-center gap-1.5 cursor-pointer" onClick={onClick}>
        {frame.direction === "upstream" ? (
          <ArrowUp className="h-4 w-4" />
        ) : (
          <ArrowDown className="h-4 w-4" />
        )}
        <span>
          <b>
            {frame.event === "process" ? (
              <span className="uppercase">
                Process <Settings className="h-3 w-3 inline" />
              </span>
            ) : (
              <span className="uppercase">
                Push <Rocket className="h-3 w-3 inline" />
              </span>
            )}
          </b>
        </span>
        <b>#{frame.name}</b>
        <span className="text-muted-foreground text-xs">
          • {new Date(frame.timestamp).toISOString()}
        </span>
        <span className="ml-auto transition-transform duration-200 ease-in-out">
          {isSelected ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
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
