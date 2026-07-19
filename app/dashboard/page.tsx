import { Shell } from "../components/shell";
import { Dashboard } from "./dashboard";
import { QueryProvider } from "../components/query-provider";

export default function DashboardPage() {
  return (
    <QueryProvider>
      <Shell>
        <Dashboard />
      </Shell>
    </QueryProvider>
  );
}
