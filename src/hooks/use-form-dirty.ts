"use client";

import { useState } from "react";

/**
 * Whether a sheet's form has been touched since it opened, for BottomSheet's
 * `dirty` (a stray backdrop tap or drag must not throw typed input away).
 * Attach `markDirty` to the form's onChange and call `reset` on open.
 */
export function useFormDirty() {
  const [dirty, setDirty] = useState(false);
  return { dirty, markDirty: () => setDirty(true), reset: () => setDirty(false) };
}
