# Domínio de teste — publicado em 29 de setembro de 2026

Domínio: `dao-preview.mythicalbeings.io`. Projeto Vercel: `mythical-dao-preview`, equipa `palheiro1s-projects`.

O domínio foi acrescentado ao projeto através da API Vercel. Após o utilizador iniciar sessão no painel Cloudflare, foram acrescentados os dois registos abaixo. A Vercel confirmou `verified: true`; HTTPS respondeu 200 com validação normal do certificado. `PORTAL_ORIGIN` no Worker de staging aponta para `https://dao-preview.mythicalbeings.io`.

Registos publicados, preservando todos os registos anteriores:

| Tipo | Nome | Valor | Proxy |
|---|---|---|---|
| TXT | `_vercel` | `vc-domain-verify=dao-preview.mythicalbeings.io,88c0d799f69e0db2d39a` | — |
| CNAME | `dao-preview` | `e2d6e3591f35ba1d.vercel-dns-017.com` | DNS only |

O TXT é a prova pública de propriedade solicitada pela Vercel especificamente para este subdomínio. Se já existir outro TXT com esse nome, acrescentar o novo valor sem remover o anterior. Não alterar nameservers, o domínio raiz ou `dao.mythicalbeings.io`.

As rotas `/api/*` usam a mesma origem do portal. CSP e `noindex, nofollow` foram confirmados. POST do domínio autorizado chegou ao bloqueio de indexação (409); uma origem alheia foi rejeitada (403). O serviço público de classificação da MetaMask devolveu `recommendedAction: NONE` para este hostname. A extensão abriu o pedido de desbloqueio para ligação; a conclusão com a carteira real depende do utilizador.

Não foi feito bypass de alertas, alteração de segurança da carteira ou transação pública. A classificação atual não constitui auditoria do portal ou dos contratos. Ver [entrega de teste](TEST_DEPLOYMENT.md) para dados, validação e limitações atuais.
