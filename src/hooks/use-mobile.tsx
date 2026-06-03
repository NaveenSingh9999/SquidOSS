
import * as React from "react"

const MOBILE_BREAKPOINT = 768

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined)
  const [isInitialized, setIsInitialized] = React.useState(false)

  React.useEffect(() => {
    // Ensure we're in a browser environment and React is ready
    if (typeof window === 'undefined') {
      return
    }

    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    }
    
    // Set initial value and mark as initialized
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    setIsInitialized(true)
    
    mql.addEventListener("change", onChange)
    return () => mql.removeEventListener("change", onChange)
  }, [])

  // Return false during SSR/initial render, true value only after initialization
  return isInitialized ? !!isMobile : false
}
