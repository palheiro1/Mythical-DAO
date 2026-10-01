# Mythical DAO — Revisão técnica completa do módulo Ragequit

**Data:** 1 de outubro de 2026 **Alvo:** `MythicalRagequitModule` e material associado (`services/dao-portal`) **Commit:** `085042e69e04c5ebc7dc029a276ed65cb26ec2d4` **Tipo:** revisão técnica feita com IA (Claude), com execução de código. **Não é uma auditoria independente** e não substitui o reviewer externo previsto no `INDEPENDENT_REVIEW_BRIEF.md`.

## 1. Âmbito e método

**Lido:** `MythicalRagequitModule.sol`; `RagequitModule.t.sol`, `ExistingGovernorFork.t.sol`, `Mocks.sol`; `ragequit-policy.mjs`, `ragequit-proposal.mjs`, `ragequit-deployment-checks.mjs`, `preflight-ragequit-deployment.mjs`, `verify-ragequit.mjs`, `prepare-ragequit-release.mjs`; `worker/ragequit.ts`, `worker/live.ts`, `worker/config.ts`; `src/Membership.tsx`, `src/exit-model.ts`, `shared/domain.ts`; evidência de fork e de cadeia; `RAGEQUIT_REVIEW.md`.

**Executado** (clone do commit, Foundry 1.8.3, `solc` 0.8.30 estático da release oficial, OpenZeppelin 5.6.1):

| Verificação | Resultado |
| --- | --- |
| 15 testes existentes, perfil `ci` (2048 casos de fuzz) | 15/15 passam (reproduz o brief) |
| 5 testes dos scripts de release (`vitest`) | 5/5 passam |
| Recompilação do Standard JSON publicado, com `solc` independente | **Reproduz exatamente** o init code `0x710a2b73…99b24c` e o runtime template; 12 fontes iguais |
| Análise de bytecode (runtime 4210 B) | Sem MCOPY, TSTORE/TLOAD, blob opcodes, SELFDESTRUCT, DELEGATECALL nem CALLCODE; só PUSH0 |
| 11 mutações do contrato contra a suite existente | 9 detetadas, **2 sobrevivem** (ver §3) |
| 6 testes novos (anexos) | 6/6 passam; os de reentrância detetam a mutação sem guard |
| Slither 0.11.6 | 18 resultados no repo; os do módulo são falsos positivos (ver §4) |

**Não feito:** fork de Polygon (sem acesso a RPC), leitura do código dos contratos reais MANA, GEM, WETH e do Governor, Echidna/Halmos/verificação formal, revisão do indexer, i18n e restante frontend. O comportamento dos tokens reais baseia-se na evidência de fork existente e, para o USDC, no código-fonte oficial da Circle.

## 2. Resumo

O contrato é pequeno e bem construído: queima antes de pagar, `nonReentrant`, pós-checks de oferta e saldos, `mulDiv` com arredondamento a favor da tesouraria, sem admin, upgrade nem pausa. **Não encontrei uma falha que permita extrair fundos além da quota pro-rata.** O fuzz de sequências que escrevi confirma que o valor por MANA nunca diminui para quem fica e que o módulo não retém fundos.

Os riscos principais são de **desenho, operação e verificação**, não de código.

| # | Gravidade | Tema |
| --- | --- | --- |
| 1 | Alta | Sem resposta de emergência; allowance máxima expõe o tesouro |
| 2 | Média/Alta | O portal não verifica o bytecode do módulo |
| 3 | Média | Saída quase só em GEM; composição do tesouro |
| 4 | Média | Um ativo bloqueado impede toda a saída |
| 5 | Média | Reprodução por `forge build` depende da versão do Foundry |
| 6 | Baixa | Destinatário pode ser um contrato dos ativos ou o MANA |
| 7 | Baixa | Verificador exige allowance exatamente `maxUint256` |
| 8 | Baixa | Lacunas da suite de testes (2 mutações sobrevivem) |
| 9 | Baixa | Governor sem validação de parâmetros; pragma flutuante |
| 10 | Info | `previewRedeem` lido a meio da transação dá valor enviesado |

## 3. Achados

### 1. Alta — Sem resposta de emergência; allowance máxima expõe o tesouro

