**Revisão independente do pacote Ragequit da Mythical DAO**  
(Commit `085042e69e04c5ebc7dc029a276ed65cb26ec2d4` — 1 de outubro de 2026)

Esta é uma revisão técnica independente do módulo `MythicalRagequitModule` e do pacote de preparação/autorização associado, conforme o brief em `INDEPENDENT_REVIEW_BRIEF.md`. Não substitui uma auditoria formal paga, mas cobre o contrato, as invariantes declaradas, a documentação interna, os scripts de verificação e o modelo de ameaças.

### 1. Resumo executivo

O design é **minimalista, imutável e não-custodial**, alinhado com o espírito clássico de ragequit (Moloch-style) mas adaptado a um Governor + tesouraria já existentes na Polygon. O módulo:

- Queima apenas o MANA do `msg.sender` via `burnFrom`.
- Calcula quotas pro-rata com `Math.mulDiv` (floor) usando a supply **antes** da queima (incluindo MANA da tesouraria).
- Paga exatamente a cesta fixa **GEM → WETH → USDC nativo**.
- Exige mínimos por ativo + deadline.
- Verifica atomicamente todos os deltas de saldo + supply no final.
- Não tem owner, upgrade, pausa, execução arbitrária ou janela de saída garantida.

**Veredito preliminar**: O núcleo Solidity está bem construído e as proteções principais (reentrância, atomicidade, autorização do membro, cesta fixa) estão corretas. Os riscos remanescentes são sobretudo económicos/operacionais (autorizações contínuas da tesouraria, comportamento dos tokens externos e frontrunning de saldos), não bugs de implementação óbvios. Os três achados da revisão interna (RQ-01 a RQ-03) nos scripts de verificação foram relevantes e aparentemente corrigidos.

### 2. Análise do contrato (`MythicalRagequitModule.sol`)

```solidity
// Principais pontos do código (versão do commit)
function redeem(uint256 amount, address recipient, uint256[3] calldata minimums, uint256 deadline)
    external nonReentrant returns (uint256[3] memory amounts)
{
    // Validações de recipient, deadline, amount vs balance/supply
    // Snapshot de balances da tesouraria e do recipient
    // Cálculo: amounts[i] = mulDiv(treasuryBefore[i], amount, supply)
    // Verificação de mínimos + pelo menos um pagamento positivo
    mana.burnFrom(msg.sender, amount);          // só o caller
    // safeTransferFrom da tesouraria para o recipient
    // Verificações finais de supply, balance MANA e 6 balances da cesta
}
```

**Pontos fortes**
- Uso correto de `ReentrancyGuard` + `SafeERC20`.
- `Math.mulDiv` evita overflow intermédio.
- Queima estritamente do `msg.sender` (delegação não permite gastar MANA alheio).
- Verificação pós-transferência completa (supply, balance do member e os 6 balances da cesta) protege contra hooks que alterem outros ativos ou queimas “fantasma”.
- Construtor valida que os 5 endereços são contratos distintos e não-zero.
- Cesta imutável e ordenada (GEM/WETH/USDC nativo).
- Zero individual permitido; zero total rejeitado; recipient inválido rejeitado.

**Pontos a observar / riscos residuais**
1. **Autorizações da tesouraria são contínuas (maxUint256)**  
   A DAO pode gastar ou revogar a qualquer momento. Não há reserva nem janela de saída. Um membro pode ver a sua quota diminuir (ou a tx reverter) se a DAO gastar entre a simulação e a inclusão. Isto é declarado no threat model e está correto do ponto de vista do código, mas deve ser comunicado claramente aos membros.

2. **Tokens externos**  
   O módulo assume comportamento “bem comportado” dos 3 tokens da cesta. Tokens com fee-on-transfer, rebase durante a tx, blacklist ou pausa fazem a tx reverter integralmente (bom). O ensaio de pausa do USDC no fork real confirmou isso. Contudo, se um token passar a retornar menos do que o pedido sem reverter, a verificação final de saldo detecta e reverte.

