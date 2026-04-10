import { useEffect, useRef, useState } from "react";

interface Options extends IntersectionObserverInit {
  /**
   * When `true`, the observer disconnects after the element becomes visible
   * for the first time (useful for lazy-loading images / animations).
   */
  freezeOnceVisible?: boolean;
}

/**
 * Observe when an element enters or exits the viewport.
 *
 * Returns a ref to attach to the target element and a boolean indicating
 * whether that element is currently intersecting.
 *
 * @example — Infinite scroll sentinel:
 *   const [ref, isVisible] = useIntersectionObserver({ threshold: 0.1 });
 *   useEffect(() => {
 *     if (isVisible && hasNextPage) fetchNextPage();
 *   }, [isVisible, hasNextPage]);
 *   ...
 *   <div ref={ref} />
 */
export function useIntersectionObserver(
  options: Options = {}
): [React.RefObject<HTMLDivElement | null>, boolean] {
  const {
    threshold = 0,
    root = null,
    rootMargin = "0px",
    freezeOnceVisible = false,
  } = options;

  const ref = useRef<HTMLDivElement>(null);
  const [isIntersecting, setIsIntersecting] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    if (freezeOnceVisible && isIntersecting) return;

    const observer = new IntersectionObserver(
      ([entry]) => setIsIntersecting(entry.isIntersecting),
      { threshold, root, rootMargin }
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [threshold, root, rootMargin, freezeOnceVisible, isIntersecting]);

  return [ref, isIntersecting];
}
