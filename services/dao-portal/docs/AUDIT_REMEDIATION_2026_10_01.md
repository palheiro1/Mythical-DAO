# Correções após as revisões Claude e Grok

1 de outubro de 2026. As revisões originais, patch e testes recebidos foram preservados. A [triagem inicial](AUDIT_TRIAGE_2026_10_01.md) regista a reprodução anterior às correções; este documento descreve a nova implementação. Não foi enviado qualquer pagamento, assinatura, aprovação ou implantação à Polygon pública.

## Alterações

1. **Destinatários:** o contrato rejeita MANA, GEM, WETH e USDC, além de zero, tesouraria e módulo. Portal e preflight aplicam a mesma regra; carteiras que sejam contratos continuam possíveis.
2. **Identidade do módulo:** frontend e Worker incorporam o hash do runtime com os cinco imutáveis instanciados. O gerador utiliza as declarações nomeadas do AST do compilador, não posições ou identificadores adivinhados. Getters corretos não bastam. Código ausente/alterado, configuração divergente, RPC indisponível ou reorg impedem aprovação e saída. O frontend consulta o seu próprio RPC antes da revisão e novamente antes de assinar; a API não fornece a raiz de confiança.
3. **Endereço fixado:** `shared/generated/ragequit-trust.json` mantém `moduleAddress: null` enquanto não existe implantação verificada. Depois de verificar a implantação em dois RPCs, `scripts/pin-ragequit-deployment.mjs` fixa o endereço no código; publicar frontend e Worker reconstruídos. Nenhum endereço previsto ou de fork é tratado como implantação pública.
4. **Compilação:** Foundry 1.3.5 na CI, solc 0.8.30, optimizer 200, Cancun; remappings explícitos e autodeteção desativada. Standard JSON recompilado com criação e runtime idênticos. O pacote de 5050 bytes ficou arquivado em `deployments/historical/ragequit-pre-audit-2026-10-01/`.
5. **Autorizações:** `authorized` exige os três valores máximos na autorização inicial; `revoked` exige zero; `operational AMOUNT_IN_MANA` verifica suficiência para uma saída concreta, aceitando decrementos normais. `VERIFICATION_BLOCK` permite verificar o bloco confirmado da autorização inicial. Não há redução automática de pagamentos para caber numa autorização.
6. **Testes:** incorporados os seis testes de Claude, adaptando o caso de destinatários e acrescentando um observador que exige a queima antes do primeiro pagamento. Mutantes sem guard e com queima tardia são detetados. Adicionados testes de atestação, preflight, reorg, RPC indisponível e manutenção da governação quando ragequit não está disponível.

A prévia da API usa saldos no bloco confirmado e devolve os hashes/blocos usados. Antes de assinar, o backend verifica a identidade no bloco confirmado e volta a simular a operação no estado recente, mantendo os mínimos, prazo e atomicidade do contrato.

## Cesta e pressupostos preservados

A [avaliação de USDC.e e USDT0](RAGEQUIT_CANDIDATE_ASSETS.md) encontrou saldo zero de ambos e dependências adicionais de disponibilidade. A cesta mantém GEM/WETH/USDC nativo. Não foram acrescentados tokens nem assumidas conversões.

Permanecem as autorizações contínuas revogáveis pelo Governor, ausência de pausa/upgrade do módulo, MANA da tesouraria incluído na oferta e inexistência de janela/reserva de saída. Estes pontos foram decisões de arquitetura, não falhas reparadas silenciosamente. A implementação não modifica Governor, delegações, regras, D1, Graph ou Telegram.

`previewRedeem` permanece uma função de consulta sem proteção de reentrância: durante um hook on-chain, pode observar um estado intermédio. A prévia web consulta um bloco canónico concluído; não usa a função como oráculo dentro de outra transação. O teste conserva esta limitação explícita para o revisor. Não se declara segura uma integração on-chain arbitrária que dependa dessa observação.

A fixação de runtime protege contra uma API/configuração que anuncie um módulo diferente enquanto o bundle permanece confiável. Não protege contra substituição do próprio frontend publicado ou comprometimento do RPC independente; esses são pressupostos distintos.

## Pacote novo

- Init code: **5318 bytes**, `0x4180449b7b77b9cad40d742b653aaca16d71f39810a5dd62904d4d2d8abe7324`.
- Runtime instanciado: `0x3a4c043fc5bac256e18e0c1f1fe2931cdd506f6c38ea22b00a4c3a41783dd73c`.
- [Manifesto exato](../deployments/ragequit-release/review-manifest.json), [procedimento de ativação](../deployments/ragequit-release/README.md), [brief de reteste](INDEPENDENT_REVIEW_BRIEF.md).

## Evidência

[Diretório desta correção](evidence/audit-remediation-2026-10-01/). O fork no bloco 94768142 passou pelo ciclo real de proposta/voto/execução para autorizar e revogar, cancelamento permitido/rejeitado, saída com USDC inicialmente zero, receita posterior e pausa de USDC com reversão integral. Verificou ainda consumo de autorização em WETH e USDC e manutenção do máximo no GEM.

[Mutação controlada](evidence/audit-remediation-2026-10-01/mutations.json): baseline aprovado; retirar `nonReentrant` ou atrasar a queima provoca falhas. Execuções isoladas; os mutantes não entraram no código nem no pacote de implantação. [Recompilação independente da ferramenta Foundry](evidence/audit-remediation-2026-10-01/reproducibility.json) idêntica; isto não é uma auditoria independente.

Os resultados finais de testes, browser, build e espaço em disco constam de `validation.json` neste diretório. As capturas com dados controlados não representam saldos ou autorizações reais; os testes de assinatura usam uma carteira simulada. A ativação de uma saída pública permanece pendente de reteste do pacote, implantação verificada, aprovação da DAO e pequena saída real consentida. `independentReview` continua `pending`.
