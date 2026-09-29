# Modelo de ameaças — módulo sem migração

## Autoridade e ativos

O Governor atual é também a tesouraria. Conserva a autoridade de gastar ativos e aprovar/revogar autorizações. O novo módulo não tem proprietário operacional, atualização, pausa, executor arbitrário nem função de custódia. Imutáveis: tesouraria, MANA, GEM, WETH, USDC nativo. A ABI expõe `basket()` na ordem fixa GEM/WETH/USDC. A implantação usa os endereços aprovados da Polygon; símbolos não determinam identidade.

O membro concede autorização exata sobre o seu MANA ao módulo. `burnFrom(msg.sender, amount)` nunca queima o saldo de um delegado. Delegação altera votos, não propriedade. Cada quota é `floor(balanceOf(treasury) * amount / totalSupplyBeforeBurn)`, incluindo o MANA da tesouraria na oferta. `Math.mulDiv` evita overflow intermédio. Mínimos individuais, deadline, destinatário válido e proteção contra reentrância são obrigatórios. Destinatários nulo/tesouraria/módulo são recusados. Três quotas zero são recusadas; quotas individuais zero são permitidas e não são transferidas.

Os pagamentos usam `SafeERC20.safeTransferFrom(treasury, recipient, quota)` e são seguidos de verificações exatas de diferenças de saldo de todas as contas relevantes e da oferta/saldo MANA. Tokens com taxa, rebase durante a operação, bloqueio, retorno falso ou comportamento incompatível fazem reverter toda a transação, incluindo queima e pagamentos anteriores. O módulo não reduz quotas para caber em autorizações.

## Limites económicos e operacionais

- As autorizações máximas da tesouraria são contínuas e revogáveis por governação; não se confundem com a autorização exata do membro.
- Não há reserva de fundos, janela obrigatória de saída, prioridade de inclusão ou proteção contra uma despesa da DAO que preceda uma saída. Os mínimos protegem apenas a transação que for incluída dentro do prazo.
- Os tokens externos mantêm as suas próprias permissões, proxies, pausas e bloqueios. O módulo imutável não pode corrigir uma mudança incompatível nesses tokens. Pausa de USDC foi ensaiada no fork real com reversão integral.
- POL, WPOL, USDC.e, MANA e NFTs ficam fora da cesta; entradas acidentais no módulo não fazem parte do saldo resgatável e não têm resgate administrativo.
- O Governor mantém as regras existentes; o portal lê parâmetros e `state()` e não presume regras V2. A simulação de ações parte do Governor; publicação não garante execução futura.
- Uma revisão de dois minutos e um prazo de transação de quinze minutos são controlos distintos. O contrato não consegue impedir uma carteira de retransmitir calldata ainda válido depois do prazo da interface.
- Dados verificam dois RPCs no mesmo bloco. A governação depende apenas dos seus índices canónicos de Governor/MANA. O ragequit requer também identidade e leituras diretas do módulo/cesta; RPC indisponível nunca se apresenta como saldo zero.
- D1 não assina nem guarda chave de gastos. Cursores conservam o histórico; filtros Approval usam owner/spender e cursores separados. Snapshot e o bot existente continuam independentes.

## Evidência e revisão

Ver [relatório atual](IMPLEMENTATION_STATUS.md), [fork reproduzível](evidence/existing-governor-fork.txt) e testes em `contracts/test/RagequitModule.t.sol`, `ExistingGovernorFork.t.sol`. O fork usa impersonação somente para criar saldos/votos de teste e pausar o token; autorizações e revogação passam por propostas, votos e execução reais do Governor. Não foram publicadas transações. A revisão independente e a pequena saída real continuam necessárias antes da disponibilidade geral.
