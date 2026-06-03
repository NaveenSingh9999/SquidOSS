import * as React from "react"
import * as AlertDialogPrimitive from "@radix-ui/react-alert-dialog"

import { cn } from "@/lib/utils"
import { buttonVariants } from "@/components/ui/button"
import { useIsMobile } from "@/hooks/use-mobile"

const AlertDialog = AlertDialogPrimitive.Root

const AlertDialogTrigger = AlertDialogPrimitive.Trigger

const AlertDialogPortal = AlertDialogPrimitive.Portal

const AlertDialogOverlay = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <AlertDialogPrimitive.Overlay
    className={cn(
      "fixed inset-0 z-50 bg-black/80 opacity-0 data-[state=open]:opacity-100 transition-opacity duration-200 ease-out will-change-opacity",
      className
    )}
    {...props}
    ref={ref}
  />
))
AlertDialogOverlay.displayName = AlertDialogPrimitive.Overlay.displayName

const AlertDialogContent = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Content>
>(({ className, children, ...props }, ref) => {
  const isMobile = useIsMobile()
  
  return (
    <AlertDialogPortal>
      <AlertDialogOverlay />
      <AlertDialogPrimitive.Content
        ref={ref}
        className={cn(
          "fixed z-50 grid w-full gap-4 border shadow-lg",
          "transition-all duration-200 ease-out will-change-opacity will-change-transform",
          isMobile ? [
            "left-0 right-0 bottom-0 top-auto",
            "translate-y-full data-[state=open]:translate-y-0",
            "max-w-full mx-0 rounded-t-3xl rounded-b-none",
            "bg-card/98 backdrop-blur-2xl border-border/40 border-b-0",
            "p-5 pb-8",
            "max-h-[90vh] overflow-y-auto",
          ].join(" ") : [
            "left-[50%] top-[50%] translate-x-[-50%] translate-y-[-50%]",
            "max-w-md rounded-2xl",
            "bg-card border-border/50 p-6",
            "opacity-0 scale-[0.96] data-[state=open]:opacity-100 data-[state=open]:scale-100",
          ].join(" "),
          className
        )}
        {...props}
      >
        {/* Mobile drag indicator */}
        {isMobile && (
          <div className="flex justify-center -mt-1 mb-3">
            <div className="w-10 h-1 bg-white/20 rounded-full" />
          </div>
        )}
        {children}
      </AlertDialogPrimitive.Content>
    </AlertDialogPortal>
  )
})
AlertDialogContent.displayName = AlertDialogPrimitive.Content.displayName

const AlertDialogHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => {
  const isMobile = useIsMobile()
  
  return (
    <div
      className={cn(
        "flex flex-col space-y-2",
        isMobile ? "text-left" : "text-center sm:text-left",
        className
      )}
      {...props}
    />
  )
}
AlertDialogHeader.displayName = "AlertDialogHeader"

const AlertDialogFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => {
  const isMobile = useIsMobile()
  
  return (
    <div
      className={cn(
        isMobile 
          ? "flex flex-col gap-3 mt-4"
          : "flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2",
        className
      )}
      {...props}
    />
  )
}
AlertDialogFooter.displayName = "AlertDialogFooter"

const AlertDialogTitle = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Title>
>(({ className, ...props }, ref) => {
  const isMobile = useIsMobile()
  
  return (
    <AlertDialogPrimitive.Title
      ref={ref}
      className={cn(
        "font-semibold",
        isMobile ? "text-lg text-blue-50" : "text-lg",
        className
      )}
      {...props}
    />
  )
})
AlertDialogTitle.displayName = AlertDialogPrimitive.Title.displayName

const AlertDialogDescription = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Description>
>(({ className, ...props }, ref) => {
  const isMobile = useIsMobile()
  
  return (
    <AlertDialogPrimitive.Description
      ref={ref}
      className={cn(
        "text-sm",
        isMobile ? "text-blue-200/60" : "text-muted-foreground",
        className
      )}
      {...props}
    />
  )
})
AlertDialogDescription.displayName =
  AlertDialogPrimitive.Description.displayName

const AlertDialogAction = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Action>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Action>
>(({ className, ...props }, ref) => {
  const isMobile = useIsMobile()
  
  return (
    <AlertDialogPrimitive.Action
      ref={ref}
      className={cn(
        buttonVariants(),
        isMobile && "h-12 rounded-xl text-base font-medium",
        className
      )}
      {...props}
    />
  )
})
AlertDialogAction.displayName = AlertDialogPrimitive.Action.displayName

const AlertDialogCancel = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Cancel>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Cancel>
>(({ className, ...props }, ref) => {
  const isMobile = useIsMobile()
  
  return (
    <AlertDialogPrimitive.Cancel
      ref={ref}
      className={cn(
        buttonVariants({ variant: "outline" }),
        isMobile
          ? "h-12 rounded-xl text-base font-medium bg-muted/40 border-border/40 text-foreground hover:bg-muted/60"
          : "mt-2 sm:mt-0",
        className
      )}
      {...props}
    />
  )
})
AlertDialogCancel.displayName = AlertDialogPrimitive.Cancel.displayName

export {
  AlertDialog,
  AlertDialogPortal,
  AlertDialogOverlay,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
}
