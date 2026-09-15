"use client";

import { useEffect, useRef, useState } from "react";
import { Maximize, Minimize } from "lucide-react";
import { Button } from "@/components/ui/button";

export function VideoCallEmbed({
  roomUrl,
  onLeave,
  className,
}: {
  roomUrl: string;
  onLeave?: () => void;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.event === "left-meeting" && onLeave) onLeave();
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [onLeave]);

  // Track fullscreen changes
  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      containerRef.current.requestFullscreen();
    }
  };

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-full bg-slate-900 rounded-xl overflow-hidden ${className || ""} ${isFullscreen ? "rounded-none" : ""}`}
    >
      <iframe
        src={roomUrl}
        allow="camera; microphone; fullscreen; display-capture; autoplay; clipboard-read; clipboard-write"
        className="w-full h-full border-0"
        title="Video Consultation"
      />
      {/* Fullscreen toggle button — top-right corner of the video */}
      <Button
        size="icon"
        variant="secondary"
        onClick={toggleFullscreen}
        className="absolute top-2 right-2 z-10 h-8 w-8 bg-black/50 hover:bg-black/70 text-white border-0"
        title={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
      >
        {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
      </Button>
    </div>
  );
}
