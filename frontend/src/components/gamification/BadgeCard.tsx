import { Bike, Eye, Lock, ShieldCheck, Trophy, Waves } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { BADGE_TIER_COLORS } from "@/lib/types";
import type { BadgeDef } from "@/lib/types";
import { cn } from "@/lib/utils";

const ICONS: Record<string, LucideIcon> = { Bike, Eye, Waves, ShieldCheck, Trophy };

export default function BadgeCard({ badge, unlocked }: { badge: BadgeDef; unlocked: boolean }) {
  const Icon = ICONS[badge.icon] ?? Trophy;
  const tierColor = BADGE_TIER_COLORS[badge.tier] ?? "#94A3B8";

  return (
    <div
      data-testid={`badge-card-${badge.id}`}
      className={cn(
        "relative rounded-xl border p-4 transition-all duration-200",
        unlocked
          ? "bg-slate-900/60 hover:-translate-y-1"
          : "border-slate-800 bg-slate-900/30 opacity-70",
      )}
      style={
        unlocked
          ? { boxShadow: `0 0 24px ${tierColor}22`, borderColor: `${tierColor}55` }
          : undefined
      }
    >
      <div className="flex items-start justify-between">
        <span
          className="flex h-11 w-11 items-center justify-center rounded-full border"
          style={
            unlocked
              ? { borderColor: tierColor, color: tierColor, background: `${tierColor}1a` }
              : { borderColor: "#334155", color: "#475569" }
          }
        >
          {unlocked ? <Icon className="h-5 w-5" /> : <Lock className="h-5 w-5" />}
        </span>
        <span
          className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
          style={
            unlocked
              ? { background: `${tierColor}22`, color: tierColor }
              : { background: "#1E293B", color: "#64748B" }
          }
        >
          {badge.tier}
        </span>
      </div>
      <h3 className={cn("mt-3 font-heading text-sm font-bold", unlocked ? "text-white" : "text-slate-400")}>
        {badge.name}
      </h3>
      <p className="mt-1 text-xs leading-relaxed text-slate-400">{badge.desc}</p>
      <p
        className="mt-2 text-[10px] font-semibold uppercase tracking-wider"
        style={{ color: unlocked ? "#34D399" : "#475569" }}
      >
        {unlocked ? "Conquistado" : "Bloqueado"}
      </p>
    </div>
  );
}
