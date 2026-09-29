# Infura Core Free — indexação Polygon

Integração de 29 de setembro de 2026. O indexador usa Infura como fonte primária e Tenderly pública como fonte independente. As três amostras históricas de 5000 blocos passaram, incluindo a implantação MANA e duas propostas reais: [preflight sem credenciais](evidence/infura-free-preflight-2026-09-29.json).

Publicado no Worker de staging `f6e02799-ffe0-4164-b318-26ffa0587df5`. A primeira execução automática completou seis fontes e a seguinte avançou novamente Governor e MANA. A API passou a `syncing`; a sincronização ainda não terminou. D1 preservou os oito registos Snapshot e os dois eventos de proposta anteriores, mantendo um só cursor Governor/tesouraria. Foram observados 5660 créditos/42 pedidos na contagem inicial, sem cooldown. [Ativação](evidence/infura-free-activation-2026-09-29.json), [avanço posterior](evidence/infura-free-progress-2026-09-29.json).

## Configuração

- `INDEX_RPC_MODE=infura-free` seleciona o transporte com quota; `standard` preserva a configuração genérica anterior.
- `INFURA_API_KEY` é um secret do Worker, específico do projeto DAO; nunca uma variável `VITE_`, uma URL no manifesto ou um valor em `wrangler.jsonc`.
- Endpoint fixo: `https://polygon-mainnet.infura.io/v3/<chave>`.
- `INDEX_RPC_SECONDARY_URL=https://tenderly.rpc.polygon.community`; não são aceites dois endpoints Infura como fontes independentes.
- `INFURA_DAILY_CREDITS=2400000`: teto local, inferior aos 3 milhões de créditos/dia documentados. Pode ser reduzido, mas não aumentado acima de 2,4 milhões neste modo.
- `INDEX_BATCH_BLOCKS=5000` é o máximo; o tamanho efetivo passa a ser adaptativo por fonte. O cron de staging corre a cada minuto. Uma execução confirma no máximo um lote por fonte, podendo repetir uma vez com intervalo menor antes da confirmação. [Política de adaptação](ADAPTIVE_INDEXING.md).
- `RPC_PRIMARY_URL` e `RPC_SECONDARY_URL`, usados pelas consultas HTTP do portal, mantêm os valores anteriores. Visitas ao portal não gastam a quota Infura do indexador.