3. **Arredondamento e supply da tesouraria**  
   A inclusão do MANA da tesouraria na supply é intencional e correta para pro-rata. Em cenários de supply muito concentrada + amounts pequenos, o floor pode gerar quotas zero em alguns ativos (permitido).

4. **Frontrunning de saldos**  
   Um atacante (ou a própria DAO) pode alterar o saldo da tesouraria entre a preview e a execução. Os mínimos + deadline mitigam, mas não eliminam o risco económico.

5. **Ausência de proteção contra dust / spam**  
   Não há custo mínimo nem cooldown. Em condições normais não é crítico, mas em cenários de gas muito baixo pode ser spamado.

Nenhum bug de lógica crítico ou alto foi identificado no contrato em si.

### 3. Scripts, verificação e implantação

Os scripts de preparação, preflight, verificação de runtime e geração de propostas foram reforçados após a revisão interna:

- RQ-01 (alta): verificação de **todas** as cópias dos imutáveis no runtime (não apenas getters).
- RQ-02 e RQ-03: hardening de identidades, RPCs distintos, reconfirmação de hash de bloco e separação USDC nativo vs USDC.e.

O manifesto congelado, o Standard JSON e a recompilação com solc 0.8.30 que reproduz o bytecode são boas práticas. O pacote está preparado para revisão independente e ainda não foi implantado (estado correto).

### 4. Modelo de ameaças e invariantes (cobertura)

| Invariante | Status |
|------------|--------|
| Só queima MANA próprio | ✅ |
| Reentrância não produz segunda saída | ✅ |
| Quota = floor(treasury × amount / supplyBefore) | ✅ |
| Cesta fixa GEM/WETH/USDC nativo | ✅ |
| Pagamento positivo sai e chega integralmente (ou reverte tudo) | ✅ |
| Zero total / recipient inválido / deadline / amount inválido falham | ✅ |
| Autorizações da tesouraria contínuas e revogáveis | ✅ (declarado) |
| Scripts rejeitam rede/endereços/bytecode errados | ✅ (após correções) |

### 5. Achados (severidade)

**Nenhum achado crítico ou alto novo no contrato.**

**Médios / Informativos**
- **M-01 (Informativo / Design)**: Autorizações contínuas da tesouraria + ausência de janela de saída. Risco económico real em caso de despesa simultânea da DAO. Mitigação: comunicação clara + mínimos + deadline curto na UI.
- **M-02 (Informativo)**: Dependência de comportamento futuro dos tokens externos (especialmente USDC nativo). Já ensaiado com pausa.
- **I-01**: Considerar emitir um evento mais rico ou incluir o `block.timestamp` / `supply` no evento para facilitar indexação off-chain.
- **I-02**: Os testes de fuzz (2048 casos) e o ensaio no Governor real são sólidos; manter a cobertura quando houver qualquer alteração de bytecode.

### 6. Recomendações antes de ativação

1. Manter `independentReview: pending` até existir relatório formal aceite.
2. Após qualquer mudança de fonte → novos hashes + recompilação + reteste.
3. Implantar apenas o módulo → verificar runtime + imutáveis on-chain com os scripts endurecidos.
4. Gerar propostas de autorização (3× `approve(module, type(uint256).max)`) e de revogação.
5. Executar uma saída real pequena e consentida antes de anunciar disponibilidade geral.
6. Na UI: invalidar preview sempre que carteira/rede/módulo/amount/mínimos/deadline mudarem e simular com o caller real.

### 7. Conclusão

O pacote está em bom estado técnico. O contrato é simples, correto e bem protegido nas dimensões que controla. Os riscos principais são os inerentes ao modelo escolhido (autorizações contínuas + tokens externos + sem janela de saída), e não bugs de implementação. A documentação interna, o manifesto congelado e as correções nos scripts de verificação elevam a qualidade do processo.

Posso aprofundar qualquer secção (por exemplo análise linha-a-linha de um script específico, comparação com outras implementações de ragequit, ou checklist de ativação passo-a-passo) se quiseres.
