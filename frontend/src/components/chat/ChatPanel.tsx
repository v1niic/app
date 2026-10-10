import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { SendHorizontal, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { apiDelete, apiDetail, apiGet, apiPost } from "@/lib/api";
import type { ChatMessage, User } from "@/lib/types";
import { cn } from "@/lib/utils";

const MAX_CHARS = 500;
const POLL_MS = 4000;
const NEAR_BOTTOM_PX = 120;

/** Conversa global dos ciclistas. Atualiza a cada 4 s (a hospedagem não tem WebSocket). */
export default function ChatPanel({ user }: { user: User }) {
  const queryClient = useQueryClient();
  const [text, setText] = useState("");
  const listRef = useRef<HTMLDivElement | null>(null);
  const stickRef = useRef(true); // só rola sozinho se a pessoa já estava no fim
  const forceRef = useRef(false);

  const { data: messages = [], isLoading } = useQuery({
    queryKey: ["chat"],
    queryFn: () => apiGet<ChatMessage[]>("/chat/messages?limit=60"),
    refetchInterval: POLL_MS,
  });

  const sendMutation = useMutation({
    mutationFn: (body: string) => apiPost<ChatMessage>("/chat/messages", { text: body }),
    onSuccess: () => {
      setText("");
      forceRef.current = true;
      void queryClient.invalidateQueries({ queryKey: ["chat"] });
    },
    onError: (err) => toast.error(apiDetail(err, "Não foi possível enviar a mensagem")),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiDelete(`/chat/messages/${id}`),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["chat"] }),
    onError: (err) => toast.error(apiDetail(err, "Não foi possível apagar")),
  });

  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el) return;
    if (stickRef.current || forceRef.current) {
      el.scrollTop = el.scrollHeight;
      forceRef.current = false;
    }
  }, [messages]);

  useEffect(() => {
    // primeira carga: desce até a última mensagem
    stickRef.current = true;
  }, []);

  const onScroll = () => {
    const el = listRef.current;
    if (!el) return;
    stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
  };

  const send = (e?: FormEvent) => {
    e?.preventDefault();
    const body = text.trim();
    if (!body || sendMutation.isPending) return;
    sendMutation.mutate(body);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="chat-panel">
      <div ref={listRef} onScroll={onScroll} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-1 py-3" data-testid="chat-list">
        {isLoading ? (
          <div className="h-24 animate-pulse rounded-xl bg-slate-800/60" />
        ) : messages.length === 0 ? (
          <p className="py-10 text-center text-sm text-slate-400" data-testid="chat-empty">
            Ninguém falou por aqui ainda. Seja o primeiro a dar um oi!
          </p>
        ) : (
          messages.map((m) => {
            const mine = m.user_id === user.id;
            return (
              <div key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")} data-testid="chat-message">
                <div
                  className={cn(
                    "max-w-[85%] rounded-2xl px-3.5 py-2 sm:max-w-[70%]",
                    mine ? "rounded-br-md bg-emerald-500 text-[#022C22]" : "rounded-bl-md bg-slate-800 text-slate-100",
                  )}
                >
                  {!mine && (
                    <p className="mb-0.5 text-[11px] font-semibold text-emerald-300">
                      {m.user_name} <span className="font-normal text-slate-500">Nv. {m.user_level}</span>
                    </p>
                  )}
                  <p className="whitespace-pre-wrap break-words text-sm leading-snug">{m.text}</p>
                  <p className={cn("mt-1 flex items-center justify-end gap-2 text-[10px]", mine ? "text-emerald-950/70" : "text-slate-500")}>
                    {format(new Date(m.created_at), "HH:mm")}
                    {mine && (
                      <button
                        type="button"
                        onClick={() => deleteMutation.mutate(m.id)}
                        aria-label="Apagar mensagem"
                        className="hover:text-red-900"
                        data-testid="chat-delete"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                  </p>
                </div>
              </div>
            );
          })
        )}
      </div>

      <form onSubmit={send} className="border-t border-slate-800 pt-3" data-testid="chat-form">
        <div className="flex items-end gap-2">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKeyDown}
            maxLength={MAX_CHARS}
            rows={1}
            placeholder="Escreva para os ciclistas…"
            aria-label="Mensagem"
            className="max-h-32 min-h-10 resize-none"
            data-testid="chat-input"
          />
          <Button type="submit" size="lg" disabled={!text.trim() || sendMutation.isPending} aria-label="Enviar" data-testid="chat-send">
            <SendHorizontal className="h-4 w-4" />
          </Button>
        </div>
        <p className="mt-1.5 text-[11px] leading-snug text-slate-500">
          {text.length > MAX_CHARS - 80 ? `${text.length}/${MAX_CHARS} · ` : ""}
          Seja gentil e não divulgue endereço de casa, telefone ou outros dados pessoais. As mensagens somem em 7 dias.
        </p>
      </form>
    </div>
  );
}
