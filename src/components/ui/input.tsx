import * as React from "react";

import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={cn(
          "cg-input flex h-9 w-full px-3 py-1 text-base shadow-xs transition-all motion-reduce:transition-none file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-[color:var(--ink-faint)] hover:border-[color:var(--brand-line)] disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          className,
        )}
        type={type}
        {...props}
      />
    );
  },
);

Input.displayName = "Input";

export { Input };
