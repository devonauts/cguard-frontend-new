import { useEffect } from "react";

const APP_NAME = "C-Guard Pro";

/**
 * Sets document.title to "<page> | C-Guard Pro" for better SEO and browser UX.
 */
export function usePageTitle(page: string) {
  useEffect(() => {
    document.title = `${page} | ${APP_NAME}`;

    return () => {
      document.title = APP_NAME;
    };
  }, [page]);
}
