import { useState } from "react";
import type { FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { KeyRound, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiDetail, apiPost } from "@/lib/api";
import { endSession } from "@/lib/session";

/** Troca de senha e exclusão definitiva da conta (LGPD). */
export default function AccountSecurity() {
  const navigate = useNavigate();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");

  const passwordMutation = useMutation({
    mutationFn: () => apiPost("/auth/password", { current_password: current, new_password: next }),
    onSuccess: () => {
      setCurrent("");
      setNext("");
      toast.success("Senha alterada. Os outros aparelhos foram desconectados.");
    },
    onError: (err) => toast.error(apiDetail(err, "Não foi possível alterar a senha")),
  });

  const deleteMutation = useMutation({
    mutationFn: () => apiPost("/auth/delete-account", { password: deletePassword }),
    onSuccess: async () => {
      await endSession();
      navigate("/");
      toast.success("Conta excluída. Obrigado por pedalar com a gente.");
    },
    onError: (err) => toast.error(apiDetail(err, "Não foi possível excluir a conta")),
  });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (next.length < 6) {
      toast.error("A nova senha precisa ter pelo menos 6 caracteres");
      return;
    }
    passwordMutation.mutate();
  };

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-5" data-testid="profile-security">
      <h2 className="font-heading text-lg font-bold text-white">Conta e segurança</h2>

      <form onSubmit={onSubmit} className="mt-4 space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="pw-current" className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Senha atual
          </Label>
          <Input
            id="pw-current"
            type="password"
            autoComplete="current-password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            data-testid="pw-current"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pw-new" className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Nova senha
          </Label>
          <Input
            id="pw-new"
            type="password"
            autoComplete="new-password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            minLength={6}
            maxLength={100}
            data-testid="pw-new"
          />
        </div>
        <Button type="submit" disabled={passwordMutation.isPending || !current || !next} data-testid="pw-submit">
          <KeyRound className="h-4 w-4" /> {passwordMutation.isPending ? "Salvando…" : "Alterar senha"}
        </Button>
      </form>

      <div className="mt-6 border-t border-slate-800 pt-4">
        <p className="text-sm font-semibold text-white">Excluir minha conta</p>
        <p className="mt-1 text-xs leading-relaxed text-slate-400">
          Apaga seu perfil, selos, XP e histórico de pedais para sempre. Os alertas que você reportou continuam no mapa
          para proteger outros ciclistas.
        </p>
        {!confirmDelete ? (
          <Button variant="outline" size="sm" className="mt-3" onClick={() => setConfirmDelete(true)} data-testid="delete-start">
            <Trash2 className="h-4 w-4" /> Excluir conta
          </Button>
        ) : (
          <div className="mt-3 space-y-2 rounded-lg border border-red-500/40 bg-red-500/5 p-3">
            <Label htmlFor="pw-delete" className="text-xs text-red-200">
              Digite sua senha para confirmar
            </Label>
            <Input
              id="pw-delete"
              type="password"
              autoComplete="current-password"
              value={deletePassword}
              onChange={(e) => setDeletePassword(e.target.value)}
              data-testid="delete-password"
            />
            <div className="flex gap-2">
              <Button
                variant="destructive"
                size="sm"
                disabled={deleteMutation.isPending || !deletePassword}
                onClick={() => deleteMutation.mutate()}
                data-testid="delete-confirm"
              >
                {deleteMutation.isPending ? "Excluindo…" : "Excluir definitivamente"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setConfirmDelete(false);
                  setDeletePassword("");
                }}
              >
                Cancelar
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
