# CLAUDE.md — nimble (a Casca)

`nimble.monco.io` é a **Casca**: o hub dos projectos integrados monco. Especificação em `nimble-suite/docs/metodo-operacional.md` e `nimble-suite/docs/esquema-projecto.md`.

## O que é
- Login **conta monco** (link mágico por email, só `@monco.io`) → lista de projectos → projecto com **Canvas** (bootstrap canvas), **Equipa** (papéis + alocação), **Acesso** (dono/editor/leitor) e **Apps** (atalhos + exportação).
- Os dados vivem no Supabase **`monco`** (ref `lnvnfksaoirhpgdmxdpn`), uma **fatia por app**; a Casca escreve só a fatia `casca`. Escrita só pela RPC `gravar_fatia` (versão lida → conflito com aviso). RLS faz a segurança; o browser fala directamente com o Supabase.
- `app/` é a app (Node puro, **sem dependências**, Railway). `arquivo/` guarda a direcção antiga («um ficheiro, abas») — não mexer.

## Comandos
```bash
cd app
node --test                                   # modelo, cliente Supabase (fetch falso), servidor
node server.js                                # http://localhost:3000 contra o Supabase real
# local sem contas reais:
node dev/supabase-falso.js 54399
SUPABASE_URL=http://127.0.0.1:54399 SUPABASE_KEY=falsa PORT=5182 node server.js
# entrar: pedir o link na página, depois abrir http://127.0.0.1:54399/falso/entrar
```

## Estrutura (`app/`)
- `server.js` lista fechada de ficheiros, CSP por página, `/config.js` (URL + chave publicável, por env)
- `casca.html` · `casca.css` (tokens Aura, acento laranja) · `js/theme.js` (chave `monco-theme`, partilhada)
- `js/supa.js` cliente mínimo Auth + REST (refresh automático, 401 → refresh e repete) · `js/casca-modelo.js` limpeza da fatia `casca`, avisos, completude, exportação · `js/casca.js` interface
- `dev/supabase-falso.js` Supabase em memória que imita as regras do esquema (não é servido)

## Regras
1. **Claro/escuro só trocam cores** (teste falha se `[data-theme]` tiver não-cor). Comparar estilos calculados nos dois temas ao mexer na UI.
2. Texto do utilizador por `textContent`/`value`; nunca `innerHTML` com dados.
3. **Sem scripts nem `style=""` inline** (CSP; testes). Larguras dinâmicas via CSSOM (`el.style.x`), que a CSP permite.
4. **Nunca confiar no que vem da base**: tudo passa por `CascaModelo.limparCasca()`.
5. Ficheiro novo servido → acrescentar à lista `FILES` do `server.js`.
6. A chave publicável e o URL do Supabase não são segredos; a service role **nunca** entra neste repo.
7. 375 px sem scroll horizontal. UI em PT-PT.

## Falta
Extracção do pitch por IA (edge function `extrair-pitch`) · modo monco nas apps (Veredicto primeiro) · sessão partilhada em `*.monco.io` (hoje a sessão vive no localStorage de nimble.monco.io) · configurar Auth no painel (site URL, redirects `https://*.monco.io/**`, email).

## Estilo
Responder ao director em português, conciso. Commit e push só quando pedido. Verificar UI no browser (preview) contra o Supabase falso.
