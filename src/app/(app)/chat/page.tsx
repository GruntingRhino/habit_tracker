import ChatThread from "@/components/ChatThread";
import ScoreBoard from "@/components/ScoreBoard";

export default function ChatPage() {
  return (
    <div className="min-page flex h-[calc(100dvh-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px)-92px)] flex-col lg:h-[calc(100vh-4.25rem)]">
      <ChatThread background={<ScoreBoard />} />
    </div>
  );
}
