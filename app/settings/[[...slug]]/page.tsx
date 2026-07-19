import { Chatbot } from "@/app/components/chatbot";
import { QueryProvider } from "@/app/components/query-provider";
import { Shell } from "@/app/components/shell";
export default function SettingsPage() {
  return (
    <QueryProvider>
      <Shell>
        <Chatbot />
      </Shell>
    </QueryProvider>
  );
}
