//
// Copyright (c) 2025, Daily
//
// SPDX-License-Identifier: BSD 2-Clause License
//

import { Button } from "./ui/button";
import { Moon, Sun } from "lucide-react";
import { useStore } from "../state.store";

export function ThemeToggle() {
  const theme = useStore((s) => s.theme);
  const setTheme = useStore((s) => s.setTheme);

  return (
    <Button
      variant="ghost"
      onClick={() => setTheme(theme === "light" ? "dark" : "light")}
      className="flex-shrink-0"
    >
      {theme === "light" ? (
        <>
          <Moon className="h-4 w-4" />
          <span className="sr-only">Dark</span>
          <span className="hidden lg:inline">Dark</span>
        </>
      ) : (
        <>
          <Sun className="h-4 w-4" />
          <span className="sr-only">Light</span>
          <span className="hidden lg:inline">Light</span>
        </>
      )}
    </Button>
  );
}
