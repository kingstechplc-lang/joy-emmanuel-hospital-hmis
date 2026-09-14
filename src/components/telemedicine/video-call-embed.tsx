"use client";

import { useEffect, useRef } from "react";

export function VideoCallEmbed({
  roomUrl,
  onLeave,
  className,
}: {
  roomUrl: string;
  onLeave?: () => void;
  className?: string;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.event === "left-meeting" && onLeave) {
        onLeave();
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [onLeave]);

  return (
    <div className={`relative w-full h-full bg-slate-900 rounded-xl overflow-hidden ${className || ""}`}>
      <iframe
        ref={iframeRef}
        src={roomUrl}
        allow="camera; microphone; fullscreen; display-capture; autoplay; clipboard-read; clipboard-write"
        className="w-full h-full border-0"
        title="Video Consultation"
      />
    </div>
  );
}
