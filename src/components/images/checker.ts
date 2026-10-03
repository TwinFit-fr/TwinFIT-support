import type { CSSProperties } from "react";

/** Transparency checkerboard behind cut-out frames. */
export const CHECKER_STYLE: CSSProperties = {
  backgroundColor: "#f4f4f5",
  backgroundImage:
    "linear-gradient(45deg,#e4e4e7 25%,transparent 25%),linear-gradient(-45deg,#e4e4e7 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#e4e4e7 75%),linear-gradient(-45deg,transparent 75%,#e4e4e7 75%)",
  backgroundSize: "12px 12px",
  backgroundPosition: "0 0,0 6px,6px -6px,-6px 0",
};
