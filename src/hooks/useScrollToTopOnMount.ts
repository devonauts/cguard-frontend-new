import { useEffect } from "react";

function findScrollParent(node: HTMLElement | null): HTMLElement | Window {
  if (!node) return window;
  let parent: HTMLElement | null = node.parentElement;

  while (parent) {
    try {
      const style = window.getComputedStyle(parent);
      const overflowY = style.getPropertyValue("overflow-y");

      if (
        (overflowY === "auto" || overflowY === "scroll") &&
        parent.scrollHeight > parent.clientHeight
      )
        return parent;
    } catch (e) {
      // ignore and continue
    }
    parent = parent.parentElement;
  }

  return window;
}

export default function useScrollToTopOnMount(
  ref?: { current: HTMLElement | null } | null,
) {
  useEffect(() => {
    if (typeof window === "undefined") return;

    const doScroll = (behavior: ScrollBehavior = "auto") => {
      try {
        const el = ref && ref.current ? ref.current : null;
        const sp = findScrollParent(el as HTMLElement | null);

        if (sp === window) {
          try {
            window.scrollTo({ top: 0, left: 0, behavior });
          } catch {
            window.scrollTo(0, 0);
          }
        } else {
          try {
            (sp as HTMLElement).scrollTo({ top: 0, left: 0, behavior });
          } catch {
            (sp as HTMLElement).scrollTop = 0;
          }
        }
      } catch (e) {
        try {
          window.scrollTo(0, 0);
        } catch {}
      }
    };

    // immediate + delayed attempts for async rendering
    doScroll("auto");
    const t1 = window.setTimeout(() => doScroll("auto"), 50);
    const t2 = window.setTimeout(() => doScroll("auto"), 300);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);
}
