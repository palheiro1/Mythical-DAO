# Recuperação do sync e validação — 29 de setembro de 2026

Worker atual: `851124ed-f7f3-46bd-a668-6c1eaa5f8609`, publicado em staging. A primeira publicação da correção foi `4d2779cd-9bb5-428c-973a-3183049b5068`; a segunda acrescenta reutilização do head dentro do mesmo pedido e diagnóstico sanitizado de falhas RPC. O frontend continua com o bundle `index-C9tIGjEp.js`; não foi necessário republicá-lo.

## Diagnóstico comprovado

1. O ajuste anterior reduzia a janela também em leituras bem-sucedidas mas lentas. Os tamanhos chegaram a **6 blocos no Governor e 8 no MANA**, com 37/75/952 nos restantes ativos. Comparações pequenas mostraram que a latência não dependia apenas do tamanho: o segundo RPC demorou cerca de 22,6 segundos para oito blocos do Governor, enquanto respondeu a 5000 blocos do MANA em cerca de 0,23 segundos.
2. O tail do Worker registou **`exceededCpu`** depois de commits. A terminação impedia a finalização do ciclo e a libertação normal do lease, deixando ciclos seguintes à espera e um erro Infura antigo na saúde do índice. O contador observado estava em cerca de 405 mil créditos, abaixo do limite local de 2,4 milhões; não há evidência de esgotamento da quota diária como causa desses ciclos.
3. Uma invocação fazia trabalho de várias fontes e repetia leituras D1 de quota/lease em cada pedido Infura. O [limite de CPU do Workers Free](https://developers.cloudflare.com/workers/platform/limits/) e os [limites D1 por invocação](https://developers.cloudflare.com/d1/platform/limits/) tornam essa concentração inadequada para o backfill observado.

[Sondas dos fornecedores](evidence/sync-provider-diagnosis-2026-09-29.json), [tail com a falha](evidence/sync-diagnostic-tail-20260929.json), [segundo tail](evidence/sync-diagnostic-tail2-20260929.json), [D1 anterior](evidence/sync-recovery-before-2026-09-29.json). Digests de respostas JSON brutas podem diferir por metadados extras do fornecedor; isso não prova divergência dos logs normalizados.

## Correção ativa

- Uma fonte por invocação no staging/produção, com rotação persistente baseada na **tentativa**, incluindo falhas/interrupções; Governor/MANA recebem preferência temporal sem excluir os ativos. O cron continua remoto, a cada minuto.
- Um lote bem-sucedido nunca encolhe apenas por ter sido lento. Após três leituras completas de até 25 segundos, duplica até ao máximo configurado de 5000. Um timeout pode reduzir, mas não abaixo de 1000; limites efetivos de tamanho/densidade continuam a permitir reduções inferiores. Nunca aumenta o intervalo na repetição imediata de uma consulta falhada.
- Quota Infura reutilizada apenas dentro do pedido: cada reserva continua a exigir lease, saldo de créditos e cooldown válidos no SQL condicional. Perda de lease e alterações por outro cliente são testadas. Não houve aumento de orçamento nem contratação paga.
- Migration `0004` acrescenta `index_source_runs` e recupera os tamanhos colapsados por timeout/sucesso. Não apaga eventos, cursores, checkpoints, Snapshot ou quotas.
- Overview e notificações reutilizam o head já verificado **no próprio pedido**. Assinaturas continuam a exigir identidade, concordância de dois RPCs e simulação atual; não existe cache de autorização. Falhas RPC encapsuladas pelo viem ficam identificadas sem imprimir URL, chave ou corpo do pedido.

O [D1 posterior](evidence/sync-recovery-after-2026-09-29.json) mostra avanço das seis fontes, runs concluídos sem erro, os **18 eventos e oito registos Snapshot preservados**, e aumento gradual para 2000 blocos nas fontes que já fizeram três ciclos. O [tail de recuperação](evidence/sync-recovery-tail-2026-09-29.json) guarda apenas outcomes e logs estruturados, sem metadados dos pedidos HTTP.

## Limite que continua por resolver

O sync estava em **0,42%**, com `historyComplete=false` e `signingAllowed=true`, na [última leitura guardada](evidence/sync-recovery-health-2026-09-29.json). A estabilidade observada não equivale a histórico completo nem garante ausência de novas falhas quando surgirem lotes mais densos.

Com uma fonte por minuto e teto de 5000 blocos, cerca de 278 milhões de blocos-fonte pendentes exigiriam **pelo menos cerca de 39 dias**, mesmo ignorando novos blocos, retries e densidade. É uma estimativa aritmética otimista, não uma previsão de conclusão. Não é razoável prometer terminar durante a noite. Consultar história completa tem custo mesmo quando não há eventos; não foram incluídos contratos alheios à DAO.

Uma sonda adicional aceitou 10 mil blocos nos dois RPCs, mas **100 mil foram rejeitados por ambos**. Esta sonda isolada não alterou o teto ativo nem prova capacidade para todas as fontes: [resultado](evidence/sync-span-capacity-2026-09-29.json). O [piloto The Graph](../../dao-subgraph/README.md) prepara uma alternativa para o backfill de Governor/MANA, sem trocar automaticamente a fonte do portal. Ainda precisa da sessão da carteira no Studio para criar e implantar o piloto e medir a sincronização real.

## Validação do portal e do módulo

- 101 testes do portal passaram após a correção; dois testes adicionais do comparador The Graph também passaram (**103 testes distintos**). Tipos e build passaram. O aviso conhecido do bundle acima de 500 KB permanece.
- Leituras reais da API: tesouraria com **657100,44 GEM**, **0,00008 WETH**, **0 USDC nativo**; membro conhecido com **33670,936971428589697113 MANA**, igual poder delegado para si próprio. Os valores incluem o bloco nas [respostas guardadas](evidence/portal-live-readchecks-2026-09-29.json) e podem mudar posteriormente. Zero de USDC é uma leitura confirmada, não placeholder.
- As regras lidas foram voting delay 41143, voting period 288000, threshold 0, quorum 4/100 e ausência de timelock. Contadores históricos continuam assinalados como incompletos.
- Interface publicada verificada com `agent-browser`, sem erros de consola observados: [overview](evidence/sync-live-overview-2026-09-29.png), [tesouraria](evidence/sync-live-treasury-2026-09-29.png).
- Dois percursos completos de navegador, desktop e mobile, passaram no fork: delegar, rejeitar assinatura, mudar carteira/rede, importar/publicar rascunho, recuperar recibo, votar, rejeitar voto duplicado na simulação, executar com transferência GEM, cancelar e apresentar reversão real. [Resultado](evidence/portal-fork-recheck-2026-09-29.txt). Os dois clientes RPC apontam ao mesmo Anvil neste ensaio; a concordância de fornecedores independentes foi verificada separadamente nas leituras públicas. As transações são apenas locais.
- 15 testes Solidity do ragequit passaram novamente, incluindo 2048 casos de fuzz; os hashes das 12 fontes congeladas continuam iguais. [Resultado](evidence/ragequit-final-tests-2026-09-29.txt). Foi preparado o [brief de revisão independente](INDEPENDENT_REVIEW_BRIEF.md); a revisão por um terceiro continua pendente.
- The Graph: cinco testes dos validadores, dez testes reais dos mappings e build WASM passaram. [Resultado](evidence/graph-pilot-tests-2026-09-29.txt). CID/endpoint e comparação remota ainda pendentes da implantação no Studio; o ensaio de reorg do serviço também não foi executado.

## Operação, rollback e disco

O cron remoto continua com o PC desligado. Não é necessário manter os servidores de desenvolvimento abertos; os servidores locais deste ensaio foram encerrados. O bot Telegram não foi substituído.

Observar `/api/health`, `index_source_runs`, `index_adaptive` e o tail. Um rollback do Worker não exige apagar as tabelas novas; manter os cursores atuais e os dados. A versão anterior à correção pode reproduzir o colapso dos lotes/CPU e não deve ser tratada como resolução permanente.

O preflight inicial passou com 40,545 GB livres. A manutenção autorizada pelo `disk-guard` libertou cache fechada do Firefox (~982 MB) e tratou cache pnpm; caches de aplicações em execução foram preservadas. Preflight cumulativo de 0,8 GB aprovado com 41,533 GB livres para o piloto e verificações; depois do trabalho e da correção das dependências detetada pela CI restavam cerca de **40,914 GB**, acima da reserva de 40 GB. O acréscimo principal foi `node_modules` do subgraph (~240 MB). Não foram clonados projetos nem copiadas bases/históricos.
