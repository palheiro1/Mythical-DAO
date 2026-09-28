# Plano de implementação — portal independente da Mythical DAO

## 1. Objetivo e decisões de produto

Criar **dao.mythicalbeings.io** como interface principal da DAO, com propostas, votação, delegação, tesouraria e ragequit. O funcionamento corrente será independente de Tally, Snapshot e CharmVerse.

O lançamento incluirá:

| Área | Funcionalidades |
|---|---|
| Visão geral | Propostas abertas, votações, próximas execuções e resumo da tesouraria. |
| Propostas executáveis | Preparação, publicação, votação, agendamento e execução de decisões on-chain. |
| Votações comunitárias | Escolha entre várias alternativas, inteiramente on-chain, sem execução automática de despesas. |
| Delegação | Consultar representantes, delegar e voltar a votar em nome próprio. |
| Tesouraria | Ativos, movimentos, pagamentos aprovados e ligações às transações. |
| Ragequit | Queimar MANA e receber uma parcela proporcional dos ativos abrangidos. |
| Histórico | Consultar a governação anterior e distinguir os contratos antigos dos novos. |

**Decisões acordadas:** manter o MANA atual; lançar novos contratos de governação e tesouraria; permitir ragequit a qualquer momento; queimar definitivamente os MANA entregues; manter as despesas ainda não pagas na base de cálculo da saída.

A interface será em **inglês**, adaptada a computador e telemóvel, com estrutura preparada para traduções. A consulta será pública; as operações serão assinadas pela carteira do membro. As taxas das transações serão pagas pelo utilizador na primeira versão.

**O fórum fica para uma fase posterior.** No lançamento, as propostas poderão incluir uma ligação para discussão externa. Não serão implementados comentários, mensagens privadas, moderação comunitária ou contas com palavra-passe.

## 2. Arquitetura e organização técnica

### Aplicação e infraestrutura

Criar um projeto versionado próprio em `services/dao-portal`, separado do serviço de notificações existente.

| Componente | Implementação |
|---|---|
| Interface | React, TypeScript e Vite. |
| Carteiras e contratos | Wagmi e Viem; carteiras instaladas no navegador e WalletConnect para dispositivos compatíveis. |
| Alojamento e API | Cloudflare Workers com Static Assets. |
| Índice de governação | Cloudflare D1, alimentado por um serviço próprio de leitura da Polygon. |
| Contratos e testes | Solidity, bibliotecas OpenZeppelin e Foundry. |
| Notificações | Adaptar o serviço Telegram existente para os novos contratos e ligações do portal. |

