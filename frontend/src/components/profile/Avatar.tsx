import { cn } from "@/lib/utils";

interface Props {
  name: string;
  /** data URL da foto; vazio = mostra a inicial do nome */
  src?: string;
  className?: string;
  textClassName?: string;
}

/** Foto de perfil redonda, ou a inicial do nome quando o usuário ainda não enviou uma. */
export default function Avatar({ name, src, className, textClassName }: Props) {
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-emerald-500/15 font-heading font-black text-emerald-400",
        className,
      )}
      data-testid="avatar"
    >
      {src ? (
        <img src={src} alt={`Foto de ${name}`} className="h-full w-full object-cover" draggable={false} />
      ) : (
        <span className={textClassName}>{name.charAt(0).toUpperCase()}</span>
      )}
    </span>
  );
}
