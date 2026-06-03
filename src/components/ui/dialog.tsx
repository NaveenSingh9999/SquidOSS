import * as React from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { X } from "@/lib/icon-map"

import { cn } from "@/lib/utils"
import { useIsMobile } from "@/hooks/use-mobile"

const Dialog = DialogPrimitive.Root
const DialogTrigger = DialogPrimitive.Trigger
const DialogPortal = DialogPrimitive.Portal
const DialogClose = DialogPrimitive.Close

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-50 bg-black/55",
      "opacity-0 data-[state=open]:opacity-100",
      "transition-opacity duration-150 ease-out",
      className
    )}
    {...props}
  />
))
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => {
  const isMobile = useIsMobile()
  
  // Custom z-index extraction logic for overlaid dialogs (like BYOK prompt over preview)
  const zIndexMatches = className?.match(/z-\[?\d+\]?/);
  const zIndexClass = zIndexMatches ? zIndexMatches[0] : "z-50";

  return (
    <DialogPortal>
      <DialogOverlay className={zIndexClass !== "z-50" ? zIndexClass : undefined} />
      <DialogPrimitive.Content
        ref={ref}
        className={cn(
          "fixed grid w-full gap-4 border shadow-[var(--shadow-lg)]",
          zIndexClass,
          isMobile
            ? [
                // Mobile: bottom sheet — squircle top corners
                "left-0 right-0 bottom-0 top-auto",
                "translate-y-full data-[state=open]:translate-y-0",
                "max-w-full mx-0",
                // Squircle top only — 24px = var(--sq-2xl)
                "rounded-t-[24px] rounded-b-none",
                "bg-card/98 border-border/40 border-b-0",
                "px-6 pt-6 pb-[calc(2rem+env(safe-area-inset-bottom))] mb-0",
                "transition-transform duration-200 ease-out",
                "max-h-[85vh] overflow-y-auto",
              ].join(" ")
            : [
                // Desktop: centered modal — squircle 20px = var(--sq-xl)
                "left-[50%] top-[50%] translate-x-[-50%] translate-y-[-50%]",
                "max-w-lg mx-4 max-w-[calc(100%-2rem)] sm:max-w-lg",
                "rounded-[20px]",
                "border-border/40 bg-card p-5",
                "opacity-0 scale-[0.96] data-[state=open]:opacity-100 data-[state=open]:scale-100",
                "transition-[opacity,transform] duration-150 ease-out",
              ].join(" "),
          className
        )}
        {...props}
      >
        {/* Mobile drag pill */}
        {isMobile && (
          <div className="flex justify-center -mt-2 mb-2">
            <div className="w-10 h-1 bg-muted-foreground/35" />
          </div>
        )}

        {children}

        {/* Close button — squircle 8px */}
        <DialogPrimitive.Close
          className={cn(
            "absolute rounded-[8px] ring-offset-background transition-all",
            "focus:outline-none focus:ring-2 focus:ring-ring/40 focus:ring-offset-2",
            "disabled:pointer-events-none",
            "data-[state=open]:bg-accent data-[state=open]:text-muted-foreground",
            isMobile
              ? "right-4 top-4 h-10 w-10 flex items-center justify-center bg-white/8 hover:bg-white/15 text-white/60 hover:text-white border border-white/10"
              : "right-4 top-4 h-8 w-8 flex items-center justify-center bg-muted/40 hover:bg-destructive/8 hover:text-destructive text-muted-foreground border border-border/25"
          )}
        >
          <X className={cn(isMobile ? "h-5 w-5" : "h-4 w-4")} />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPortal>
  )
})
DialogContent.displayName = DialogPrimitive.Content.displayName

const DialogHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => {
  const isMobile = useIsMobile()
  return (
    <div
      className={cn(
        "flex flex-col space-y-1.5",
        isMobile ? "text-left" : "text-center sm:text-left",
        className
      )}
      {...props}
    />
  )
}
DialogHeader.displayName = "DialogHeader"

const DialogFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => {
  const isMobile = useIsMobile()
  return (
    <div
      className={cn(
        isMobile
          ? "flex flex-col gap-3 mt-4"
          : "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-2.5",
        className
      )}
      {...props}
    />
  )
}
DialogFooter.displayName = "DialogFooter"

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => {
  const isMobile = useIsMobile()
  return (
    <DialogPrimitive.Title
      ref={ref}
      className={cn(
        "font-semibold leading-tight tracking-tight",
        isMobile ? "text-lg text-foreground" : "text-base text-foreground",
        className
      )}
      {...props}
    />
  )
})
DialogTitle.displayName = DialogPrimitive.Title.displayName

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => {
  const isMobile = useIsMobile()
  return (
    <DialogPrimitive.Description
      ref={ref}
        className={cn(
          "text-sm leading-relaxed",
          "text-muted-foreground",
          className
        )}
        {...props}
      />
  )
})
DialogDescription.displayName = DialogPrimitive.Description.displayName

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogClose,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
}
