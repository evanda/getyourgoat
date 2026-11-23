interface ImportMetaEnv {
  /** "1" builds the alpha-test version (round picker, feedback). */
  readonly VITE_ALPHA?: string;
  /** Full URL of the feedback Worker's POST /submit endpoint. */
  readonly VITE_FEEDBACK_URL?: string;
}
