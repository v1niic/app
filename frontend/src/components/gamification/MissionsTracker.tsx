import { formatKm } from "@/lib/types";
import type { MissionProgress } from "@/lib/types";
import { cn } from "@/lib/utils";

export default function MissionsTracker({ missions }: { missions: MissionProgress[] }) {
  if (missions.length === 0) {
    return <p className="text-sm text-slate-400">Nenhuma missão disponível agora — volte logo.</p>;
  }

  return (
    <ul className="space-y-3">
      {missions.map((m) => {
        const pct = Math.min(100, (m.progress / m.target) * 100);
        const shown = Math.min(m.progress, m.target);
        const progressLabel =
          m.metric === "km"
            ? `${formatKm(shown)} / ${formatKm(m.target)}`
            : `${Math.floor(shown)} / ${Math.floor(m.target)}`;
        return (
          <li
            key={m.id}
            data-testid={`mission-item-${m.id}`}
            className={cn(
              "rounded-xl border p-4 transition-colors",
              m.completed ? "border-emerald-500/40 bg-emerald-500/5" : "border-slate-800 bg-slate-900/50",
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="flex items-center gap-2 font-heading text-sm font-bold text-white">
                  {m.title}
                  {m.completed && (
                    <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-400">
                      Completa
                    </span>
                  )}
                </h3>
                <p className="mt-0.5 text-xs text-slate-400">{m.desc}</p>
              </div>
              <span className="shrink-0 rounded-full bg-emerald-500/10 px-2 py-1 text-[11px] font-bold text-emerald-400">
                +{m.reward_xp} XP
              </span>
            </div>
            <div className="mt-3 flex items-center gap-3">
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-800">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all duration-500"
                  style={{ width: `${pct}%` }}
                  data-testid={`mission-progress-${m.id}`}
                />
              </div>
              <span className="font-mono text-xs text-slate-300">{progressLabel}</span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
