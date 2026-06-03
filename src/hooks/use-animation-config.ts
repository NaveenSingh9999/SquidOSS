import { useReducedMotion } from './use-reduced-motion';
import type { Transition, Variant } from 'framer-motion';

/**
 * Central animation configuration hook that respects user's reduced motion preferences
 *
 * Returns animation variants and transitions that automatically adapt based on
 * the user's prefers-reduced-motion setting. When reduced motion is preferred,
 * all animations fall back to simple opacity transitions without transforms.
 */
export function useAnimationConfig() {
  const prefersReducedMotion = useReducedMotion();

  // Reduced motion fallback: simple opacity fade, no transforms
  const reducedMotionVariants = {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
  };

  const reducedMotionTransition: Transition = {
    duration: 0.1,
    ease: 'easeOut',
  };

  // Full motion configurations
  const configs = {
    // Page transitions
    page: prefersReducedMotion
      ? reducedMotionVariants
      : {
          initial: { opacity: 0, y: 4 },
          animate: { opacity: 1, y: 0 },
          exit: { opacity: 0, y: -4 },
        },
    pageTransition: prefersReducedMotion
      ? reducedMotionTransition
      : {
          duration: 0.2,
          ease: [0.25, 0.1, 0.25, 1.0],
        },

    // Modal/Dialog/Sheet
    modal: prefersReducedMotion
      ? reducedMotionVariants
      : {
          initial: { opacity: 0, scale: 0.98 },
          animate: { opacity: 1, scale: 1 },
          exit: { opacity: 0, scale: 0.98 },
        },
    modalTransition: prefersReducedMotion
      ? reducedMotionTransition
      : {
          type: 'spring',
          stiffness: 380,
          damping: 30,
        },
    modalExit: prefersReducedMotion
      ? reducedMotionTransition
      : {
          duration: 0.12,
          ease: 'easeOut',
        },

    // Dropdown/Popover
    dropdown: prefersReducedMotion
      ? reducedMotionVariants
      : {
          initial: { opacity: 0, scale: 0.96, y: -4 },
          animate: { opacity: 1, scale: 1, y: 0 },
          exit: { opacity: 0, scale: 0.96, y: -4 },
        },
    dropdownTransition: prefersReducedMotion
      ? reducedMotionTransition
      : {
          duration: 0.13,
          ease: 'easeOut',
        },
    dropdownExit: prefersReducedMotion
      ? reducedMotionTransition
      : {
          duration: 0.1,
          ease: 'easeOut',
        },

    // List items (stagger)
    listItem: prefersReducedMotion
      ? reducedMotionVariants
      : {
          initial: { opacity: 0, y: 6 },
          animate: { opacity: 1, y: 0 },
        },
    listItemTransition: prefersReducedMotion
      ? reducedMotionTransition
      : {
          duration: 0.2,
          ease: 'easeOut',
        },
    staggerChildren: prefersReducedMotion ? 0 : 0.035,

    // Toast notifications
    toast: prefersReducedMotion
      ? reducedMotionVariants
      : {
          initial: { opacity: 0, y: 20 },
          animate: { opacity: 1, y: 0 },
          exit: { opacity: 0 },
        },
    toastTransition: prefersReducedMotion
      ? reducedMotionTransition
      : {
          type: 'spring',
          stiffness: 400,
          damping: 28,
        },
    toastExit: prefersReducedMotion
      ? reducedMotionTransition
      : {
          duration: 0.1,
          ease: 'easeOut',
        },

    // Card hover lift
    cardHover: prefersReducedMotion
      ? {}
      : {
          y: -2,
        },
    cardTransition: prefersReducedMotion
      ? reducedMotionTransition
      : {
          duration: 0.18,
          ease: 'easeOut',
        },

    // Button press
    buttonPress: prefersReducedMotion
      ? {}
      : {
          scale: 0.96,
        },
    buttonTransition: prefersReducedMotion
      ? reducedMotionTransition
      : {
          duration: 0.08,
          ease: 'easeOut',
        },
  };

  return {
    ...configs,
    prefersReducedMotion,
  };
}
