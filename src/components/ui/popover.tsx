import * as React from "react"
import * as PopoverPrimitive from "@radix-ui/react-popover"

import { cn } from "@/lib/utils"

const Popover = PopoverPrimitive.Root

const PopoverTrigger = PopoverPrimitive.Trigger

const PopoverContent = React.forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>
>(({ className, align = "center", sideOffset = 4, ...props }, ref) => (
  <PopoverPrimitive.Portal>
    <PopoverPrimitive.Content
      ref={ref}
      align={align}
      sideOffset={sideOffset}
      collisionPadding={16}
      className={cn(
        "z-[120] w-72 rounded-md border border-border/60 bg-popover p-4 text-popover-foreground outline-none",
        // Premium shadow for elevation
        "shadow-[var(--shadow-md)]",
        // Quick fade + scale (no slide)
        "opacity-0 scale-[0.97] data-[state=open]:opacity-100 data-[state=open]:scale-100",
        "transition-all duration-150 ease-out will-change-opacity will-change-transform",
        className
      )}
      {...props}
    />
  </PopoverPrimitive.Portal>
))
PopoverContent.displayName = PopoverPrimitive.Content.displayName

export { Popover, PopoverTrigger, PopoverContent }
