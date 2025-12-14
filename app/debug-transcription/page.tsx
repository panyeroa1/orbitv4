"use client";

import { TranscriptionSidebarStandalone } from "@/components/transcription-sidebar-standalone";

export default function DebugTranscriptionPage() {
  return (
    <div className="flex h-screen items-center justify-center bg-dark-2">
      <TranscriptionSidebarStandalone onClose={() => console.log('Close clicked')} />
    </div>
  );
}
