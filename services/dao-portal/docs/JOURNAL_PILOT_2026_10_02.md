# Mythical DAO — caderno de expedição, etapa A

Data: 2026-10-02. Entrega: três páginas-piloto no preview existente, para revisão visual antes da etapa B.

## Preview e âmbito

- [Camp](https://dao-preview.mythicalbeings.io/#overview): Garuda, participação pessoal, mapa compacto expansível, indicadores verificados, decisões recentes e seis destinos.
- [Governance](https://dao-preview.mythicalbeings.io/#governance): Bahana, lista comparável por decisão/estado/prazo/consequência, pagamentos agrupados por endereço de ativo e autorizações distinguidas de pagamentos. Snapshot tem um acesso próprio.
- [Treasury](https://dao-preview.mythicalbeings.io/#treasury): motivos dourados oficiais, registo de ativos com saldos, elegibilidade e autorizações alinhados; pagamentos pendentes e movimentos em secções próprias.

O cabeçalho azul noturno, os ícones do wallet, o violeta editorial, o papel marfim e os controlos lima formam a estrutura comum destas três páginas. Os temas System/Light/Dark e a preferência guardada permanecem. Texto secundário tem pelo menos 14 px no novo sistema; números usam a formatação existente e permitem consultar o valor exato.

A configuração, APIs, contratos, ABIs, identificadores, rotas, descrições das propostas, formatos dos rascunhos e verificações de assinatura permanecem. Nenhuma transação real foi assinada durante esta entrega. As restantes páginas conservam a apresentação anterior até à revisão visual do piloto, conforme o plano aprovado pelo utilizador.

## Revisão visual

Abrir a [galeria comparativa interativa](evidence/journal-pilot-2026-10-02/review.html), escolher página/tema/largura e clicar nas imagens para resolução integral. Inclui as referências do site oficial e do wallet. As comparações usam dados controlados explicitamente identificados; não representam atividade real da DAO.

Capturas do domínio público, com dados reais:

| Página | Claro, desktop | Escuro, desktop | Claro, mobile | Escuro, mobile |
| --- | --- | --- | --- | --- |
| Camp | [1440](evidence/journal-pilot-2026-10-02/public-overview-light-1440.png) | [1440](evidence/journal-pilot-2026-10-02/public-overview-dark-1440.png) | [390](evidence/journal-pilot-2026-10-02/public-overview-light-390.png) | [390](evidence/journal-pilot-2026-10-02/public-overview-dark-390.png) |
| Governance | [1440](evidence/journal-pilot-2026-10-02/public-governance-light-1440.png) | [1440](evidence/journal-pilot-2026-10-02/public-governance-dark-1440.png) | [390](evidence/journal-pilot-2026-10-02/public-governance-light-390.png) | [390](evidence/journal-pilot-2026-10-02/public-governance-dark-390.png) |
| Treasury | [1440](evidence/journal-pilot-2026-10-02/public-treasury-light-1440.png) | [1440](evidence/journal-pilot-2026-10-02/public-treasury-dark-1440.png) | [390](evidence/journal-pilot-2026-10-02/public-treasury-light-390.png) | [390](evidence/journal-pilot-2026-10-02/public-treasury-dark-390.png) |

O mapa tem dimensão máxima aproximada de 420 × 280 px na abertura. Os pontos são ligações HTML, continuam acessíveis quando a imagem falha e têm alvos de 44 px. O diálogo expandido preserva a proporção da imagem, mantém o foco, fecha com Escape e devolve o foco ao botão de abertura. No mobile, participação e ações aparecem antes do mapa.

## Biblioteca artística

[Manifesto local](journal-assets.json): 21 entradas com origem, variantes, dimensões e hashes, incluindo dependências de marca e tipografia já existentes. [Proveniência e prompt](JOURNAL_ART.md).

Garuda, Bahana, os motivos de `fu.png` e a iconografia são reutilizados da biblioteca oficial do wallet. As cores e a transparência foram preservadas. Sumanga está preparado para o guia futuro, sem alterar o guia nesta etapa. O único desenho novo é o mapa simplificado do acampamento, criado como complemento; não inclui novas criaturas ou supostos detalhes de lore. As imagens são locais e responsivas. A biblioteca nova tem cerca de 806 kB de conteúdo; não é toda descarregada na abertura.

## Validação por percurso

| Percurso / requisito | Resultado |
| --- | --- |
| Tipos e build | Aprovados; nenhuma dependência nova |
| Testes unitários/API/scripts | 162 aprovados, 24 ficheiros |
| Regressão completa de browser | 88 aprovados, 14 omissões previstas |
| Refinamento final dos resumos de pagamentos | Reexecutados Camp, Governance, Treasury e fluxos relacionados: 41 aprovados e uma repetição mobile omitida |
| Navegação e mapa | Seis rotas existentes, expansão, teclado, circulação do foco, Escape, preferência do tema e falha de imagem aprovados |
| Visual e acessibilidade | Claro/escuro a 390/768/1440; reflow 320 e ampliação CSS 200%; Axe WCAG A/AA sem violações nas vistas testadas |
| Carteira e rede | Ligação simulada, menu, mudança de conta/rede, desacordo de RPC e assinatura recusada aprovados |
| Rascunhos e propostas | Importação/exportação, quatro etapas, conteúdo original, recuperação por recibo e links diretos preservados |
| Voto, execução e cancelamento | Chamadas ao Governor existente e condições de revisão preservadas nos testes de regressão |
| Tesouraria | Zero, indisponibilidade, frações mínimas, valores grandes e Unlimited (revocable) preservados; transferências e approve distinguidos |
| Precisão de pagamentos | Soma por endereço usando BigInt antes da apresentação; USDC e USDC.e separados; detalhe mantém destinatários e montantes individuais |
| Delegação e saída | Max com todas as casas, calldata, simulação falhada, módulo não verificado, permissões revogadas, alteração de revisão e recibos revertidos aprovados |
| Domínio público | Seis testes sem fixtures de API; doze capturas das três páginas; 25 artefactos confrontados por hash com o build |

Os 14 testes omitidos são dois ensaios de fork que exigem ambiente Polygon preparado e doze repetições mobile de matrizes que já escolhem as suas larguras no runner desktop. Não foi executado um novo ciclo de transações reais no fork. A avaliação de acessibilidade cobre semântica, Axe e teclado; não equivale a uma sessão manual completa com leitores de ecrã. A aceitação estética continua a depender da revisão do utilizador.

Foram corrigidos o contraste das legendas no mapa expandido e o foco ao percorrer o diálogo. Os testes de carregamento foram ajustados para não exigir imagens decorativas que estão intencionalmente ocultas e diferidas no mobile. O build mantém o aviso existente de chunk JS superior a 500 kB: cerca de 728 kB / 213 kB gzip.

### Evidência técnica

- [Testes unitários](evidence/journal-pilot-2026-10-02/unit-tests.txt)
- [Regressão de browser](evidence/journal-pilot-2026-10-02/browser-tests.txt)
- [Refinamento final](evidence/journal-pilot-2026-10-02/refinement-tests.txt)
- [Build](evidence/journal-pilot-2026-10-02/build.txt)
- [Browser público](evidence/journal-pilot-2026-10-02/public-browser-tests.txt)
- [Artefactos, API e capturas públicas](evidence/journal-pilot-2026-10-02/public-verification.json)
- [Verificação de segredos](evidence/journal-pilot-2026-10-02/static-secret-scan.txt)

Uma leitura de `/api/health` devolveu `degraded`, sem head e com assinatura bloqueada. As consultas posteriores voltaram a `syncing`, head confirmado e assinatura disponível. O histórico estava em cerca de 2,31% durante a validação: a interface preserva os avisos e não apresenta o arquivo como completo. A [observação transitória](evidence/journal-pilot-2026-10-02/health-transient-observation.json) e a [consulta posterior](evidence/journal-pilot-2026-10-02/health-followup.json) foram guardadas. O backend e o indexador não foram alterados nesta entrega.

## Publicação e reversão

O frontend foi publicado na Vercel reutilizando o Worker staging existente para `/api`. Apenas o conteúdo estático validado foi enviado; a verificação Gitleaks dos artefactos não encontrou segredos. Proteções do deploy e configuração da API foram preservadas.

Deployment final: `dpl_CWnV4jmjE3LqanxTQcBoSxc7dT1r`, em `https://mythical-dao-preview-h9qodov6d-palheiro1s-projects.vercel.app`.

Estado anterior preservado:

- Commit local `306d825` — código, assets, testes e evidência da versão anterior.
- Deploy imutável `dpl_B3bGjqjkX6EAUsqvLHJtBXjaNf1z` — `https://mythical-dao-preview-i5cvptzis-palheiro1s-projects.vercel.app`.
- Evidência anterior intacta em `evidence/seekers-camp-2026-10-02/`.

Para repor o frontend anterior no mesmo projeto Vercel:

```sh
vercel rollback mythical-dao-preview-i5cvptzis-palheiro1s-projects.vercel.app
```

Depois de uma reversão, confirmar o domínio público e `/api/health`. Não é necessário reverter D1, contratos ou o Worker.

## Disco

Preflight com estimativa cumulativa de 1,5 GB aprovado, preservando a reserva obrigatória de 40 GB. Espaço disponível inicial: 348 484 423 680 bytes. Nova verificação antes da publicação final: 342 846 156 800 bytes, ainda aprovada. A redução global de aproximadamente 5,64 GB excede os artefactos medidos desta tarefa: a evidência nova ocupa aproximadamente 42 MB; biblioteca nova 936 KiB alocados; `dist` e saída Vercel cerca de 3,4 MB cada. Espaço disponível no fecho: 342 840 139 776 bytes. A diferença restante não foi atribuída com certeza a esta tarefa; não foram apagados projetos, histórico, bases de dados ou outros trabalhos. Dependências e ambientes existentes foram reutilizados.

## Próxima etapa

Rever visualmente Camp, Governance e Treasury no preview, incorporar os ajustes e só então estender a direção ao detalhe de proposta, delegação, formulário de criação, histórico, saída, guia e diálogos. Essa passagem para a etapa B é condicionada pelo plano aprovado pelo utilizador, não por uma autorização adicional imposta por ferramentas ou skills.
