import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, CircleHelp, KeyRound, LogOut, ShieldAlert, UserCog } from "lucide-react";

import { AccountSection, DangerSection, HelpSection, PasswordSection } from "@/components/settings/sections";
import { useAuth } from "@/hooks/useAuth";
import { endSession } from "@/lib/session";
import { cn } from "@/lib/utils";

const SECTIONS = [
  { id: "conta", label: "Conta", desc: "Nome de usuário e e-mail", icon: UserCog },
  { id: "senha", label: "Senha", desc: "Alterar a senha de acesso", icon: KeyRound },
  { id: "ajuda", label: "Ajuda", desc: "Rever o tutorial do app", icon: CircleHelp },
  { id: "zona-de-risco", label: "Desativar ou excluir", desc: "Pausar ou apagar a conta", icon: ShieldAlert },
] as const;

type SectionId = (typeof SECTIONS)[number]["id"];

/** Configurações: no computador, menu à esquerda + conteúdo; no celular, uma lista que abre cada seção. */
export default function SettingsPage() {
  const { data: user, isLoading } = useAuth();
  const { secao } = useParams();
  const navigate = useNavigate();

  if (isLoading) return <div className="mx-auto mt-10 h-40 max-w-4xl animate-pulse rounded-xl bg-slate-800/60" />;
  if (!user) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center text-sm text-slate-400">
        Entre na sua conta para abrir as configurações.{" "}
        <Link to="/login" className="font-semibold text-emerald-400 hover:underline">Entrar</Link>
      </div>
    );
  }

  const valid = SECTIONS.some((s) => s.id === secao);
  if (secao && !valid) return <Navigate to="/configuracoes" replace />;
  const current = (secao as SectionId | undefined) ?? undefined;

  const logout = async () => {
    await endSession();
    navigate("/");
    toast.success("Sessão encerrada. Boa pedalada!");
  };

  const menu = (
    <nav className="space-y-1.5" aria-label="Seções das configurações">
      {SECTIONS.map((s) => {
        const active = (current ?? "conta") === s.id;
        return (
          <Link
            key={s.id}
            to={`/configuracoes/${s.id}`}
            data-testid={`settings-nav-${s.id}`}
            className={cn(
              "flex items-center gap-3 rounded-xl border px-3.5 py-3 transition-colors",
              active ? "border-emerald-500/40 bg-emerald-500/10" : "border-slate-800 bg-slate-900/50 hover:border-slate-700",
              // no desktop, o item ativo é só destaque; no celular a lista inteira é navegação
            )}
          >
            <span className={cn("flex h-9 w-9 items-center justify-center rounded-lg", active ? "bg-emerald-500/20 text-emerald-400" : "bg-slate-800 text-slate-300")}>
              <s.icon className="h-4.5 w-4.5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-white">{s.label}</span>
              <span className="block truncate text-xs text-slate-400">{s.desc}</span>
            </span>
            <ChevronRight className="h-4 w-4 text-slate-500 md:hidden" />
          </Link>
        );
      })}
      <button
        type="button"
        onClick={logout}
        data-testid="profile-logout"
        className="flex w-full items-center gap-3 rounded-xl border border-slate-800 bg-slate-900/50 px-3.5 py-3 text-left transition-colors hover:border-red-500/40"
      >
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-red-500/10 text-red-400">
          <LogOut className="h-4.5 w-4.5" />
        </span>
        <span className="text-sm font-semibold text-red-300">Sair da conta</span>
      </button>
    </nav>
  );

  const shown = current ?? "conta";
  const content = (
    <div data-testid={`settings-section-${shown}`}>
      {shown === "conta" && <AccountSection user={user} />}
      {shown === "senha" && <PasswordSection />}
      {shown === "ajuda" && <HelpSection />}
      {shown === "zona-de-risco" && <DangerSection />}
    </div>
  );

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 pb-24 md:pb-10" data-testid="settings-page">
      <div className="mb-6 flex items-center gap-2">
        {current && (
          <Link to="/configuracoes" aria-label="Voltar às configurações" className="rounded-lg p-1.5 text-slate-300 hover:bg-slate-800 md:hidden">
            <ChevronLeft className="h-5 w-5" />
          </Link>
        )}
        <h1 className="font-heading text-2xl font-black tracking-tight text-white">Configurações</h1>
        <Link to="/profile" className="ml-auto text-xs font-semibold text-emerald-400 hover:underline">Voltar ao perfil</Link>
      </div>

      {/* celular: ou a lista, ou a seção. computador: os dois lado a lado */}
      <div className="md:grid md:grid-cols-[250px_1fr] md:gap-8">
        <div className={cn(current ? "hidden md:block" : "block")}>{menu}</div>
        <div className={cn(current ? "block" : "hidden md:block")}>{content}</div>
      </div>
    </div>
  );
}
