# VaiDeBike Fortaleza — SPEC

App web (pt-BR) de segurança ciclista para Fortaleza-CE: mapa das ciclovias/ciclofaixas, alertas
comunitários de obstáculos (buracos, obras, trechos inacabados, falta de iluminação), modo GPS em
tempo real com alerta de proximidade, cadastro/login e gamificação (XP, níveis, missões, emblemas/selos).

## Stack
- Backend: FastAPI (uvicorn :8001, --reload) + motor/MongoDB (`app` db). Tudo sob `/api`.
  - `backend/server.py` monta: `auth_router`, `obstacles_router`, `bikelanes_router`, `gamification_router`, `rides_router` (todos em `backend/routers/`, prefixo `/api`).
  - Sessões: cookie httpOnly `vdb_session` (token uuid na coleção `sessions`). Senhas pbkdf2_sha256 (passlib).
  - `GET /api/auth/me` devolve **200 + null** para visitantes (sem 401).
  - Gamificação: `backend/lib/game.py` — XP (+50 report, +25 confirmar, +10/km), nível = xp//500+1,
    5 badges (condições em `_CONDITIONS`), 3 missões (métricas reports/km/confirms).
- Frontend: Vite + React 19 + TS strict + Tailwind v4 (tema escuro tático, fonte Outfit/Plus Jakarta/JetBrains Mono).
  - Páginas: `/` (Home+radar), `/map` (Leaflet OSM escurecido + HUD GPS + report + painel de detalhes),
    `/missions` (missões/selos/placar), `/profile` (stats+edição), `/login`, `/register`.
  - Dados: TanStack Query; obstáculos refetch a cada 10s (tempo real). `src/lib/session.ts` é o dono do cache
    (beginSession/endSession). Tipos espelhados em `src/lib/types.ts`.

## Endpoints
- POST `/api/auth/register|login|logout`, GET/PUT `/api/auth/me`
- GET `/api/bikelanes` (7 rotas seed de Fortaleza)
- GET `/api/obstacles?type=&status=&mine=` | POST `/api/obstacles` | POST `/api/obstacles/{id}/confirm` (proibido auto-confirmar → 400) | POST `/api/obstacles/{id}/resolve` (só dono)
- GET `/api/missions` (progresso do usuário logado), GET `/api/badges`, GET `/api/leaderboard`, GET `/api/stats`
- POST `/api/rides {km}` (+10 XP/km, dispara badges de km)
- GET `/api/route?from_lat&from_lng&to_lat&to_lng` → rota de bike por ruas (OSRM `routing.openstreetmap.de`, perfil bike): `coordinates[[lat,lng]]`, `distance_m`, `duration_s`, `steps[]` (manobras em pt-BR) e `source` (`bike` | `straight` = fallback em linha reta se o roteador estiver fora do ar)
- GET `/api/geocode?q=` → busca de endereços/lugares em Fortaleza (Nominatim, só no submit — nada de autocomplete por política de uso)
- GET `/api/status` (scaffold do template, sem uso no app)

## Dados (coleções)
- `users`: id(uuid str), name, email(unique), bio, bike_type, city, xp, level, total_km, reports_count, confirms_count, badge_ids[], created_at
- `sessions`: token(unique), user_id
- `obstacles`: id, user_id, user_name, type(buraco|obra|trecho_inacabado|falta_iluminacao|outros), severity(baixa|media|alta), description, lat, lng, status(ativo|resolvido), confirms, created_at
- `bikelanes`: id, name, kind(ciclovia|ciclofaixa), length_km, notes, coordinates[[lat,lng]], waypoints[[lat,lng]] (pontos digitados à mão no seed), snapped(bool)

## Ciclovias coladas nas ruas (snap)
- Causa dos "traços longos" no mapa: o seed tinha só 3–6 pontos por ciclovia, ligados em linha reta (cortavam quarteirões e o mar).
- `backend/lib/snap.py` pede ao roteador de bike a geometria real passando pelos `waypoints` e grava a polilinha densa em `coordinates` (`snapped=true`, `length_km` recalculado; alertas de exemplo `seed-<lane>-*` são reposicionados sobre a via).
- Roda no `seed.py` e em segundo plano no startup do servidor (`snap_pending_lanes`, melhor esforço — nunca derruba o boot). Exige saída para a internet; sem ela as ciclovias ficam `snapped=false`.
- No front, ciclovia `snapped=false` é desenhada fraca e pontilhada ("traçado aproximado") em vez de um traço grosso e falso.

## Navegação estilo Uber/99 (frontend)
- `hooks/useNavigation.ts`: destino → rota (`/api/route`) → fases `idle | preview | navigating | arrived`; progresso ao longo da rota, ETA, próxima manobra, recálculo ao sair >70 m da rota (intervalo mínimo 10 s), chegada <30 m, nº de obstáculos a ≤40 m da rota.
- `components/map/FortalezaMap.tsx`: câmera que segue o ciclista (rAF suave), seta de direção que gira com o rumo (`useRide.heading`), rota com contorno, pino de destino, marcadores de obstáculo atualizados incrementalmente (sem piscar no refetch de 10 s), obstáculos no caminho com anel laranja.
- Gestos: arrastar (solta a câmera → botão "recentralizar"), pinça/duplo toque (Leaflet), segurar ~0,55 s no mapa = escolher destino, painel inferior arrastável com inércia (`BottomSheet.tsx`), cartão de alerta fecha deslizando para baixo. No desktop o painel vira lateral esquerda.
- "Simular" percorre a rota virtualmente (`useRide.startRoute`) — para testar sem GPS.
- Limitação: Leaflet não rotaciona o mapa (o norte fica sempre para cima; só a seta gira). Rotação/inclinação estilo Uber exigiria migrar para MapLibre GL.

## Seed (backend/seed.py — idempotente)
- 7 ciclovias/ciclofaixas (Beira-Mar, Washington Soares, Aguanambi, Domingos Olímpio, Santos Dumont, Godofredo Maciel, Parque do Cocó)
- 6 obstáculos de exemplo nos eixos acima (só inseridos se a coleção estiver vazia)
- 3 contas demo (ver `memory/test_credentials.md`), todas senha `senha123`
- Demo GPS do HUD simula pedalada (~18 km/h) na Ciclovia da Beira-Mar

## Decisões conhecidas (não são bugs)
- Tiles: OpenStreetMap escurecido via CSS `filter: invert(1) hue-rotate(190deg)` (CARTO dark exige API key hoje).
- Missão "Sentinela Noturna" (3 confirmações) premia o badge "Mestre do Asfalto" (que também exige 10 reports) — par já definido nas diretrizes de design.
- Km do pedal só é registrado no servidor quando o usuário ENCERRA o pedal (toggle off/fim da demo); unmount descarta.
- `response_model=User | None` no /auth/me é intencional (visitante = null, sem 401).
- Cadastro dá o emblema "Calouro do Pedal" imediatamente (por design).