# Entrega — Governor atual e ragequit sem migração

1 de outubro: [leitura suplementar verificada](GRAPH_HISTORY.md) implementada, com 124 testes do portal e seis verificações de browser aprovados. O ensaio real de reorg local passou para MANA e propostas do Governor; a aplicação rejeita hashes órfãos via RPC, pois o Graph Node pode responder a essas consultas. A sessão do Studio está ligada, mas o seletor de subgraphs continua vazio e impede guardar a restrição da chave; a ativação aguarda a resolução desse bloqueio. O histórico completo continua por demonstrar.

Atualização: [recuperação do sync, validação do portal e preparação do piloto The Graph](SYNC_RECOVERY.md). A versão do Worker é agora `851124ed-f7f3-46bd-a668-6c1eaa5f8609`. Abaixo mantém-se a descrição da entrega anterior; os resultados e limites mais recentes estão no relatório ligado.

Data: 28 de setembro de 2026. Código implementado localmente; nenhuma transação enviada à Polygon pública.

Atualização: [portal de teste publicado no domínio próprio](https://dao-preview.mythicalbeings.io), com API Worker e D1 de staging. HTTPS, DNS e classificação MetaMask `NONE` foram verificados na preparação do domínio. A indexação histórica permanece incompleta; a governação já usa verificações diretas por operação, descritas na atualização seguinte. [Entrega inicial do deploy](TEST_DEPLOYMENT.md).

29 de setembro, atualização mais recente: [revisão técnica do ragequit](RAGEQUIT_REVIEW.md) concluída, com correções no verificador e nos geradores e sem alteração do contrato. [Indexação adaptativa](ADAPTIVE_INDEXING.md) publicada com migration aditiva: diminui intervalos lentos/falhados, retoma o mesmo início e cresce gradualmente após sucessos rápidos. 15 testes Solidity/2048 casos de fuzz, 95 testes de dados/scripts, tipos e build aprovados. As seis fontes avançaram na D1, mantendo 18 eventos e oito registos Snapshot. Nenhuma implantação ou autorização pública do módulo.

29 de setembro, governação durante o sync: [governação durante a sincronização](LIVE_GOVERNANCE.md) publicada e validada. Verificações de identidade, regras e simulação em dois RPCs antes de assinar; recuperação de propostas pelo recibo sem alterar cursores; alterações de carteira/rede invalidam a revisão. 81 testes de dados, 50 casos de browser, tipos/build e ensaio web integral no fork passaram. No preview, delegação/publicação e simulação de ação única passaram com o histórico a 0,30%. A limitação de simulação conjunta do RPC secundário é mostrada explicitamente, com reconhecimento obrigatório antes da publicação; a execução continua a exigir simulação própria.

29 de setembro: [corrigida a configuração RPC local](LOCAL_LIVE_DATA.md) e publicadas as correções. Saldo, votos e representante verificados na API e em dois RPCs. A interface distingue leituras diretas do histórico incompleto. Os logs públicos identificaram HTTP 429 no PublicNode; o staging passou a usar dRPC/Tenderly, após verificar concordância de bloco/saldo/oferta. Os lotes respeitam o limite documentado de três chamadas do dRPC e mantêm isolamento por pedido. As 15 consultas públicas seguintes passaram. Tipos/build, 48 testes de dados e os testes selecionados de estados da interface em desktop/móvel passaram. Os limites gerais dos serviços públicos continuam a aplicar-se.

O [pacote do módulo para revisão](../deployments/ragequit-release/README.md) inclui ABI, código de criação sem assinatura, argumentos e hashes verificados contra as fontes compiladas. A simulação do construtor concordou em dois RPCs no bloco 94644367. O ensaio completo do Governor real passou novamente no fork do bloco 94644170. Revisão independente e implantação pública continuam pendentes.

30 de setembro: [integração de comparação The Graph](GRAPH_COMPARISON.md) preparada e desligada. Validação real de 73 contas MANA, oferta/soma dos saldos e ambas as propostas passou em dois RPCs; 117 testes do portal passaram. Restrição por domínio verificada e cliente adaptado. A restrição ao subgraph, prova de ausência de omissões no histórico e ensaio de reorg no Graph Node continuam pendentes; D1/RPC mantêm-se ativos.

## Implementado

29 de setembro: [indicador visual de sincronização publicado](SYNC_STATUS.md), com cobertura global e por fonte, atualização automática, erro/indisponibilidade distintos e última atualização. Diagnóstico Infura sanitizado e correção reproduzida do timeout que era anulado pelo sinal de isolamento de pedidos. Tipos/build, 74 testes de dados e oito verificações de browser passaram; sincronização histórica ainda em curso.

Infura Core Free integrado no indexador de staging em 29 de setembro: consultas históricas de 5000 blocos concordaram com a Tenderly nas três amostras conhecidas. Quota diária persistente, limitação de frequência, tratamento de 402/429, reserva para governação e retoma de lotes incompletos verificados. TypeScript, build, dry-run Worker e 67 testes passaram. [Operação e limites](INFURA_FREE.md). A sincronização completa é uma etapa operacional em curso, não uma conclusão do preflight.

Confirmação posterior do utilizador: ligação real da MetaMask e portal funcionam. Foi acrescentado `npm run probe:archive` para validar dois fornecedores contra eventos históricos conhecidos, com proteção de credenciais e sem alterações a D1. As primeiras sondagens públicas não forneceram um par adequado; o par Infura/Tenderly foi posteriormente validado. [Resultados e procedimento](ARCHIVE_INDEXING.md).

- O Governor existente é o contrato ativo e a única tesouraria. IDs, descrições, ações, URLs e arquivo mantêm-se. ABI própria com setters `uint256`; execução direta em `Succeeded`; cancelamento pendente pelo proponente, confirmado no fork; regras lidas on-chain.
- Formulário executável em quatro etapas, pagamentos ERC-20 `transfer`, autorizações `approve` identificadas separadamente e simulação no contexto do Governor. Rascunhos antigos conservam conteúdo e bytes; consultivos são exportáveis e remetem para Snapshot, sem implantação de ballots V2.
- `MythicalRagequitModule`: cinco endereços imutáveis, cesta GEM/WETH/USDC nativo, fórmula proporcional com oferta anterior à queima, queima do chamador, transferências diretas da tesouraria, mínimos, prazo, reentrância e diferenças exatas de saldo/oferta. Sem proprietário operacional, pausa, upgrade ou execução arbitrária.
- Portal com saldo, autorização e quota por ativo; USDC zero confirmado; POL/USDC.e visíveis e excluídos; aprovação individual exata; tolerância 0,5% ajustável 0–5%; prévia de dois minutos e deadline de quinze minutos. Identidades e alterações do contexto invalidam a confirmação.
- Manifesto versionado com campos explícitos, capacidades e disponibilidade do módulo separadas da governação. O antigo campo `usdc` permanece USDC.e. Nenhum endereço novo foi inventado no manifesto.
- D1 preservada, Governor/tesouraria deduplicados, filtros de propostas/notificações corrigidos, novas fontes e cursores próprios para Approval. Testados backfill de autorizações e reorg sem apagar Transfer histórico.
- ABI exportada, script para implantar apenas o módulo, verificador de runtime/imutáveis/autorizações, gerador de propostas de autorização e revogação, [proposta parametrizada](../deployments/ragequit-authorization.template.json) e [instruções operacionais](OPERATIONS.md).
- Identidade visual, inglês e dois temas preservados. GEM usa o ficheiro oficial da carteira; [proveniência](evidence/GEM_ASSET.md). Bot Telegram existente preservado, sem troca de modo ou mensagens.

## Resultados

| Verificação | Resultado |
|---|---|
| TypeScript | Passou |
| Vitest | 53 testes passaram: dados, API, RPCs/lotes/isolamento/retries, preflight de arquivo, indexação, reorg, cursores, pagamentos/autorizações, rascunhos, revisão e recibos |
| Solidity local | 32 passaram: 10 do módulo, incluindo 256 casos de fuzz; 22 da implementação histórica. Dois testes de RPC são ignorados quando a variável de fork está ausente |
| Fork real obrigatório | Passou separadamente, sem skips, no bloco 94612062: criação/voto/execução de autorizações, cancelamento permitido e rejeitado, GEM/WETH/USDC/MANA reais, USDC inicial zero, receita posterior, pausa real de USDC com rollback e proposta de revogação |
| Playwright | 55 passaram; 11 repetições da matriz são intencionalmente omitidas no runner móvel, porque a matriz define as larguras explicitamente |
| Visual/acessibilidade | Claro/escuro a 390/768/1440 px; reflow 320 px/200%; teclado/diálogos; verificações Axe WCAG A/AA sem violações nos percursos cobertos; capturas atualizadas |
| Build | Passou. Mantém aviso de bundle JavaScript superior a 500 KB (~696 KB minificado / 204 KB gzip) |
| Worker de staging | Publicado com D1 própria, dois RPCs e origem do domínio de teste; nenhum Worker de produção ativado |
| Recuperação D1 local | Passou: exportação de 12490 bytes restaurada numa base isolada, incluindo os oito registos Snapshot; todas as linhas iguais, original preservado |
| Scripts do módulo | Implantação via `DeployRagequit.s.sol`, comparação de runtime/imutáveis, autorizações iniciais zero e calldata de autorização/revogação passaram num Anvil isolado |
| RPCs reais | dRPC e PublicNode concordaram em endereços/código/parâmetros no bloco 94612138; ambos aceitaram `eth_simulateV1` no contexto do Governor |

Evidência: [fork reproduzível](evidence/existing-governor-fork.txt), [scripts operacionais](evidence/module-operations-fork.json), [recuperação D1](evidence/local-recovery.json), [verificação em dois RPCs](evidence/existing-governor-verification.json), [capturas](evidence/visual/). No bloco verificado: threshold 0 MANA, quórum 4/100, atraso 41143 e período 288000 blocos. A interface lê os valores atuais em vez de fixar estes números. O bloco inicial de MANA foi identificado por pesquisa histórica de bytecode em dRPC: 45785116; não são descartados cursores existentes.

O fork move 50000 MANA da tesouraria para um membro de teste e delega esse saldo; usa uma pool existente para semear uma receita USDC e impersona o pauser apenas no fork. As autorizações e a revogação passam pelo Governor real, sem chamada privilegiada isolada a `approve`. O primeiro resgate de 1 MANA recebeu 657100440000000000 unidades GEM, 80000000 WETH e zero USDC. O endereço de módulo que aparece na evidência existe apenas nesse fork.

## Ativação que falta fora do código

1. Completar a indexação histórica para métricas/listas completas e feed de notificações. O preview com D1/RPCs de staging já permite governação mediante verificação direta; o ensaio web de assinatura foi realizado no fork, sem transações públicas.
2. Concluir revisão independente e implantar **apenas** o módulo; registar e verificar endereço, bloco, código e argumentos.
3. Materializar a proposta com esse endereço real; submeter, votar e executar pela DAO; confirmar as três autorizações efetivas.
4. Realizar uma pequena saída real consentida e guardar evidência antes de anunciar disponibilidade geral.

O endereço real do módulo é a única variável pendente da proposta parametrizada. A ausência dele não bloqueia a governação na implementação. `enabled: true` no manifesto habilita a arquitetura atual quando os dados forem verificados; não afirma que a instância local sem RPCs esteja pronta para assinar.

Nenhuma migração, alteração de MANA/delegações, redirecionamento de receitas, modificação de regras do Governor ou mudança automática de notificações foi realizada. O plano V2, os contratos e a configuração histórica foram preservados, juntamente com os documentos antigos em `docs/historical`.

## Disco

29 de setembro, publicação do domínio: preflights de 0,6 GB e 0,3 GB passaram (42,286 GB e 42,098 GB livres). Medição após testes: 42,097 GB. Reutilizados dependências e Chromium instalado, sem downloads de navegadores. Os outputs `dist`/Vercel, evidências e pacote do módulo somam menos de 25 MB. Sem crescimento inesperado atribuído a este projeto.

Preflight inicial de 1 GB passou, com cerca de 45,195 GB livres. Durante as verificações houve uma queda global de cerca de 1 GB, novamente verificada com preflight e ainda acima da reserva de 40 GB. Os diretórios de artefactos deste projeto medidos somam menos de 50 MB; a queda global não foi atribuída a estes artefactos. Havia outras tarefas em execução; não foram apagados dados, caches, ambientes ou evidência dessas tarefas. Dependências existentes reutilizadas, sem nova instalação. Espaço livre medido no encerramento: 44,181 GB; a reserva de 40 GB foi mantida.