**Evidência.** `ragequit-proposal.mjs` concede `approve(module, maxUint256)` a GEM, WETH e USDC nativo. O módulo não tem pausa nem admin. O Governor é o próprio tesouro (`governor == treasury`) e não tem timelock: o fork test executa a proposta logo que o estado é *Succeeded*. `ragequit-review-chain-2026-09-29.json` regista `votingDelay` 41143 e `votingPeriod` 288000 blocos (≈7,6 a 8 dias com 2 a 2,1 s por bloco). **Impacto.** Um defeito no módulo descoberto depois da ativação só se contém com uma proposta completa, e o saldo desses três ativos fica exposto nesse período. **Recomendação.** Começar com allowances finitas por ativo, com teto que sobe por proposta. Escrever um plano de resposta e quem monitoriza o módulo. Tornar isto critério de saída da revisão independente.

### 2. Média/Alta — O portal não verifica o bytecode do módulo

**Evidência.** `worker/ragequit.ts` só compara os getters `treasury()`, `mana()` e `basket()`. Procurei `getCode` e hashes de runtime em `worker/` e não existe nenhum. O endereço vem de `config.contracts.ragequitModule`, e `Membership.tsx` pede `approve(module, units)` de MANA a esse endereço. **Impacto.** Se a configuração ou o worker forem comprometidos, um contrato malicioso com getters iguais recebe aprovações de MANA. A perda por utilizador fica limitada ao montante aprovado, mas é irreversível. **Recomendação.** Fixar no código do portal o endereço final e o hash do runtime instanciado (`0x038f9c83bd7b3d3eb98c06770652a31e9f38cfa52fd7d79517e1a1c6ff3f1eb7`). Comparar `keccak256(getCode(module))` no bloco do preview e bloquear a UI se divergir.

### 3. Média — Saída quase só em GEM

**Evidência.** No fork (bloco 94644170), 1 MANA rendeu 657100440000000000 wei de GEM (≈0,657), 80000000 wei de WETH (≈8×10⁻¹¹ WETH) e 0 USDC nativo. O USDC.e fica fora da cesta. O teste move 50 000 MANA do tesouro, logo o tesouro tem MANA que entra na oferta e dilui cada saída. **Impacto.** Na prática o ragequit troca MANA por GEM, o token do próprio projeto. Se GEM cair, a saída paga num ativo em queda, e saídas em massa vendem GEM no mercado. **Recomendação.** Publicar a composição real do tesouro e a percentagem da oferta de MANA que ele detém. Dizer aos membros o que o ragequit não cobre. Decidir se o USDC.e deve entrar na cesta.

### 4. Média — Um ativo bloqueado impede toda a saída

**Evidência.** `checkPausedRollback` no fork prova que, com o USDC pausado, o `redeem` inteiro reverte, incluindo as quotas de GEM e WETH. O mesmo vale para blacklist do USDC sobre a tesouraria ou o destinatário. **Recomendação.** Decidir se aceitas isto. Alternativa: permitir ao membro prescindir explicitamente de um ativo bloqueado. Se ficar como está, registar como risco aceite.

### 5. Média — A reprodução por `forge build` depende da versão do Foundry

**Evidência.** O Standard JSON reproduz exatamente os hashes revistos. O `forge build` na minha máquina (Foundry 1.8.3) dá um init code diferente: o código é o mesmo, só muda o hash de metadados no fim. A causa é que esta versão acrescenta automaticamente o remapping `@openzeppelin/=node_modules/@openzeppelin/`, que não está nos `settings` revistos. `preflight-ragequit-deployment.mjs` e `verify-ragequit.mjs` leem `out/…json` e comparam o hash do init code e `metadata.settings`, por isso falhariam com outra versão do Foundry. **Impacto.** Não afeta o bytecode a implantar (vem do `deployment-unsigned.json`), mas um revisor ou deployer com outro Foundry não consegue verificar pelo caminho documentado, e pode concluir erradamente que o bytecode é diferente. **Recomendação.** Fixar a versão do Foundry na documentação e no CI, desativar `auto_detect_remappings`, ou fazer os scripts consumirem o output do Standard JSON em vez de `out/`.

### 6. Baixa — Destinatário pode ser um contrato dos ativos

**Evidência.** `redeem` e a UI rejeitam `0`, tesouraria e módulo, mas não `mana`, `gem`, `weth` nem `usdc`. O teste `testRecipientCanBeAnAssetContractAndFundsAreStuck` mostra GEM e USDC presos nos próprios contratos, e os pós-checks passam. **Recomendação.** Rejeitar esses quatro endereços (patch `finding6-recipient.patch`, que mantém os 15 testes existentes a passar) e espelhar na UI. Muda o bytecode: exige novos hashes e reteste.

### 7. Baixa — Verificador exige `allowance == maxUint256`

