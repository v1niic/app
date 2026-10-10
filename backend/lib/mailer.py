"""Envio de e-mail (recuperação de senha). Dois jeitos, escolhidos por variáveis de ambiente:

1. SMTP (ex.: Gmail com "senha de app"): SMTP_HOST, SMTP_PORT (587), SMTP_USER, SMTP_PASSWORD, MAIL_FROM
2. Resend (API HTTP): RESEND_API_KEY, MAIL_FROM

Sem nenhum dos dois, `mail_enabled()` é False e nada é enviado (o servidor só registra no log).
"""

import asyncio
import logging
import os
import smtplib
from email.message import EmailMessage

import httpx

logger = logging.getLogger(__name__)


def _from_addr() -> str:
    return os.environ.get("MAIL_FROM") or os.environ.get("SMTP_USER") or "VaiDeBike <onboarding@resend.dev>"


def mail_enabled() -> bool:
    return bool(os.environ.get("RESEND_API_KEY") or (os.environ.get("SMTP_HOST") and os.environ.get("SMTP_USER")))


def _send_smtp(to: str, subject: str, text: str, html: str) -> None:
    msg = EmailMessage()
    msg["From"] = _from_addr()
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(text)
    msg.add_alternative(html, subtype="html")
    host = os.environ["SMTP_HOST"]
    port = int(os.environ.get("SMTP_PORT", "587"))
    if port == 465:
        with smtplib.SMTP_SSL(host, port, timeout=15) as s:
            s.login(os.environ["SMTP_USER"], os.environ.get("SMTP_PASSWORD", ""))
            s.send_message(msg)
    else:
        with smtplib.SMTP(host, port, timeout=15) as s:
            s.starttls()
            s.login(os.environ["SMTP_USER"], os.environ.get("SMTP_PASSWORD", ""))
            s.send_message(msg)


async def _send_resend(to: str, subject: str, text: str, html: str) -> None:
    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.post(
            "https://api.resend.com/emails",
            headers={"Authorization": f"Bearer {os.environ['RESEND_API_KEY']}"},
            json={"from": _from_addr(), "to": [to], "subject": subject, "text": text, "html": html},
        )
        r.raise_for_status()


async def send_mail(to: str, subject: str, text: str, html: str) -> bool:
    """True se o provedor aceitou a mensagem. Nunca levanta exceção (o chamador não pode vazar se o e-mail existe)."""
    try:
        if os.environ.get("RESEND_API_KEY"):
            await _send_resend(to, subject, text, html)
        elif os.environ.get("SMTP_HOST") and os.environ.get("SMTP_USER"):
            await asyncio.to_thread(_send_smtp, to, subject, text, html)
        else:
            logger.warning("E-mail não configurado (defina SMTP_* ou RESEND_API_KEY); nada enviado")
            return False
        return True
    except Exception as exc:  # noqa: BLE001
        logger.error("Falha ao enviar e-mail: %s", type(exc).__name__)
        return False


def reset_email(name: str, link: str) -> tuple[str, str, str]:
    subject = "VaiDeBike · redefinir sua senha"
    text = (
        f"Olá, {name}!\n\nRecebemos um pedido para redefinir a senha da sua conta VaiDeBike.\n"
        f"Abra o link abaixo (vale por 1 hora):\n{link}\n\n"
        "Se não foi você, ignore este e-mail: sua senha continua a mesma."
    )
    safe = name.replace("<", "").replace(">", "")
    html = f"""<div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;padding:24px;color:#0f172a">
<h2 style="color:#059669;margin:0 0 12px">VaiDeBike</h2>
<p>Olá, {safe}!</p>
<p>Recebemos um pedido para redefinir a senha da sua conta. O link vale por <b>1 hora</b>.</p>
<p style="margin:24px 0"><a href="{link}" style="background:#10b981;color:#022c22;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold">Criar nova senha</a></p>
<p style="font-size:12px;color:#64748b">Se o botão não abrir, copie este endereço:<br>{link}</p>
<p style="font-size:12px;color:#64748b">Se não foi você, ignore este e-mail: sua senha continua a mesma.</p></div>"""
    return subject, text, html
