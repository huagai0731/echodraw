import { useEffect, useRef, useState } from "react";

type SnapCarouselOptions = {
  items: number;
  initialIndex?: number;
};

type SnapCarouselResult = {
  containerRef: (element: HTMLDivElement | null) => void;
  activeIndex: number;
};

function useSnapCarousel({ items, initialIndex = 0 }: SnapCarouselOptions): SnapCarouselResult {
  const elementRef = useRef<HTMLDivElement | null>(null);
  const initializedRef = useRef(false);
  const [activeIndex, setActiveIndex] = useState(() => {
    if (initialIndex >= 0 && initialIndex < items) {
      return initialIndex;
    }
    return 0;
  });

  useEffect(() => {
    const element = elementRef.current;
    if (!element || items <= 0) {
      return;
    }

    const handleScroll = () => {
      const { scrollLeft, offsetWidth } = element;
      const children = Array.from(element.children) as HTMLElement[];
      if (!children.length) {
        return;
      }

      const center = scrollLeft + offsetWidth / 2;

      let nearestIndex = 0;
      let nearestDistance = Number.POSITIVE_INFINITY;

      children.forEach((child, index) => {
        const cardCenter = child.offsetLeft + child.offsetWidth / 2;
        const distance = Math.abs(cardCenter - center);
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearestIndex = index;
        }
      });

      setActiveIndex(nearestIndex);
    };

    const onScroll = () => window.requestAnimationFrame(handleScroll);

    handleScroll();

    element.addEventListener("scroll", onScroll, { passive: true });

    const resizeObserver = new ResizeObserver(handleScroll);
    resizeObserver.observe(element);

    return () => {
      element.removeEventListener("scroll", onScroll);
      resizeObserver.disconnect();
    };
  }, [items]);

  useEffect(() => {
    const element = elementRef.current;
    if (!element || items <= 0) {
      return;
    }

    const boundedIndex = Math.min(Math.max(initialIndex, 0), items - 1);
    const children = Array.from(element.children) as HTMLElement[];
    const target = children[boundedIndex];
    if (!target) {
      return;
    }

    const scrollOffset = target.offsetLeft - (element.clientWidth - target.offsetWidth) / 2;
    element.scrollTo({
      left: scrollOffset,
      behavior: initializedRef.current ? "smooth" : "auto",
    });
    initializedRef.current = true;
    setActiveIndex(boundedIndex);
  }, [initialIndex, items]);

  const setRef = (node: HTMLDivElement | null) => {
    elementRef.current = node;
  };

  return { containerRef: setRef, activeIndex };
}

export default useSnapCarousel;