Os limites documentados do Free são 3 milhões de créditos/dia e 500 créditos/segundo. Os métodos utilizados custam 5 (`eth_chainId`), 80 (`eth_blockNumber`, `eth_getBlockByNumber`) e 255 (`eth_getLogs`) créditos. Consultas históricas não têm atualmente sobretaxa. Referências: [plano](https://docs.infura.io/get-started/pricing/), [custos](https://docs.infura.io/get-started/pricing/credit-cost/), [endpoint](https://docs.infura.io/get-started/endpoints/).

## Limites, continuidade e segurança dos dados

1. As chamadas Infura são individuais, serializadas e separadas por pelo menos 1,1 segundos; não há lotes JSON-RPC nem retries automáticos de transporte. A repetição adaptativa de um intervalo menor é explícita, limitada e igualmente contabilizada. Métodos sem preço conhecido são rejeitados.
2. A migration aditiva `0002_infura_quota.sql` cria apenas `rpc_quota`. A contagem persistente reserva créditos antes de cada pedido, verifica a lease e conserva tentativas falhadas como consumo por prudência. Não guarda chaves.
3. O dia muda às 00:00 UTC. Ao esgotar o orçamento local, a execução para; o cron seguinte só volta a consumir quando houver quota. HTTP 402/código -33000 suspendem até à meia-noite; HTTP 429/código -33200 impõem pelo menos um minuto de espera persistente.
4. Governor e MANA têm prioridade. O histórico dos restantes ativos só usa os créditos que sobram depois de reservar 1250 por minuto restante do dia para a governação (ciclo normal estimado: 1235). As fontes secundárias menos recentemente processadas avançam primeiro. Reorgs ou falhas prolongadas podem ainda consumir a margem; o teto diário permanece obrigatório.
5. O orçamento cobre apenas este indexador e esta D1. Outros projetos que reutilizem a mesma conta/chave, preflights e ferramentas externas não são incluídos na contagem. Os 600 mil créditos de margem não são uma garantia de quota livre na conta. Manter o plano Core Free e uma chave dedicada à DAO.
6. Um lote só atualiza eventos, checkpoint e cursor depois de ambas as fontes concordarem nos logs e no hash final. Esgotar a quota a meio não salta blocos. Reexecução, deduplicação e recuperação de reorg mantêm-se.
7. Aguardar todas as leituras iniciadas antes de libertar a lease evita pedidos pendentes da execução anterior. Não há estado de I/O global partilhado entre pedidos Worker.

A primeira recuperação não é instantânea. Com 5000 blocos por execução/minuto, o MANA requer cerca de sete dias no melhor caso; limites, falhas e indisponibilidade podem prolongar esse prazo. O histórico dos ativos pode demorar mais por ter prioridade inferior. Não interpretar `index_health.status=ok` como histórico completo. `/api/health.historyComplete` exige Governor/MANA completos, recentes e canónicos; `signingAllowed` e as operações usam verificação direta, independente desse histórico. [Disponibilidade durante o sync](LIVE_GOVERNANCE.md). Com lotes adaptativos e falhas dos fornecedores, o cenário ideal acima não é uma previsão.

## Preflight e ativação

Guardar a chave em `.dev.vars` (ignorado pelo Git) como `INFURA_API_KEY=...`, com Polygon Mainnet ativada no painel Infura. Não colocar a chave em comandos ou relatórios.

```sh
npm run probe:infura -- docs/evidence/infura-preflight-NOVA-DATA.json
npm run typecheck
npm test
npm run build
```

O preflight faz apenas leituras, aplica o espaçamento Infura, não altera D1 e recusa substituir um relatório existente. O sucesso prova as amostras, não a completude de todo o índice.

Depois do preflight, publicar o secret com `wrangler secret put INFURA_API_KEY --env staging` pelo prompt privado ou stdin de um ficheiro local. Aplicar a migration aditiva e publicar:

```sh
node_modules/.bin/wrangler d1 migrations apply DAO_DB --env staging --remote
node_modules/.bin/wrangler deploy --env staging
```

O cron está definido em `env.staging.triggers`; não é necessário alterar o frontend Vercel, o bot ou os contratos.

## Acompanhamento

O portal inclui agora **History sync**, com percentagem global, detalhe por fonte e última atualização. [Fórmula, diagnóstico e validação](SYNC_STATUS.md). A percentagem mede blocos percorridos desde cada implantação, não o tempo restante. Timeouts são distinguíveis de falhas genéricas e o transporte impõe o prazo efetivo mesmo quando existe um sinal de isolamento de lotes.

```sh
node_modules/.bin/wrangler d1 execute DAO_DB --env staging --remote --command "SELECT provider,day,credits,requests,not_before,blocked_until FROM rpc_quota"
node_modules/.bin/wrangler d1 execute DAO_DB --env staging --remote --command "SELECT contract,block_number,updated_at FROM cursors ORDER BY contract"
```

Motivos operacionais: `INFURA_API_KEY_MISSING_OR_INVALID`, `INFURA_DAILY_BUDGET_EXHAUSTED`, `INFURA_GOVERNANCE_BUDGET_RESERVED`, `INFURA_PROVIDER_COOLDOWN`, `INFURA_PROVIDER_DAILY_LIMIT`, `INFURA_PROVIDER_RATE_LIMIT`, `INFURA_REQUEST_FAILED`. O adiamento de ativos para reservar governação mantém os lotes já confirmados e não declara o histórico dos ativos completo.

Para interromper a indexação, retirar apenas o cron de staging e publicar; preservar o secret, a tabela de quota e todos os cursores. Não limpar D1 nem diminuir a contagem para contornar o plano gratuito. Regressar ao modo `standard` só depois de validar os dois RPCs substitutos.

## Validação e disco

TypeScript, build, dry-run Worker e 67 testes passaram, incluindo esgotamento de quota a meio de um lote, retoma, concorrência, reorg, 402/429 e proteção da chave. As seis rotas públicas verificadas responderam HTTP 200; os saldos continuaram a ser lidos pelos RPCs anteriores. A chave não apareceu nos 16 ficheiros gerados verificados nem nos relatórios Infura. Não foram feitas alterações visuais ou transações on-chain.

O preflight de disco de 0,3 GB passou com 41,562 GB disponíveis. O espaço global oscilou até 41,068 GB e recuperou para 41,262 GB na medição final; não se atribuiu toda essa oscilação a esta tarefa. `dist` e o bundle de verificação somam 4,155 MB; dependências existentes reutilizadas, sem instalações. A reserva de 40 GB foi preservada. A entrada temporária de teste autenticado foi removida após parar o preview remoto; o pedido foi corretamente ignorado por já existir uma lease do agendamento. O bundle temporário fica como evidência do dry-run até à próxima revisão da publicação.
