// UI timing and layout knobs (ARCHITECTURE.md "UI config" table). Components read these, never inline numbers.

export interface UiConfig {
  /** An LLM-graded reveal shows a skeleton this long, then switches to the "grading in background" state. */
  readonly llmPendingUiMs: number;
  /** Toast auto-dismiss. */
  readonly toastMs: number;
  /** Minimum skeleton display time so a fast response does not flash. */
  readonly skeletonMinMs: number;
  /** Minimum tap target on touch devices. */
  readonly touchTargetPx: number;
  /** Below this viewport width the lesson player stacks to one column. */
  readonly mobileBreakpointPx: number;
  /** Debounce for step-state autosave (duration / toggles) from client leaves. */
  readonly stepAutosaveDebounceMs: number;
}

export const UI_CONFIG: UiConfig = {
  llmPendingUiMs: 8000,
  toastMs: 4000,
  skeletonMinMs: 200,
  touchTargetPx: 44,
  mobileBreakpointPx: 768,
  stepAutosaveDebounceMs: 500,
};
