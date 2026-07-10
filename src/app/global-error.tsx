"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}): React.ReactElement {
  useEffect(() => {
    console.error("[Global Error]", error);
  }, [error]);

  return (
    <html>
      <body style={{ padding: "2rem", fontFamily: "sans-serif" }}>
        <h1>Application Error</h1>
        <p>An unexpected error occurred. Please try refreshing the page.</p>
        <details style={{ marginTop: "1rem", whiteSpace: "pre-wrap" }}>
          <summary>Error details</summary>
          <p>{error.message}</p>
        </details>
        <button
          onClick={reset}
          style={{
            padding: "0.5rem 1rem",
            marginTop: "1rem",
            backgroundColor: "#007bff",
            color: "white",
            border: "none",
            borderRadius: "4px",
            cursor: "pointer",
          }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
