# Mythical DAO — plano completo de melhoria visual e de experiência

## 1. Objetivo e decisões fechadas

Transformar o portal numa aplicação reconhecível como parte do universo Mythical Beings, dando prioridade à continuidade com [my.mythicalbeings.io](https://my.mythicalbeings.io/) e usando [mythicalbeings.io](https://mythicalbeings.io/) como referência complementar de marca e narrativa. Referências consultadas em **28 de setembro de 2026**.

Decisões acordadas:

- **Mesma família visual**, com organização adaptada à governação.
- **Interface integralmente em inglês**.
- **Temas claro e escuro**, seguindo inicialmente o dispositivo, com escolha manual persistente.
- **Tom temático e claro**: identidade Mythical na apresentação; linguagem direta nas decisões e operações.
- Melhorar aparência, textos, navegação, propostas, tesouraria, delegação, saída e histórico.

A implementação será feita no [portal existente](/home/usuario/Documentos/GitHub/Mythical%20DAO/services/dao-portal). Continuará independente da aplicação do jogo, mantendo React, TypeScript, Vite e as integrações atuais. Este trabalho não altera contratos, regras económicas, autenticação do jogo ou implantação pública.

## 2. Identidade visual, linguagem e navegação

### Sistema visual

Substituir a composição editorial verde/creme por uma interface de aplicação próxima da carteira oficial:

| Elemento | Decisão |
|---|---|
| Tipografia | Usar a família sans-serif de sistema observada na aplicação; retirar Libre Caslon e DM Sans |
| Fundos | Escuro: preto e painéis grafite. Claro: branco e superfícies cinzentas suaves |
| Cor principal | Turquesa `#2F9088`, presente na aplicação |
| Ações principais | Lima `#BCC754` com texto escuro |
| Cores complementares | Azul `#3B7197` e violeta `#573B97`, usados com consistência por função |
| Componentes | Botões com cantos de 6 px, painéis de 10 px, bordas discretas e espaçamento regular |
| Texto | Corpo de 16 px, informação secundária de pelo menos 14 px, títulos operacionais entre 24 e 36 px |
| Identidade | Logótipo oficial acompanhado por “Mythical DAO”; ícones oficiais dos ativos |

Reutilizar recursos existentes no projeto local da aplicação oficial, com registo de origem. Usar versões claras/escuras do logótipo sem distorção ou recoloração arbitrária. Para funções específicas de governação, criar ícones simples e coerentes com os existentes.

Retirar a ilustração orbital e o emblema substituto atuais. A primeira versão usará o logótipo, MANA e iconografia funcional; não dependerá de imagens de uma temporada que possam ficar desatualizadas.

Concentrar cores, tipografia, espaçamento e estados em variáveis partilhadas. Ajustar as variantes de texto para assegurar contraste nos dois temas. A cor nunca será o único indicador de estado.

### Estrutura e navegação

- Cabeçalho compacto com marca, ligação **“Back to Mythical Beings”**, tema e carteira.
- Navegação lateral no desktop: **Overview, Governance, Treasury, Delegation, Exit DAO, History**.
- **Create proposal** como ação principal, separada dos destinos de navegação.
- Abaixo de 1024 px, substituir a barra lateral por menu acessível; abaixo de 768 px, apresentar formulários e painéis numa coluna.
- Preservar todas as rotas e ligações atuais, incluindo ligações diretas a propostas.
- Rodapé com referências oficiais, histórico e documentação técnica numa área secundária.
- Tema com opções **System, Light, Dark**, aplicado antes da primeira pintura e guardado apenas neste portal.

### Linguagem

Centralizar os textos da interface no catálogo existente, incluindo erros, ajudas, estados e confirmações. Os conteúdos escritos pelos proponentes permanecem intactos.

Exemplos de direção editorial:

| Contexto | Texto previsto |
|---|---|
| Entrada | **Help shape the world of Mythical Beings.** |
| Explicação | **Explore proposals, vote with MANA and follow the DAO treasury.** |
| Identidade | **Community-governed. Powered by MANA.** |
| Preparação | **V2 is being prepared. Explore the portal and save a proposal draft.** |
| Dados indisponíveis | **We couldn’t verify the latest data. Try again.** |
| Revisão de saída | **Review MANA burn and assets to receive** |

Retirar expressões que sugiram propriedade sobre Mythical Beings ou disponibilidade incondicional de saída. Explicar a separação entre propostas executáveis e votações consultivas. Termos técnicos como RPC, calldata e basis points ficarão nos detalhes, mantendo visíveis as consequências relevantes.

## 3. Melhorias por percurso

### Overview

Substituir o grande bloco promocional por uma apresentação compacta seguida de informação útil:

- Indicadores de votações abertas, propostas à espera de execução e ativos da tesouraria.
- Decisões recentes com tipo, estado e ligação ao detalhe.
- Área **Your participation**, com instruções para ligar a carteira, delegar ou consultar votações, conforme os dados disponíveis.
- Acesso permanente a **Create proposal** e **How governance works**.
- Em preparação, explicar o que já pode ser explorado e permitir rascunhos locais, sem simular atividade real.

### Governance e detalhe de proposta

- Manter separadas as propostas executáveis e as votações comunitárias.
- Tornar os cartões mais informativos: título, tipo, estado, autor e resumo das ações ou alternativas.
- Preservar paginação e identificar a pesquisa como limitada à página apresentada.
- No detalhe, apresentar primeiro a decisão e as consequências; depois votação, calendário, execução e fontes.
- Distinguir visualmente **aprovação**, **espera**, **execução confirmada** e **cancelamento**.
- Mostrar valores e destinatários legíveis antes dos detalhes técnicos. Chamadas desconhecidas permanecem explicitamente não interpretadas.
- Prazos derivados de blocos devem ser identificados como estimativas; conservar o valor autoritativo em blocos.

### Create proposal

Organizar o formulário em quatro etapas:

1. **Decision:** tipo, título, problema, decisão e discussão.
2. **Plan:** entregáveis, orçamento, responsáveis, calendário, riscos, conflitos, prestação de contas e cancelamento.
3. **Actions / Choices:** pagamentos e chamadas executáveis, ou alternativas de voto.
4. **Review:** texto final, ações, destinatários, montantes e requisitos de publicação.

Acrescentar instruções nos campos existentes para incluir critérios de aceitação e métricas de sucesso. Mostrar resumo dos pagamentos configurados junto do orçamento narrativo, com confirmação explícita de coerência; não tentar interpretar automaticamente valores em texto livre.

Guardar, importar e exportar continuarão disponíveis sem carteira. Preservar o formato atual dos rascunhos e os seus conteúdos. Voltar entre etapas não perde informação. A validação aponta para o campo e a etapa a corrigir.

Manter a pré-visualização exata do texto publicado e as verificações anteriores à assinatura. Alterar a apresentação nunca deverá reescrever propostas já publicadas.

### Treasury

- Separar claramente **V2 treasury** e **Legacy holdings**.
- Mostrar ícone, símbolo, quantidade, endereço e bloco de referência por conjunto de dados.
- Corrigir “block undefined” e impedir a apresentação de indisponibilidade como saldo zero.
- Apresentar pagamentos pendentes apenas quando as respetivas ações forem identificadas; propostas aprovadas de outro tipo não serão rotuladas como pagamentos.
- Identificar quando a lista cobre apenas as propostas carregadas.
- Explicar que aprovação de pagamento não reserva fundos, mantendo essa informação próxima dos valores relevantes.
- Não acrescentar equivalentes monetários dependentes de um novo serviço de preços.

### Delegation e carteira

- Explicar separadamente saldo MANA, poder de voto e representante.
- Dar destaque a **Delegate to myself** e à escolha de representante.
- Mostrar o motivo de uma ação indisponível junto do controlo: carteira desligada, rede incorreta, preparação ou dados não verificados.
- Abrir um menu ao clicar na carteira ligada; colocar **Disconnect** nesse menu, evitando desligar imediatamente ao clicar no endereço.
- Não apresentar o login da carteira do jogo como equivalente à ligação de uma carteira Polygon.

### Exit DAO e revisão de transações

- Apresentar a saída como funcionalidade da V2, condicionada à disponibilidade efetiva.
- Organizar o percurso em quantidade, pré-visualização e revisão.
- Usar a carteira ligada como destinatário por defeito; permitir outro endereço numa opção explícita.
- Mostrar tolerância em percentagem, mantendo o valor inicial de **0,5%**, os limites existentes e a conversão exata para basis points.
- Mostrar MANA a queimar, ativos previstos, mínimos aceites, destinatário e validade.
- Manter distintas a autorização de MANA e a operação de saída.
- Invalidar confirmações quando mudarem os dados relevantes ou expirar a pré-visualização.
- Preservar os controlos existentes de rede, simulação, autorização exata e confirmação de queima permanente.

### History

- Separar Governor original, V2 e arquivo Snapshot.
- Destacar título, data original, tipo de decisão e fonte.
- Mostrar a importação em detalhes, sem a confundir com a data da decisão.
- Conservar os avisos sobre resultados e assinaturas não verificados.
- Apresentar datas legíveis com fuso horário identificado; manter o timestamp exato acessível.
- Não reconstruir vencedores ou resultados sem evidência suficiente.

## 4. Implementação e compatibilidade

- Criar componentes partilhados para navegação, painéis, ativos, estados de dados, avisos, formulários e revisão.
- Introduzir estados consistentes de **carregamento, preparação, sincronização, indisponibilidade, vazio confirmado e dados disponíveis**.
- Usar o estado real da API e a saúde da indexação. Dados antigos podem permanecer visíveis com indicação de desatualização, mantendo as operações bloqueadas quando necessário.
- Corrigir os tipos do cliente: atualmente a tesouraria assume sempre `asOfBlock`, embora a resposta indisponível não o contenha. Modelar explicitamente as respostas já existentes e aplicar a mesma distinção às listas.
- Preservar endpoints, contratos, ABIs, identificadores, rotas e formato dos rascunhos. Não é necessária migração de base de dados.
- Manter `signingAllowed` e as verificações de transação como requisitos efetivos; a nova interface não os substituirá.
- Servir os recursos gráficos localmente e retirar a dependência das fontes Google atualmente usadas.

Executar em três fases: **base visual e navegação → páginas e percursos → validação e acabamento**. Entregar capturas dos dois temas, inventário de recursos e registo dos cenários verificados.

Reutilizar as dependências instaladas. Antes de builds ou produção substancial de artefactos, executar o preflight de disco com a estimativa cumulativa, preservando a reserva obrigatória de 40 GB.

## 5. Verificação e critérios de aceitação

- **Visual:** todas as páginas nos dois temas, em 390, 768 e 1440 px; ausência de cortes, sobreposições e deslocamento horizontal. Verificar também 320 px e zoom de 200%.
- **Acessibilidade:** teclado completo, foco visível, ordem de leitura, menus e diálogos acessíveis, etiquetas de campos e contraste WCAG AA.
- **Temas:** primeira visita segue o sistema; escolha manual persiste; mudança do sistema funciona quando essa opção está selecionada; sem flash do tema errado.
- **Dados:** testar preparação, sincronização, erro, dados antigos, resposta vazia confirmada e dados reais. Nunca mostrar `undefined`, `NaN` ou zeros inventados.
- **Propostas:** rascunhos antigos continuam a abrir; avançar e recuar preserva conteúdos; importar/exportar conserva dados; o texto revisto coincide com o enviado.
- **Operações:** rede errada, carteira alterada, assinatura rejeitada, simulação falhada, confirmação e reversão; saída com pré-visualização expirada e alterações de quantidade.
- **Histórico:** fontes e datas preservadas, arquivo consultivo distinguido de execução on-chain.
- **Regressão:** executar verificação de tipos, testes existentes relevantes, build e testes de navegador atualizados. Usar cenários locais controlados para estados ativos, sem transações reais.

O trabalho estará concluído quando o portal apresentar continuidade visual clara com a aplicação Mythical Beings, todos os percursos estiverem utilizáveis e os estados e textos refletirem corretamente o que está disponível. A entrega será local e pronta para revisão; a ativação pública da V2 continua a ser um processo separado.
