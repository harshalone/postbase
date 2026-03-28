import { useState, useCallback, useRef } from "react";

const ANIMATION_DURATION_MS = 250;

export function useSlidePanel() {
  const [visible, setVisible] = useState(false);
  const [closing, setClosing] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const open = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setClosing(false);
    setVisible(true);
  }, []);

  const close = useCallback(() => {
    setClosing(true);
    timerRef.current = setTimeout(() => {
      setVisible(false);
      setClosing(false);
    }, ANIMATION_DURATION_MS);
  }, []);

  return { visible, closing, open, close };
}
