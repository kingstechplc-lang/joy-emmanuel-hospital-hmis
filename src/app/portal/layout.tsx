// =====================================================================
// PATIENT PORTAL — root layout for /portal/* pages
// =====================================================================
// The staff app's globals.css applies `body { overflow: hidden }` globally
// so that the app shell (sidebar + main content area) manages its own
// scrolling. This breaks patient portal pages, which are simple
// standalone pages that rely on natural browser viewport scrolling.
//
// This layout overrides the body overflow back to `auto` while portal
// pages are mounted, then restores the original value on unmount so the
// staff app keeps its expected behavior.
// =====================================================================
"use client";
import { useEffect } from "react";

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    // Capture original values so we can restore them when the user
    // navigates away from the portal back to the staff app.
    const originalOverflow = document.body.style.overflow;
    const originalHeight = document.body.style.height;
    const originalPosition = document.body.style.position;

    // Override the globals.css `body { overflow: hidden }` rule so the
    // portal page can scroll naturally.
    document.body.style.overflow = "auto";
    document.body.style.height = "auto";
    document.body.style.position = "static";

    // Also override on <html> in case it has any overflow restrictions
    const html = document.documentElement;
    const originalHtmlOverflow = html.style.overflow;
    html.style.overflow = "auto";

    return () => {
      // Restore on unmount — important so the staff app keeps working
      document.body.style.overflow = originalOverflow;
      document.body.style.height = originalHeight;
      document.body.style.position = originalPosition;
      html.style.overflow = originalHtmlOverflow;
    };
  }, []);

  return <>{children}</>;
}
