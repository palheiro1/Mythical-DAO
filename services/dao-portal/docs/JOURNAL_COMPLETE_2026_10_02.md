# Mythical DAO — caderno de expedição completo

Data: 2026-10-02. Continuação autorizada pelo utilizador após aprovação estética das três páginas-piloto.

## Resultado

[Preview atualizado](https://dao-preview.mythicalbeings.io/) · [Galeria comparativa](evidence/journal-complete-2026-10-02/review.html)

O sistema visual aprovado foi aplicado ao detalhe de proposta, delegação, criação, histórico, saída, guia e diálogos, além de refinar Camp, Governance e Treasury. Cabeçalho, navegação, formulários, revisões, estados vazios e avisos partilham o mesmo sistema. O CSS antigo do primeiro acampamento deixou de ser carregado; o ficheiro fica preservado como histórico.

| Área | Composição e arte |
| --- | --- |
| Camp | Garuda, mapa compacto expansível e destinos com as ilustrações das respetivas áreas |
| Governance / detalhe | Haechi; decisões comparáveis; documento e ações na coluna principal, voto e calendário na lateral |
| Treasury | Grootslang; registo de ativos, autorizações e pagamentos alinhados |
| Delegation | Wati-kutjara; relação entre MANA, votos e representante; identicons derivados do endereço, sem perfis inventados |
| Create proposal | Sumangâ; quatro etapas persistentes, formulário de trabalho e resumo contextual |
| Chronicle | Cartografia; lista de decisões com estado, tempo e efeito financeiro; arquivo Snapshot separado |
| Exit DAO | Tulpar; abertura discreta, sequência de montante, ativos, autorização e revisão |
| Field guide | Şahmaran; capítulos editoriais e regras efetivas com duração legível |

## Escolha e conservação da arte

Os novos originais provêm de `/home/usuario/MEGA/Illustrations/LowResolution`. Grootslang foi escolhido pela relação documentada com gemas e tesouros; Haechi pela relação com justiça e integridade. As restantes associações são editoriais, baseadas no catálogo existente `wallet/src/data/monsters.json`; não atribuem cargos ou falas às criaturas.

As cinco imagens novas têm variantes de 709 e 320 px, num total de 564 400 bytes. Foram preservadas cores, papel, assinaturas e composição dos originais. Não se geraram nem redesenharam criaturas. A arte apresenta-se como estampas de um caderno, em ambos os temas. O mapa e os símbolos do wallet são reutilizados.

[Manifesto de 31 assets](journal-assets.json), com origens, hashes, dimensões e usos. [Notas artísticas](JOURNAL_ART.md).

## Datas, endereços e precisão

- Os prazos futuros aparecem como “Closes in about…” e, no detalhe, como data e hora com fuso horário. São explicitamente estimados a partir do ritmo observado dos últimos 512 blocos; o Governor continua a decidir pelo bloco exato.
- Datas passadas, incluindo movimentos da tesouraria, usam o timestamp efetivo do bloco. A tesouraria mostra seis movimentos inicialmente e permite expandir todas as entradas carregadas. Se a consulta falhar, a interface indica indisponibilidade, sem inventar uma data. Os blocos originais continuam acessíveis em “Timing details”.
- As regras de votação mostram uma duração aproximada; o número exato de blocos permanece nos detalhes e nas revisões. Na edição de parâmetros, a entrada exata mantém-se e tem uma estimativa adjacente.
- As consultas de apresentação partilham cache por rede/bloco. O relógio é lido diretamente da rede e atualizado a cada cinco minutos, mesmo quando o endpoint de saúde da API está indisponível; não há uma nova varredura do histórico nem alterações ao indexador. Para datas, usa-se dRPC com PublicNode como alternativa e timeouts limitados, sem chaves privadas. Ambos os endpoints são públicos; dRPC consta dos [endpoints oficiais da Polygon](https://docs.polygon.technology/pos/reference/rpc-endpoints). Este cliente serve apenas metadados de calendário; não participa na validação de saldos, simulação ou assinatura. O PublicNode devolveu HTTP 529 (`upstream overloaded`) durante a validação, motivando esta redundância.
- Endereços aparecem abreviados. Um controlo por toque/teclado revela o endereço inteiro, permite copiá-lo e abre o explorador. Títulos abreviam endereços; o texto original das propostas fica intacto e acessível.
- O leitor de propostas mantém texto escapado, sem executar HTML. Revisões de transações mostram os valores e endereços exatos. Max, BigInt, calldata, rascunhos e os formatadores financeiros existentes não foram arredondados nem convertidos.

Não foram alterados contratos, ABIs, API pública, formatos de dados, rotas, IDs, base de dados ou lógica de assinatura. Nenhuma transação real foi assinada durante esta entrega.

## Validação

| Verificação | Resultado |
| --- | --- |
| Tipos e build de publicação | Aprovados |
| Unitários / API / scripts | 165 testes aprovados, 25 ficheiros |
| Regressão sobre o build compilado | 99 aprovados na execução integral; navegação por teclado revalidada nos dois tamanhos após ajustar a espera do foco no teste. 100 casos cobertos nessa bateria; 14 omissões previstas |
| Calendário final | 10 testes aprovados, incluindo fornecedor em sobrecarga e backend de saúde indisponível; as datas não dependem da disponibilidade deste endpoint |
| Visão pública | 6 testes aprovados sem substituir respostas da API |
| Visual / acessibilidade | Claro e escuro a 390/768/1440; reflow a 320 e ampliação CSS de 200%; Axe sem violações nas vistas testadas; verificação automática de que arte e títulos não se sobrepõem |
| Teclado / diálogos | Foco, navegação mobile, expansão do mapa, Escape, preferência de tema e falha da imagem verificados |
| Dados legíveis | Datas futuras, timestamp histórico, RPC indisponível, recuperação pelo fornecedor alternativo, texto original, endereço completo e cópia exata verificados |
| Operações | Propor, votar, executar, cancelar quando permitido, delegar e rever saída; rejeição, rede/carteira alterada, simulação falhada e recibo revertido cobertos |
| Precisão | Max, montantes mínimos, autorizações máximas, zero versus indisponibilidade, pagamentos e permissões preservados |
| Publicação | Artefactos estáticos examinados pelo Gitleaks: nenhum segredo encontrado |

As 14 omissões são dois testes que exigem um fork Polygon preparado e doze repetições mobile de matrizes que já percorrem as larguras no runner desktop. Não se repetiu um ciclo real de transações num fork nesta revisão visual. Axe e testes de teclado não equivalem a uma sessão manual completa com leitores de ecrã.

O build mantém o aviso existente de um chunk JavaScript superior a 500 kB: cerca de 737,1 kB, 216,7 kB gzip. Não foram instaladas dependências novas.

Evidência: [unitários](evidence/journal-complete-2026-10-02/unit-tests.txt), [browser](evidence/journal-complete-2026-10-02/browser-tests.txt), [revalidação do teclado](evidence/journal-complete-2026-10-02/navigation-recheck.txt), [refinamento visual](evidence/journal-complete-2026-10-02/refinement-tests.txt), [calendário final](evidence/journal-complete-2026-10-02/calendar-final-tests.txt), [build](evidence/journal-complete-2026-10-02/build.txt), [testes públicos](evidence/journal-complete-2026-10-02/public-browser-tests.txt), [verificação dos artefactos e dados públicos](evidence/journal-complete-2026-10-02/public-verification.json), [scan de segredos](evidence/journal-complete-2026-10-02/static-secret-scan.txt).

A verificação final confrontou **35 artefactos por hash** e capturou **36 vistas públicas** (nove páginas, dois temas, duas larguras), sem erros JavaScript nem overflow. Foram registadas quatro observações de indisponibilidade da API/propostas e uma observação de carregamento diferido de imagens. Esta última foi revalidada com deslocação real da página: todas as imagens carregaram e a captura mobile de Camp foi atualizada. As imagens públicas incluem esses estados reais; as imagens controladas mostram os estados preenchidos. As datas reais apareceram nas propostas e nos movimentos quando os respetivos registos estavam disponíveis. A galeria distingue claramente as duas fontes.

## Publicação e reversão

Deployment: `dpl_28WwZfyQNj2UwM6LXP17dfnXNBBK`.

URL imutável: `https://mythical-dao-preview-kg6gunr7o-palheiro1s-projects.vercel.app`.

O HTML foi confrontado com o build antes de promover o deployment. Durante a verificação, `/api/health` alternou entre respostas válidas (head da rede, assinatura disponível e histórico incompleto) e páginas Cloudflare “Worker exceeded resource limits”. A falha também foi observada no domínio antes da promoção final; uma consulta direta ao Worker voltou a responder com sucesso. Esta é uma limitação operacional do backend existente, não resolvida pelo redesenho. As capturas e respostas finais estão na evidência pública; o portal mantém estados de indisponibilidade e não inventa métricas. A publicação reutiliza o Worker staging e a configuração existente. Não altera contratos, D1 ou serviços de notificações.

Rollback da estética aprovada anterior:

- Código e assets: commit local `61085ea`.
- Deploy Stage A: `dpl_CWnV4jmjE3LqanxTQcBoSxc7dT1r`.
- URL: `https://mythical-dao-preview-h9qodov6d-palheiro1s-projects.vercel.app`.
- Capturas anteriores intactas em `evidence/journal-pilot-2026-10-02/`.

```sh
vercel rollback mythical-dao-preview-h9qodov6d-palheiro1s-projects.vercel.app
```

Após reversão, confirmar o domínio e `/api/health`; não é necessária uma reversão de dados.

## Disco

Preflight cumulativo de 1,5 GB aprovado. Espaço disponível inicial: 342 011 822 080 bytes. Dependências instaladas foram reutilizadas; não foram clonados projetos nem criadas cópias de caches. Os originais de `/MEGA` e a evidência anterior permanecem intactos. Espaço disponível final: 344,094,437,376 bytes. Evidência nova: 49,188,864 bytes alocados; biblioteca artística completa: 1,626,112 bytes. O espaço global disponível aumentou face ao início; não foi necessário libertar dados do utilizador. [Registo final](evidence/journal-complete-2026-10-02/disk-final.json).
