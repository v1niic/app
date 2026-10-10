import { Link } from "react-router-dom";

import Avatar from "@/components/profile/Avatar";
import FollowButton from "@/components/social/FollowButton";
import type { PublicUser } from "@/lib/types";
import { BIKE_LABELS } from "@/lib/types";

export default function PersonCard({ person }: { person: PublicUser }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-900/50 p-3 transition-colors hover:border-slate-700" data-testid="person-card">
      <Link to={`/ciclistas/${person.id}`} className="flex min-w-0 flex-1 items-center gap-3">
        <Avatar name={person.name} src={person.avatar} className="h-12 w-12" textClassName="text-lg" />
        <span className="min-w-0">
          <span className="block truncate text-sm font-bold text-white">{person.name}</span>
          <span className="block truncate text-xs text-slate-400">
            Nível {person.level} · {BIKE_LABELS[person.bike_type] ?? person.bike_type}
            {person.follows_me && " · segue você"}
          </span>
        </span>
      </Link>
      <FollowButton person={person} />
    </div>
  );
}