Esta escolha aproveita a infraestrutura já usada no projeto. Cloudflare suporta a combinação React/Vite com Workers e a exportação dos dados de D1. [React no Cloudflare](https://developers.cloudflare.com/workers/framework-guides/web-apps/react/), [exportação de D1](https://developers.cloudflare.com/d1/best-practices/import-export-data/)

A blockchain será a fonte autoritativa de votos, delegações, estados e movimentos. A base de dados servirá para pesquisa e apresentação rápida; não poderá aprovar propostas nem movimentar fundos.

### Dados, indexação e independência

- Indexar eventos do MANA, Governor antigo, novo Governor, votações comunitárias, timelock e tesouraria.
- Guardar identidade completa: rede, contrato, identificador da proposta, bloco, hash do bloco e transação.
- Preservar descrição e ações exatas das propostas, necessárias para verificar o seu identificador e executar o conteúdo aprovado.
- Usar valores inteiros para tokens e votos; transmitir grandes números na API como texto, evitando perda de precisão.
- Fazer leituras periódicas a cada minuto, com processamento limitado por lote, recuperação após interrupções e deduplicação.
- Começar com a margem de 64 confirmações já usada pelo serviço existente; verificar hashes e reconstruir o índice quando houver reorganizações.
- Separar visualmente transações pendentes, incluídas e confirmadas. Antes de assinar, consultar e simular novamente o estado atual.
- Configurar dois fornecedores RPC independentes. Se os dados estiverem atrasados ou divergentes, mostrar essa situação e impedir a assinatura baseada em informação inválida.

A API pública terá recursos para configuração dos contratos, propostas, votações, delegados, tesouraria e saúde da indexação, documentados em OpenAPI. As operações financeiras serão enviadas pela carteira diretamente aos contratos.

Importar uma vez o histórico disponível de Snapshot, preservando origem, datas e limitações de verificação. Depois da transição, esse arquivo será somente de leitura e não exigirá consultas ao Snapshot ou ao Tally.

Os rascunhos ficarão inicialmente no navegador, com exportação e importação. As propostas publicadas terão texto e opções recuperáveis dos eventos on-chain. Não haverá dependência de um servidor privado para recuperar o conteúdo aprovado.

### Experiência das operações

Cada operação apresentará uma revisão legível antes da assinatura: rede, contrato, destinatário, ativo, montante, efeito e taxa estimada. Os detalhes técnicos ficarão numa área expansível.

O fluxo de proposta executável será:

**Rascunho → revisão → publicação → votação → aprovação/rejeição → espera → execução → comprovativo.**

A criação seguirá o modelo de proposta do projeto: problema, decisão, entregáveis, orçamento, responsáveis, calendário, riscos, conflitos de interesse, prestação de contas e cancelamento. A interface distinguirá compromissos descritos no texto de condições efetivamente impostas pelos contratos.

## 3. Contratos, votação e ragequit

### Base confirmada e desenho novo

Na consulta de **28/09/2026**, a Polygon confirmou que o Governor atual usa o MANA indicado no projeto. O código verificado do MANA inclui delegação, histórico de votos e queima. Isso permite preservar o token e as delegações existentes. Não foi validado um mecanismo atual de ragequit.

Referências na Polygon, rede **137**:

| Contrato/ativo | Endereço |
|---|---|
| MANA existente | `0x2caCCa1266653bB090D3Fb511456EBCA33150562` |
| Governor antigo | `0x7B9e327748462F1038c9D081c98d189b22C60A27` |
| WETH | `0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619` |
| USDC.e | `0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174` |

Os novos endereços serão acrescentados a um manifesto de implantação com código, parâmetros, permissões e transações verificáveis.

Implementar quatro contratos, sem proxies de atualização:

| Contrato | Responsabilidade |
|---|---|
| **MythicalGovernorV2** | Receber, votar e aprovar propostas executáveis. |
| **GovernanceTimelock** | Impor o prazo entre agendamento e execução. |
| **MythicalTreasuryVault** | Guardar ativos, executar pagamentos autorizados e processar ragequit. |
| **MythicalCommunityBallots** | Realizar votações comunitárias com várias alternativas. |

Usar os módulos de governação da OpenZeppelin como base, acrescentando apenas as adaptações necessárias. Os contratos novos e as adaptações exigirão revisão própria; usar bibliotecas existentes não equivale a auditar o conjunto. [Governação OpenZeppelin](https://docs.openzeppelin.com/contracts/5.x/governance)

### Propostas executáveis

| Regra inicial | Especificação |
|---|---|
| Mínimo para propor | 250 MANA de poder de voto delegado, verificado no bloco anterior. |
| Início da votação | 41.143 blocos após a criação. |
| Duração | 288.000 blocos. |
| Quórum | Votos a favor + abstenções equivalentes a pelo menos 10% da oferta no bloco de referência. |
| Aprovação | Pelo menos 2/3 dos votos a favor ou contra devem ser favoráveis; exige votos favoráveis positivos. |
| Espera para executar | Pelo menos 72 horas após o agendamento. |

Preservam-se inicialmente os prazos em blocos do Governor atual. A interface mostrará datas estimadas, identificando que os blocos determinam o início e o fim da votação. A espera de 72 horas será medida em tempo.

O poder de voto e a oferta usados no apuramento ficarão fixados no bloco de referência. Transferências, delegações ou queimas posteriores não reescreverão uma votação em curso.

Qualquer pessoa poderá agendar e executar uma proposta elegível. Só o Governor terá inicialmente os papéis de proponente e cancelador no timelock; a conta de implantação perderá os privilégios administrativos após a configuração. O prazo mínimo de 72 horas não poderá ser reduzido abaixo desse limite.

Mudanças aos parâmetros de governação também terão de passar pela governação. Não haverá uma chave operacional capaz de gastar a tesouraria.

O criador de propostas terá modelos para pagamentos e alterações de parâmetros, além de um modo avançado para ações contratuais. Todas as ações de um lote serão mostradas e simuladas em conjunto.

### Votações comunitárias com alternativas

Implementar um contrato separado, sem autoridade sobre a tesouraria:

- Entre 2 e 20 alternativas, mais abstenção.
- Mínimo de 250 votos delegados para criar; mesmos prazos iniciais do Governor.
- Um voto por endereço, numa alternativa ou em abstenção, ponderado pelo poder delegado no bloco de referência.
- Sem alteração do voto na primeira versão.
- Quórum de 10% da oferta histórica, contando todas as alternativas e abstenções.
- Vence a alternativa com mais peso; empate ou falta de quórum não produz vencedor.
- Uma votação empatada poderá originar outra votação, com novo identificador.
- Opções, texto e regras ficam imutáveis após publicação; cancelamento pelo autor apenas antes do início.
- O resultado não desencadeia pagamentos. Qualquer despesa exige uma proposta executável própria.

Os parâmetros aplicáveis serão registados na criação de cada votação, para que alterações futuras não modifiquem processos já publicados.

### Delegação

Mostrar separadamente saldo de MANA, poder de voto recebido e representante escolhido.

O membro poderá delegar numa conta ou em si próprio. A delegação não transfere os tokens e não concede ao representante o direito de exercer ragequit com tokens de terceiros.

### Ragequit e regras económicas

A primeira versão abrangerá **POL nativo, WETH e USDC.e efetivamente depositados na nova tesouraria**. MANA, NFTs e ativos noutras contas ou redes não integrarão a cesta de saída.

Para cada ativo:

**Montante recebido = saldo do ativo × MANA queimado ÷ oferta total de MANA antes da queima.**

Regras obrigatórias:

- Usar a oferta total on-chain, incluindo os MANA detidos pela tesouraria; não usar apenas tokens delegados ou votos ativos.
- Arredondar cada pagamento para baixo na unidade mínima do ativo.
- Permitir saída parcial ou total dos MANA detidos pelo membro.
- Processar toda a cesta numa operação atómica: ou a queima e todos os pagamentos acontecem, ou toda a operação reverte.
- Rejeitar operações que não produzam qualquer pagamento positivo.
- Exigir autorização apenas para o montante de MANA a queimar.
- Permitir escolher o destinatário dos pagamentos.
- Incluir montantes mínimos aceites por ativo e prazo de validade na transação, para proteger contra alterações entre simulação e execução.
- Proteger o contrato contra reentrância e transferências incompatíveis.
- Não incluir uma pausa administrativa do ragequit controlada por uma conta individual.

As funções públicas mínimas serão `previewRedeem` e `redeem`, com eventos que identifiquem membro, destinatário, MANA queimado e ativos pagos.

**Uma proposta aprovada não reservará fundos.** Até ao pagamento, esses ativos continuam disponíveis para ragequit. Se as saídas deixarem saldo insuficiente, a execução da despesa falhará integralmente; não reduzirá silenciosamente o pagamento. Será necessário repor fundos ou aprovar uma proposta revista.

A interface mostrará essa consequência tanto ao votar numa despesa como ao consultar pagamentos pendentes.

A cesta inicial será fixa nesta versão. Ativos não abrangidos terão identificação explícita e só poderão ser movimentados pela governação. Um token externo pausado ou uma transferência recusada pode impedir a operação; nesse caso, a atomicidade preservará os MANA do membro.

## 4. Fases, entregáveis e migração

| Fase | Trabalho e entregável | Condição de conclusão |
|---|---|---|
| **0 — Especificação e evidência** | Registar contratos, permissões, ativos, origens de receitas e regras económicas; modelar ameaças e simular a viabilidade da migração. | Manifesto técnico e especificação dos contratos sem ambiguidades. |
| **1 — Contratos** | Implementar Governor, timelock, tesouraria e votações comunitárias, com testes e scripts de implantação reproduzíveis. | Ciclo completo de governação e ragequit demonstrado localmente e em rede de testes. |
| **2 — Portal e dados** | Construir interface, ligação às carteiras, indexação, API, histórico e integração com o serviço Telegram. | Todos os percursos funcionam sem Tally, Snapshot ou CharmVerse. |
| **3 — Revisão e ensaio** | Revisão independente dos contratos, correções, testes de utilização, recuperação e simulação da migração. | Nenhum problema crítico ou elevado por resolver; correções revistas. |
| **4 — Implantação e transição** | Publicar contratos verificados, configurar permissões, obter aprovação da DAO, migrar ativos e ativar o domínio. | Ragequit real validado, ativos reconciliados e portal operacional. |
| **Posterior — Fórum** | Adicionar tópicos, respostas, pesquisa, perfis e moderação sobre as identidades e propostas existentes. | Projeto e critérios próprios, fora do lançamento inicial. |

### Sequência da migração

1. Implantar e verificar os novos contratos, sem transferir imediatamente toda a tesouraria.
2. Confirmar endereços, código, parâmetros e permissões com uma verificação independente.
3. Disponibilizar o portal para consulta e publicar a proposta de adoção da nova governação.
4. Preparar as ações exatas de transferência dos ativos do Governor antigo para a nova tesouraria.
5. Simular essas ações sobre uma cópia do estado real da Polygon.
6. Executar a migração através das permissões e da votação efetivamente exigidas pelo sistema antigo.
7. Atualizar as origens configuráveis de receitas para o novo endereço, com os responsáveis correspondentes.
8. Reconciliar saldos e validar uma saída de pequeno valor, previamente prevista no procedimento de lançamento.
9. Assinalar o Governor antigo como histórico no portal e manter visíveis eventuais fundos ou atividade residual.

As propostas antigas não serão convertidas artificialmente em propostas do novo Governor. As que estiverem em curso terão de ser concluídas ou tratadas explicitamente na transição.

A migração não será declarada concluída enquanto receitas operacionais identificadas continuarem a entrar no contrato antigo sem um tratamento aprovado. Alterações a sistemas externos da Tarasca serão dependências identificadas na fase 0.

O serviço de notificações existente será preservado durante os ensaios. A transição para novos contratos e ligações ocorrerá após validação, evitando mensagens duplicadas.

**Estimativa de planeamento:** 10–14 semanas, considerando uma pessoa dedicada ao desenvolvimento, apoio especializado em Solidity e disponibilidade de revisão independente. Inclui implementação, integração e ensaios; a contratação da revisão, aprovações comunitárias e dependências externas podem prolongar o calendário.

## 5. Testes, lançamento e operação

### Testes obrigatórios

**Contratos e economia**

- Limites exatos do mínimo de proposta, quórum e maioria de 2/3.
- Votos duplicados, abstenções, empates, falta de quórum e fronteiras dos prazos.
- Delegação antes e depois do bloco de referência.
- Ragequit parcial, total e sucessivo por vários membros, verificando oferta, pagamentos e arredondamentos.
- Ausência de autorização, saldo insuficiente, montantes mínimos e prazo expirado.
- Tesouraria vazia, destinatário que rejeita POL, token que falha e tentativa de reentrância.
- Queima após votar: redução do poder futuro, preservando o histórico da votação.
- Saídas entre aprovação e execução: pagamento insuficiente deve reverter.
- Impossibilidade de contornar as 72 horas, executar duas vezes ou gastar através de uma conta administrativa.
- Testes de propriedades para garantir que o total pago nunca excede os ativos disponíveis.

**Portal e infraestrutura**

- Carteira desligada, rede incorreta, assinatura recusada e transação substituída ou revertida.
- Distinção inequívoca entre votação comunitária, aprovação de despesa e despesa executada.
- Apresentação de todas as ações de uma proposta e integridade entre texto, destinatários e transação.
- Falha de RPC, atraso do índice, reorganização da cadeia e reconstrução após interrupção.
- Recuperação de dados a partir de exportação e reconstrução do histórico on-chain.
- Utilização em telemóvel, navegação por teclado, contraste e leitura acessível.
- Teste com os domínios de Tally, Snapshot e CharmVerse bloqueados.
- Falha do serviço Telegram sem impedir as operações de governação.

### Critérios de lançamento

O lançamento exige contratos verificados publicamente, revisão independente concluída, migração aprovada, permissões reconciliadas, documentação de recuperação e ragequit operacional.

Será demonstrado o percurso completo:

**Propor → votar → aprovar → agendar → permitir saída durante a espera → executar → confirmar os movimentos.**

Será também demonstrado que um membro pode exercer ragequit sem depender da disponibilidade do portal, usando o contrato verificado.

### Operação e pressupostos

- Monitorizar atraso da indexação, falhas de RPC, propostas aprovadas, execuções e movimentos da tesouraria.
- Manter exportações dos dados, implantação reproduzível e procedimento para regressar à versão anterior da aplicação.
- Tratar contratos implantados como permanentes: alterações incompatíveis exigem nova versão e migração governada.
- Separar ambientes de testes e produção; manter segredos fora do código, dos registos e do navegador.
- Aplicar as regras locais de espaço em disco antes de instalações e compilações substanciais, reutilizando dependências e preservando a documentação original.
- Pressupor disponibilidade do subdomínio `dao.mythicalbeings.io`.
- Orçamentar desenvolvimento, revisão independente, infraestrutura e taxas de implantação separadamente; este plano não fixa preços ainda não cotados.

As regras reforçadas e a janela de saída reduzem riscos, mas não eliminam concentração ou aquisição de poder de voto. O lançamento deverá apresentar essas regras e limitações como características verificáveis do sistema.

