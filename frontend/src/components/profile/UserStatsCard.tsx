import { Bike, FlagTriangleRight, Medal, ThumbsUp } from "lucide-react";

import { formatKm } from "@/lib/types";
import type { User } from "@/lib/types";

export default function UserStatsCard({ user }: { user: User }) {
  const stats = [
    { label: "Km pedalados", value: formatKm(user.total_km), icon: Bike, testid: "stat-km" },
    { label: "Alertas enviados", value: String(user.reports_count), icon: FlagTriangleRight, testid: "stat-reports" },
    { label: "Confirmações", value: String(user.confirms_count), icon: ThumbsUp, testid: "stat-confirms" },
    { label: "Selos conquistados", value: String(user.badge_ids.length), icon: Medal, testid: "stat-badges" },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="user-stats">
      {stats.map((s) => (
        <div key={s.label} data-testid={s.testid} className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
          <s.icon className="h-4 w-4 text-emerald-400" />
          <p className="mt-2 font-mono text-2xl font-bold tracking-tight text-white">{s.value}</p>
          <p className="mt-0.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">{s.label}</p>
        </div>
      ))}
    </div>
  );
}
