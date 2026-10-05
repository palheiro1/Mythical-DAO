# Ragequit — pacote para revisão independente

Preparado em 29 de setembro de 2026. Este documento define o escopo pedido ao revisor. **Atualização de 1 de outubro:** depois das revisões e correções, o utilizador comunicou que o auditor aprova e autorizou a implantação e a proposta. Essa confirmação está registada em [review-acceptance.json](../deployments/ragequit-release/review-acceptance.json), associada aos hashes do pacote corrigido. Não foi fornecida identidade do auditor nem um relatório adicional com esta confirmação. Consultar o [estado da ativação](RAGEQUIT_ACTIVATION_2026_10_01.md).

Histórico, antes das correções de 1 de outubro: [preflight da carteira e nova evidência](RAGEQUIT_PREFLIGHT.md), ensaio recente do Governor real e análise Slither com todos os 51 alertas preservados e triagem interna explícita. O [Standard JSON](../deployments/ragequit-release/compiler-input.json) inclui as 12 fontes completas; a recompilação com solc 0.8.30 reproduziu o bytecode exato. A análise automática e a compilação por outra ferramenta não são apresentadas como revisão independente.

## Reteste pedido após Claude e Grok

As revisões recebidas e a [triagem](AUDIT_TRIAGE_2026_10_01.md) deram origem às [correções de 1 de outubro](AUDIT_REMEDIATION_2026_10_01.md). Rever especialmente: destinatários dos quatro tokens; runtime exato e endereço fixados no frontend/Worker; rejeição de uma API que anuncie um módulo falso com getters corretos; repetição da verificação antes de assinar; remappings explícitos; distinção entre autorização inicial e suficiência operacional; testes que detetam remoção do guard e queima tardia. Confirmar a correspondência entre runtime simulado, Standard JSON e `shared/generated/ragequit-trust.json`. A função `previewRedeem` continua observável durante hooks; avaliar o limite documentado de composição on-chain.

## Versão e entregáveis

O alvo é `MythicalRagequitModule` e os scripts de preparação, verificação e autorização associados. O [manifesto congelado](../deployments/ragequit-release/review-manifest.json) contém os hashes keccak256 das 12 fontes Solidity, compilador 0.8.30, optimizer 200, EVM Cancun e os cinco endereços imutáveis. Os hashes foram novamente conferidos contra os ficheiros locais nesta entrega.

Init code atual: `0x4180449b7b77b9cad40d742b653aaca16d71f39810a5dd62904d4d2d8abe7324`, 5318 bytes. Runtime com os argumentos aprovados: `0x3a4c043fc5bac256e18e0c1f1fe2931cdd506f6c38ea22b00a4c3a41783dd73c`. Os artefactos existentes e a revisão interna estão ligados no [README do pacote](../deployments/ragequit-release/README.md).

O pedido ao revisor inclui relatório com ficheiros/hashes e commit exatos, achados por gravidade, provas de reprodução, correções propostas e confirmação de reteste. A aceitação agora comunicada pelo utilizador foi registada como `approved-as-reported-by-user`, distinguindo-a dos relatórios recebidos anteriormente.

## Escopo

| Área | Ficheiros principais |
|---|---|
| Pagamentos e queima | `contracts/src/MythicalRagequitModule.sol`, dependências OpenZeppelin fixadas no manifesto |
| Implantação | `contracts/script/DeployRagequit.s.sol`, `scripts/prepare-ragequit-release.mjs`, `scripts/preflight-ragequit-deployment.mjs`, `scripts/ragequit-deployment-checks.mjs` |
| Identidade e runtime | `scripts/ragequit-policy.mjs`, `scripts/verify-ragequit.mjs` |
| Autorizar e revogar | `scripts/ragequit-proposal.mjs`, `deployments/ragequit-authorization.template.json` |
| Integração | `worker/ragequit.ts`, `worker/live.ts`, fluxo de saída e confirmação no frontend |

Governor, MANA e tokens externos não são substituídos. Rever as interfaces/comportamentos relevantes dos contratos reais e os pressupostos que o módulo faz sobre eles; não apresentar este trabalho como auditoria completa de todos esses contratos externos. O plano V2 é histórico e está fora do caminho ativo.

## Modelo de ameaça e invariantes

- Um membro só pode queimar o seu próprio MANA com autorização individual; delegação não permite gastar MANA de terceiros. Reentrância por qualquer token ou destinatário não pode produzir uma segunda saída.
- Cada quota é `floor(balanceTreasury × amount / supplyBeforeBurn)`, incluindo MANA da tesouraria na oferta. A cesta é exatamente GEM/WETH/USDC nativo, na ordem fixa; nunca USDC.e, MANA, POL ou NFTs.
- Um pagamento positivo deve sair integralmente da tesouraria e chegar integralmente ao destinatário. Qualquer falha de token, allowance, mínimo, saldo ou oferta reverte também a queima e os pagamentos anteriores. Testar hooks que alterem outro ativo após a transferência inicial.
- Zero individual é válido; três quotas zero, destinatário nulo/tesouraria/módulo/MANA/GEM/WETH/USDC, amount inválido e deadline expirado devem falhar. Testar arredondamento, valores extremos e saídas sucessivas com receitas e gastos intermédios.
- Autorizações da tesouraria são contínuas e revogáveis pela DAO; autorização do membro é exata. Não existem reservas, janela de 72 horas, administrador do módulo, upgrade ou pausa operacional.
- A DAO e administradores dos tokens externos podem mudar a disponibilidade económica/técnica. O módulo não garante prioridade face a despesas, revogações ou outras saídas. Rever frontrunning de saldos/quotas e efeito dos mínimos/prazo sem prometer preços reservados.
- Os scripts devem rejeitar rede, endereços, bytecode, imutáveis e ABI incorretos. Nenhuma comparação pode apagar imutáveis adulterados. A proposta deve consistir exatamente em três `approve` ERC-20 para o módulo verificado, valor nativo zero.
- A web deve invalidar a revisão quando muda a carteira, rede, módulo/cesta, destinatário, amount, mínimos ou validade. Revalidar as duas fontes e simular com o chamador real antes de pedir assinatura.

## Reprodução e evidência disponível

Na pasta `services/dao-portal`, reutilizando dependências existentes:

```sh
FOUNDRY_PROFILE=ci forge test --match-contract RagequitModuleTest
npx vitest run tests/ragequit-release.test.mjs
npm run typecheck
npm test
```

O ensaio [ExistingGovernorFork](evidence/existing-governor-fork-2026-09-29.txt) fez o ciclo de proposta/voto/execução no Governor real para autorizar e revogar, recebimentos posteriores e pausa do USDC no fork. Os scripts de repetição estão em `scripts/rehearse-existing.mjs` e `scripts/rehearse-portal.mjs`; fontes RPC e chaves ficam em variáveis locais ignoradas. O ensaio web usa avanço sintético do bloco no Anvil; testa o percurso da aplicação, não o consenso Polygon.

A [revisão interna](RAGEQUIT_REVIEW.md) documenta três achados corrigidos nos scripts e os testes correspondentes. Deve ser material de apoio, não conclusão imposta ao revisor. A ausência de achados adicionais na revisão interna não é uma garantia.

## Critério de saída

Resolver achados críticos/altos e aceitar explicitamente os riscos remanescentes. Qualquer mudança exige novos hashes, testes e reteste do revisor. Só depois avançar com implantação, verificação on-chain, proposta/voto/execução da DAO e pequena saída real consentida. Nenhuma destas etapas financeiras foi realizada automaticamente.
