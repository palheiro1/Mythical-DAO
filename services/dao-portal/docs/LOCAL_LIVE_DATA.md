# Dados reais no servidor local — 29 de setembro de 2026

URL verificado: http://127.0.0.1:8787/#delegation.

## Causa e correção

O processo Wrangler da captura tinha arrancado sem `.dev.vars`. `/api/health` devolvia `setup`, `head: null` e `Configure two independent RPC providers.`; a consulta de membro devolvia HTTP 503 `RPC_NOT_CONFIGURED`. A ligação da carteira funcionava, mas a API não tinha fornecedores para consultar os contratos.

Foi criado o ficheiro local ignorado por Git, com dRPC e PublicNode, e reiniciado apenas o processo deste portal. A criação do ficheiro não recarregou as variáveis no processo que já estava ativo; foi necessário reiniciá-lo. O exemplo e o README documentam agora os endpoints públicos de teste, a cópia sem sobrescrever configuração existente, o reinício e a verificação da API.

A página apresenta o bloco da leitura verificada de membro, distingue a sincronização histórica das consultas de saldo e permite repetir uma consulta falhada. Enquanto uma atualização falhar, não apresenta o bloco anterior como uma verificação atual. As proteções de assinatura e de concordância entre fornecedores mantêm-se.

Uma verificação adicional reproduziu timeouts com consultas concorrentes a saúde, membro, tesouraria, parâmetros e overview. O transporte passou a agrupar leituras do mesmo pedido HTTP e a repetir uma vez falhas transitórias. Cada cliente usa um sinal próprio: o scheduler de lotes do Viem usa URL/sinal como chave e não pode partilhar trabalho entre invocações do Worker. Os lotes foram isolados por pedido antes da validação final. Não se repetem nem se ignoram divergências entre fornecedores. Os erros de saúde registam apenas tipo/resumo, sem URL RPC ou corpo do pedido.

## Leituras reais verificadas

Conta pública: `0xc4CCC6A11329558582c2dA79C18a9AEaC00f59F9`, correspondente ao endereço abreviado na captura.

No bloco `94640258`, a API e consultas independentes aos dois RPCs concordaram:

| Campo | Valor |
|---|---|
| MANA | 33670.936971428589697113 |
| Poder de voto | 33670.936971428589697113 |
| Representante | A própria conta |
| Oferta total de MANA | 1000000 |

Tesouraria: GEM `657100.44`, WETH `0.00008`, USDC nativo `0`, POL `0`, USDC.e `0`. O bloco confirmado da consulta está no ficheiro de evidência. Zero de USDC foi uma resposta dos contratos, não um valor de substituição para dados indisponíveis.

Foram importados na D1 local os dois `ProposalCreated` já verificados em dois RPCs para o preview de staging. A importação foi idempotente, sem avançar cursores. A API confirmou `Executed` para ambas as propostas. Os oito registos Snapshot existentes foram preservados.

## Validação e limites

- Tipos e build passaram; permanece o aviso conhecido de bundle acima de 500 KB.
- 47 testes Vitest passaram, incluindo agrupamento de leituras, recuperação após HTTP 502, falha persistente com apenas uma repetição e isolamento de lotes entre pedidos.
- 4 testes Playwright selecionados passaram em desktop e móvel: distinção de dados indisponíveis/antigos e leituras de membro durante sincronização, incluindo falha RPC e recuperação manual.
- Navegador com API real: saldo, votos, representante, tesouraria, propostas e arquivo verificados; sem exceções JavaScript. Capturas claro/escuro a 390 e 1440 px, sem overflow horizontal.
- A seleção da conta no navegador automatizado usou um fornecedor controlado que rejeita assinaturas. Os pedidos da API não foram intercetados nem substituídos. Não foi enviada qualquer transação.
- Revisão React: consultas existentes deduplicadas mantidas, sem novos efeitos, listeners ou dependências; botão de repetição desativado durante o pedido.
- Depois da correção do transporte, 15 consultas reais em três rondas concorrentes passaram (HTTP 200, saúde `syncing` com bloco válido), todas em menos de um segundo. Uma nova ligação no navegador confirmou novamente o saldo e o bloco, sem exceções JavaScript. [Resultados de concorrência](evidence/local-rpc-concurrency.json).

O histórico completo e a lista de delegados continuam incompletos. Os indicadores dependentes do índice e as operações on-chain permanecem indisponíveis. Isto não impede as leituras diretas de MANA, votos, representante ou tesouraria. O módulo de ragequit continua por implantar.

Esta correção e as novas mensagens foram verificadas no servidor local. Não houve novo deploy público nesta intervenção. A API pública também foi consultada e alternou entre HTTP 200 com o mesmo saldo e HTTP 503 `REQUEST_FAILED`; a causa dessa intermitência remota não foi determinada. Os fornecedores públicos não constituem uma garantia de capacidade para a ativação pública.

Evidência: [respostas e comparação RPC](evidence/local-live-data.json), [navegador após a correção de concorrência](evidence/local-final-browser.json), [delegação desktop](evidence/visual/local-live-delegation-dark-1440.png), [delegação móvel](evidence/visual/local-live-delegation-light-390.png), [tesouraria](evidence/visual/local-live-treasury-1440.png).

Disco: preflight inicial de 0,15 GB passou com 42,695 GB disponíveis. A investigação adicional de concorrência prolongou os testes; foi feito novo preflight com orçamento cumulativo de 0,25 GB, aprovado. Medição final: 42,504 GB, redução global de aproximadamente 0,192 GB durante a tarefa, superior à estimativa inicial de 0,15 GB; a medição inclui atividade do sistema e não foi inteiramente atribuída a ficheiros deste projeto. Dependências reutilizadas; sem instalações, clones ou limpeza de dados. Reserva de 40 GB preservada.
