"""Quem é gestor (conta dev) do VaiDeBike. Sem dependências — importável de qualquer módulo."""

import os


def moderator_emails() -> set[str]:
    """E-mails com poder de aprovar alertas: variável de ambiente MODERATOR_EMAILS (separados por vírgula)."""
    raw = os.environ.get("MODERATOR_EMAILS", "")
    return {e.strip().lower() for e in raw.split(",") if e.strip()}


def is_moderator(doc: dict | None) -> bool:
    """Gestor = e-mail na lista MODERATOR_EMAILS.

    Trava de segurança: contas criadas pelo seed (id "seed-…") têm senha pública (`senha123`).
    Elas só viram gestoras depois que a senha é trocada (`password_changed`), senão qualquer pessoa
    que conheça a senha padrão poderia aprovar ou recusar alertas.
    """
    if not doc:
        return False
    if str(doc.get("email", "")).strip().lower() not in moderator_emails():
        return False
    if str(doc.get("id", "")).startswith("seed-") and not doc.get("password_changed"):
        return False
    return True
