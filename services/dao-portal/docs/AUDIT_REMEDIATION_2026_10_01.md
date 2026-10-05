# Correções após as revisões Claude e Grok

1 de outubro de 2026. As revisões originais, patch e testes recebidos foram preservados. A [triagem inicial](AUDIT_TRIAGE_2026_10_01.md) regista a reprodução anterior às correções; este documento descreve a nova implementação. Não foi enviado qualquer pagamento, assinatura, aprovação ou implantação à Polygon pública.

## Alterações

1. **Destinatários:** o contrato rejeita MANA, GEM, WETH e USDC, além de zero, tesouraria e módulo. Portal e preflight aplicam a mesma regra; carteiras que sejam contratos continuam possíveis.
2. **Identidade do módulo:** frontend e Worker incorporam o hash do runtime com os cinco imutáveis instanciados. O gerador utiliza as declarações nomeadas do AST do compilador, não posições ou identificadores adivinhados. Getters corretos não bastam. Os avisos fixos de segurança aparecem diretamente no ecrã, sem ficarem escondidos em detalhes técnicos. Código ausente/alterado, configuração divergente, RPC indisponível ou reorg impedem aprovação e saída. O frontend consulta o seu próprio RPC antes da revisão e novamente antes de assinar; a API não fornece a raiz de confiança.
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

## Publicação do portal de teste

Código inicial no commit `c8b3beb0f81fd54255bae069a932f6eb88f7825d`, com ajuste de visibilidade dos avisos em `926509a169e7b619e3d01296ab80ce9590e29f1a`. Worker de staging `c4f00543-b15c-4065-845b-c7fe896c25cb`; deployment Vercel `dpl_ZP61L1mWVsipX9qQ3HXkyCs1wFjD`, estado READY, target production apenas do projeto isolado `mythical-dao-preview`. [Portal de teste](https://dao-preview.mythicalbeings.io).

[Verificação pública](evidence/audit-remediation-2026-10-01/public-smoke.json): HTTP 200 no portal/configuração/saúde, bundle com o novo hash e bloqueio de implantação pendente, governação habilitada e ragequit indisponível por ausência do módulo. Tesouraria e histórico renderizaram no browser, sem erros reportados. O histórico completo ainda não está sincronizado. Não houve alteração do domínio oficial da DAO, contratos públicos ou notificações.

Gitleaks não encontrou segredos nas alterações preparadas para o commit; os artefactos públicos foram também comparados com as chaves Infura/Graph locais, sem correspondências. Preflight de disco de 2 GB aprovado; cerca de 355 GB disponíveis após a validação, sem instalações nem downloads de browsers e com a reserva de 40 GB preservada.

## Análise estática da versão corrigida

Slither 0.11.6 voltou a analisar o módulo com o perfil Foundry fixado (solc 0.8.30, optimizer 200, Cancun). O verificador do pacote voltou a passar após essa compilação. O [relatório](evidence/audit-remediation-2026-10-01/slither.json) preserva os 51 alertas, IDs, confiança e descrições, mais o hash da cópia bruta local: 3 High, 12 Medium, 6 Low e 30 Informational. Não se apresenta como uma análise sem alertas.

| Alerta | Triagem interna desta versão |
|---|---|
| arbitrary-send-erc20 — High | A origem é a tesouraria imutável; montantes resultam da fórmula e exigem queima do MANA do chamador. Não existe origem ou montante de transferência arbitrários. É a autorização contínua aprovada no desenho; conservação e falhas atómicas foram retestadas. |
| reentrancy-balance — High | O saldo anterior é usado deliberadamente para verificar a diferença após a queima. O guard permanece antes das chamadas; o novo ator com MANA e allowance prova a rejeição pela proteção, e a mutação sem guard falha. Não foi demonstrada exploração nesta triagem. |
| incorrect-exp — High; divide-before-multiply — 9 Medium | Referem-se à aritmética de precisão completa de OpenZeppelin Math. XOR na semente da inversa modular e etapas de divisão/multiplicação são intencionais; não foram substituídos. Dependência e fontes estão fixadas no pacote. |
| uninitialized-local — 3 Medium | O booleano começa em false e todos os três elementos dos arrays são escritos antes do uso; casos de zero e pagamentos positivos passaram. |
| missing-zero-check — Low | O construtor rejeita qualquer endereço sem código, incluindo zero; scripts/portal também fixam os contratos aprovados. |
| calls-loop — 4 Low | Loops de três ativos fixos; os tokens externos continuam a poder bloquear a operação. Essa disponibilidade é um pressuposto explícito, não foi ocultada com exclusão de detetores. |
| timestamp — Low | Comparação deliberada com o deadline do membro; não existe uso para sorteio ou preço. |
| assembly, pragma/solc-version, complexidade e literal longo — Informational | Assembly/constantes sobretudo nas dependências fixadas; os pragmas permissivos não alteram o compilador exato do pacote. A complexidade do redeem inclui as verificações de destinatários e conservação. Permanecem disponíveis para revisão externa. |

Esta classificação interna não encerra a revisão independente. O revisor deve retestar os três alertas High no contexto da fórmula, das autorizações e dos tokens reais e decidir sobre os pressupostos de disponibilidade/composição documentados.

CI do código publicado `926509a`: [execução 36865451996](https://github.com/palheiro1/Mythical-DAO/actions/runs/36865451996) concluída com sucesso nos três jobs (portal, subgraph e Telegram). A validação inclui o novo controlo de integridade entre fontes, compilação, pacote e confiança distribuída na aplicação.