**Evidência.** `verify-ragequit.mjs` falha se alguma allowance for diferente de `maxUint256` em modo `authorized`. O `FiatTokenV1.transferFrom` da Circle faz `allowed[from][msg.sender] = allowed[from][msg.sender].sub(value)` sem exceção para o máximo. O teste `testAllowanceDriftsBelowMaxWithDecrementingToken` mostra a deriva para `max - pago`. **Impacto.** Alarmes falsos em monitorização depois da primeira saída. Não afeta o módulo. **Recomendação.** Usar um limiar (por exemplo ≥ metade de `maxUint256`).

### 8. Baixa — Lacunas da suite de testes

Mutações do contrato contra a suite original:

| Mutação | Resultado |
| --- | --- |
| Remover post-check de saldos da cesta | Detetada (2 testes) |
| Remover post-check de MANA | Detetada |
| Arredondar para cima | Detetada (3 testes) |
| Remover `recipient == treasury` / `memberBalance` / deadline / mínimos / `ZeroPayment` | Detetadas |
| Calcular com `supply - 1` | Detetada |
| **Remover `nonReentrant`** | **Sobrevive** |
| **Queimar depois dos pagamentos** | **Sobrevive** |

O teste original de reentrância usa o contrato do token como chamador, que tem 0 MANA, e aceita qualquer revert. Passa com ou sem guard. O `RagequitAudit.t.sol` usa um ator com MANA e allowance, verifica o selector `ReentrancyGuardReentrantCall` e deteta a mutação. Mesmo sem guard, os pós-checks revertem a transação com `IncompatibleBalanceChange` (verificado), por isso há duas camadas independentes e isto é só uma lacuna de teste. A ordem queima/pagamento continua sem teste. O fuzz original só cobre saídas isoladas; o novo cobre sequências com receitas intermédias.

### 9. Baixa — Governor e pragma

`verify-ragequit.mjs` regista `proposalThreshold` (0), `votingDelay`, `votingPeriod` e quórum (4 %) mas não os valida; com threshold 0 qualquer pessoa pode propor. Definir mínimos aceitáveis e falhar se divergirem. O pragma `^0.8.30` é flutuante; fixar `0.8.30`.

### 10. Informativo — Leitura a meio da transação

`previewRedeem` é `view` e não está protegido. Durante um `redeem`, os ativos ainda por pagar são lidos contra uma oferta já reduzida (`testReadOnlyReentrancyPreviewIsSkewedMidTransaction`). Um integrador que o chame dentro de um callback de token vê um valor enviesado. Não afeta fundos.

## 4. Triagem do Slither (módulo)

| Detetor | Veredicto |
| --- | --- |
| `arbitrary-send-erc20` (High) | Falso positivo: `from` é o `treasury` imutável, limitado pela allowance e pela fórmula. É o pressuposto de confiança central do desenho. |
| `reentrancy-balance` (High) | Falso positivo: leituras de saldo antes e depois são os pós-checks intencionais, com `nonReentrant`. |
| `uninitialized-local` ×3 | Benigno: `treasuryBefore`, `recipientBefore` e `positive` começam a zero por desenho. |
| `missing-zero-check` | Falso positivo: `code.length == 0` já rejeita `address(0)`. |
| `calls-loop`, `timestamp` | Esperados; o prazo é uma proteção do utilizador. |

Os resultados em `MythicalTreasuryVault` e `MythicalCommunityBallots` estão fora do âmbito (V2 histórico).

## 5. Pontos positivos

- Ordem de efeitos correta; pós-checks cobrem oferta, saldo do chamador e os seis saldos da cesta.
- Queima só do `msg.sender`; a delegação não dá direito de gasto.
- Verificação de todas as cópias das imutáveis no runtime (RQ-01) e identidades fixas em código (RQ-02).
- Build reprodutível pelo Standard JSON com um compilador independente.
- Fork test com Governor e tokens reais: autorização, revogação, receitas posteriores e pausa do USDC.

## 6. Entregáveis anexos

- `RagequitAudit.t.sol`: 6 testes novos (reentrância real, destinatários, deriva de allowance, sequências com conservação, doações ao módulo, leitura a meio da transação). Copiar para `contracts/test/`. Com o patch do achado 6 aplicado, o teste de destinatários deve passar a esperar `InvalidRecipient`.
- `finding6-recipient.patch`: recusa `mana`, `gem`, `weth` e `usdc` como destinatário.

## 7. Critério de saída sugerido

Resolver ou aceitar formalmente os achados 1 a 4 antes da implantação. Corrigir 5 e 6 (qualquer mudança de contrato exige novos hashes, testes e reteste do reviewer). Incorporar os testes novos. Manter `independentReview: pending` até existir um relatório independente aceite.