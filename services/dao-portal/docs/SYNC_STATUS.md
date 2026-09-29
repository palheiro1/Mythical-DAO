# Estado de sincronização e diagnóstico RPC

Publicado no portal de teste em 29 de setembro de 2026:
https://dao-preview.mythicalbeings.io

O painel **History sync** está disponível em todas as páginas. Atualiza através de `/api/health` a cada 20 segundos enquanto a página está ativa, sem fazer pedidos adicionais ao Infura. **Sync details** apresenta as fontes, os blocos indexados, o bloco confirmado de destino e a cobertura específica de Governor/MANA. O agendamento continua no Cloudflare quando o computador está desligado.

## Como interpretar a percentagem

Para cada fonte: `total = max(0, confirmedHead - startBlock + 1)` e `checked = clamp(cursor - startBlock + 1, 0, total)`. A percentagem global é `sum(checked) / sum(total) × 100`. Fontes sem cursor entram com zero. É cobertura de intervalos de blocos, não número de eventos nem estimativa de tempo restante. A mesma definição de fontes é utilizada pelo indexador e pelo relatório.

Governor/tesouraria/arquivo e o alias USDC.e contam apenas uma vez. Fontes de Approval, quando o módulo existir, terão os seus próprios cursores desde a implantação do módulo. Cursores antigos não associados à configuração ativa são preservados na D1, mas não distorcem a percentagem.

A apresentação trunca a duas casas decimais; um histórico incompleto não arredonda para 100%. O avanço do head ou uma recuperação de reorg podem reduzir a percentagem. Se os RPCs não confirmarem o head, o painel apresenta `—`, conservando os blocos guardados nos detalhes. Um erro não transforma a cobertura já feita em zero. `signingAllowed` mantém as condições anteriores e é independente da percentagem global dos ativos.

## Diagnóstico

O transporte Infura anteriormente convertia todas as falhas não relacionadas com quota no código genérico `INFURA_REQUEST_FAILED`. Agora regista `infura_request_failed` com método, duração, classe, código HTTP/JSON-RPC e detalhe sanitizado. URLs, chave, corpo do pedido e stack não são publicados. Timeouts identificáveis produzem `INFURA_REQUEST_TIMEOUT`. A causa original de um erro anterior à instrumentação não pode ser reconstruída a partir do código genérico guardado.

Foi reproduzido um defeito no transporte do segundo RPC: o `AbortSignal` exclusivo do cliente, utilizado para impedir a mistura de lotes de diferentes pedidos Worker, substituía o sinal de timeout interno do Viem. O teste de um fetch bloqueado falhou antes da correção e passou depois. `timedBoundedFetch` agora combina o isolamento com um prazo real que cobre a ligação e a leitura do corpo, cancelando o pedido. Mantêm-se o limite de resposta de 4 MB, a independência de fornecedores e os limites Infura. Timeouts do transporte público identificam a origem com `RPC_PRIMARY_TIMEOUT` ou `RPC_SECONDARY_TIMEOUT`.

O ciclo agendado observado às 12:41:19 UTC terminou após 109,4 segundos com `RPC_SECONDARY_TIMEOUT`, durante o processamento dos logs/validação final de USDC nativo. A origem é a Tenderly, configurada como segundo fornecedor, e não a quota Infura: havia 38 675 créditos/305 pedidos contabilizados e `blocked_until=0` na consulta posterior. A repetição local do intervalo 48699443–48704442 devolveu zero transferências nos dois sentidos, concordantes nos dois fornecedores, em 0,4–1,6 segundos por pedido. Isto confirma intermitência, sem provar a causa original do antigo erro Infura. [Falha agendada](evidence/sync-rpc-diagnostics-2026-09-29.json), [repetição](evidence/sync-rpc-replay-2026-09-29.json).

A instrumentação final distingue ainda a leitura de logs da validação do hash final e regista o método de cada timeout do segundo RPC. Os cursores Governor/MANA continuaram a avançar entre ciclos, e a percentagem global passou de 0,07% para 0,08% durante a verificação. A correção controla o bloqueio e melhora o diagnóstico; não garante que um serviço RPC público deixe de falhar intermitentemente.

## Validação e publicação

- 74 testes de dados, tipos e build passaram. O teste de regressão comprova o cancelamento efetivo do fetch.
- Oito testes de browser passaram: atualização por polling, erros, head indisponível, histórico de autorizações ainda pendente, navegação por teclado e análise axe do painel; regressão das leituras de saldos durante sync e falhas.
- Temas claro/escuro e larguras 320/390/768/1440 px sem overflow; texto a 200% também verificado. Sete capturas reais e ausência de erros JavaScript: [evidência pública](evidence/sync-public-2026-09-29.json).
- Worker de staging: `e21f43bf-fcc0-4025-92cc-776f9b9d715b`.
- Vercel: `dpl_GJDdPat8duv3xwLGPtgkPunZsh6y`, READY, projeto isolado `mythical-dao-preview`, com alias do domínio de teste.
- Sem novas dependências, migrações D1 ou operações on-chain. Preflight de 0,4 GB passou com 40,976 GB disponíveis; medição após build/publicação: 40,947 GB. Artefactos e capturas pequenos, sem duplicação de dependências.

Verificação da publicação final: [saúde e indicador](evidence/sync-final-2026-09-29.json). O espaço livre global desceu posteriormente para 40,418 GB, uma redução de cerca de 0,56 GB desde o início, superior ao crescimento dos artefactos desta tarefa. `dist` tem 1,35 MB, `.vercel/output` 5,64 MB e `.wrangler` manteve cerca de 74 MB. A descida global não foi atribuída sem evidência a esta tarefa; a reserva de 40 GB foi conservada.

O último pacote publicado foi confirmado por HTTP 200 (HTML e API) e comparação SHA-256 do bundle com o build local. A abertura final em Chromium falhou duas vezes com `ERR_NETWORK_CHANGED` local; por isso, não é apresentada como verificação visual bem-sucedida dessa última publicação. As capturas públicas anteriores e os testes locais do componente final passaram. O espaço livre oscilou até 40,277 GB e recuperou para 40,762 GB, sempre acima da reserva.
