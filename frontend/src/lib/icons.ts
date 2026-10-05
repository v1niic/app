import { AlertTriangle, Construction, Hammer, Info, Moon } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ObstacleType } from "@/lib/types";

export const OBSTACLE_ICONS: Record<ObstacleType, LucideIcon> = {
  buraco: AlertTriangle,
  obra: Hammer,
  trecho_inacabado: Construction,
  falta_iluminacao: Moon,
  outros: Info,
};
