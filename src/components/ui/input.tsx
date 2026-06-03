import * as React from "react"

import { cn } from "@/lib/utils"
import { useIsMobile } from "@/hooks/use-mobile"

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    const isMobile = useIsMobile()

    return (
      <input
        type={type}
        className={cn(
          "flex w-full border bg-input text-sm",
          "ring-offset-background",
          "transition-all duration-150 ease-out",
          "file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground",
          "placeholder:text-muted-foreground/60",
          "focus-visible:outline-none",
          // Clean, tight focus ring (1.5px) using primary color
          "focus-visible:ring-[1.5px] focus-visible:ring-primary/40",
          "focus-visible:ring-offset-0",
          "focus-visible:border-primary/50",
          "disabled:cursor-not-allowed disabled:opacity-50",
          // Tighter border radius for inputs (0.45rem = 7.2px)
          isMobile
            ? "h-12 px-4 py-3 text-base border-border/40 rounded-sm"
            : "h-10 px-3.5 py-2 border-border/50 rounded-sm",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
