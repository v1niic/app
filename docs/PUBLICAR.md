# Publicar o VaiDeBike (web + app móvel)

## 1. Banco (MongoDB Atlas) — uma vez
1. Network Access → **Add IP Address → Allow access from anywhere (`0.0.0.0/0`)** (a Vercel não tem IP fixo).
2. Database Access → usuário com senha (evite `@ : / ?` na senha, ou codifique em URL).
3. Connect → Drivers → copie a string `mongodb+srv://USUARIO:SENHA@cluster.../`.

## 2. Vercel — web + API no mesmo projeto
O `vercel.json` da raiz já declara os dois serviços (`backend` FastAPI e `frontend` Vite) e as rotas `/api/*`.
1. Settings → Environment Variables, **Environments = Production (e Preview)**:
   - `MONGO_URL` = string do Atlas
   - `DB_NAME` = `vaidebike`
   - (opcional) `CORS_ORIGINS` = `https://seu-dominio.vercel.app` — sem isso a API aceita qualquer origem.
2. **Redeploy** (variável nova só vale em deploy novo).
3. Teste `https://SEU-DOMINIO/api/health`:
   - `{"ok":true,"db":"up"}` → tudo certo.
   - `"db":"down"` + `error`: `ServerSelectionTimeoutError` = IP não liberado no Atlas ou URI errada; `OperationFailure` = usuário/senha.
4. Popular o banco (ciclovias, alertas, usuário demo) rodando uma vez no seu computador:
   `cd backend && MONGO_URL="<string do Atlas>" DB_NAME=vaidebike python seed.py`

## 3. Cadastro de usuários
`/register` cria a conta e já entra; `/login`, `/profile` (editar dados, trocar senha, histórico de pedais, excluir conta).
Sessão: cookie httpOnly (web) ou `Authorization: Bearer` (app móvel — o token vem no header `X-Session-Token`).
Ainda não existe "esqueci minha senha": exige um provedor de e-mail (Resend, SendGrid…).

## 4. Versão móvel
**A) PWA (já pronto, sem loja):** abrir o site no celular → *Adicionar à tela inicial* (Chrome/Android: "Instalar app").
Abre em tela cheia, com ícone e GPS. O GPS exige HTTPS (a Vercel já entrega).

**B) App nativo (Play Store / App Store) com Capacitor** — rodar no seu computador:
```bash
cd frontend
npm i @capacitor/core @capacitor/cli @capacitor/android @capacitor/ios @capacitor/geolocation
npx cap init VaiDeBike app.vaidebike --web-dir dist
echo "VITE_API_URL=https://SEU-DOMINIO.vercel.app" > .env.production   # app nativo não tem origem em comum com a API
npm run build && npx cap add android && npx cap sync
npx cap open android      # gera APK/AAB no Android Studio (iOS exige Mac + Xcode: npx cap add ios)
```
No Android, adicione em `AndroidManifest.xml` as permissões `ACCESS_FINE_LOCATION` e `ACCESS_COARSE_LOCATION`.
Com `VITE_API_URL` definido o frontend usa o token Bearer automaticamente (ver `src/lib/api.ts`).
Obs.: no iOS a vibração (`navigator.vibrate`) não existe; som, voz e alerta visual funcionam.

## 5. Popular o banco sem terminal (`/api/admin/seed`)
1. Na Vercel, crie a variável `SEED_TOKEN` com uma frase longa e secreta (Production) e faça o Redeploy.
2. Abra `https://SEU-DOMINIO/api/admin/seed?token=SUA_FRASE` → cria ciclovias, alertas de exemplo e contas demo.
3. Abra `https://SEU-DOMINIO/api/admin/snap?token=SUA_FRASE` (repita se `pendentes` ≠ 0) → ajusta as ciclovias às ruas.
4. Depois **apague a variável `SEED_TOKEN`**: sem ela, as duas rotas deixam de existir.
Atenção: as contas demo (`demo@vaidebike.app` etc.) usam a senha pública `senha123` — apague-as do Atlas antes de abrir o app ao público real.
