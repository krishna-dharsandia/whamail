"use client";

import { useEffect, useRef, useState, useCallback } from "react";

const ROW_HEIGHT = 40; // px per table row
const HEADER_HEIGHT = 41; // thead height
const PAGINATION_HEIGHT = 52; // pagination bar height
const BUFFER = 16; // breathing room

/**
 * Auto-calculates how many rows fit in available container height.
 * Returns a ref to attach to the table container and the computed pageSize.
 */
export function useTableHeight(minRows = 5) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pageSize, setPageSize] = useState(minRows);

  const recalc = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const available = el.clientHeight - HEADER_HEIGHT - PAGINATION_HEIGHT - BUFFER;
    const rows = Math.max(minRows, Math.floor(available / ROW_HEIGHT));
    setPageSize(rows);
  }, [minRows]);

  useEffect(() => {
    recalc();
    const observer = new ResizeObserver(recalc);
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [recalc]);

  return { containerRef, pageSize };
}
