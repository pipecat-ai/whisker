//
// Copyright (c) 2025, Daily
//
// SPDX-License-Identifier: BSD 2-Clause License
//

import { Badge } from "./ui/badge";
import { Wifi, WifiOff } from "lucide-react";

type ConnectionStatusProps = {
  connected: boolean;
};

export function ConnectionStatus({ connected }: ConnectionStatusProps) {
  return (
    <Badge
      variant={connected ? "default" : "destructive"}
      className="flex items-center gap-1 flex-shrink-0"
    >
      {connected ? (
        <Wifi className="h-3 w-3" />
      ) : (
        <WifiOff className="h-3 w-3" />
      )}
      {connected ? "Connected" : "Disconnected"}
    </Badge>
  );
}
