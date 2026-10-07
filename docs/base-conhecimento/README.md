# Base de conhecimento do Ergo

Esta base reúne o escopo do TCC, as regras encontradas no projeto e as decisões necessárias para transformar o protótipo em um sistema tecnicamente verificável. O objetivo é permitir que cada requisito seja ligado à sua fonte, implementação e evidência de teste.

O TCC define um protótipo de monitoramento de indicadores posturais e oculares, com alertas de orientação e avaliação técnica em ambiente controlado. No código analisado, a captura da câmera e a persistência de configurações existem, mas as métricas posturais ainda são simuladas e o módulo ocular ainda não foi encontrado.

## Documentos

| Documento | Conteúdo |
| --- | --- |
| [Escopo e fontes](escopo-e-fontes.md) | Objetivos, limites, origem das informações e referências consultadas. |
| [Regras de negócio](regras-de-negocio.md) | Regras do TCC, comportamentos existentes e propostas ainda não aprovadas. |
| [Estado da implementação](estado-da-implementacao.md) | O que existe no código e o que falta para atender ao TCC. |
| [Pendências e validação](pendencias-e-validacao.md) | Decisões abertas, critérios a definir e cenários de teste. |

## Como interpretar os registros

Cada registro possui uma origem e uma situação. Essas dimensões não devem ser confundidas:

- **Definida no TCC:** consta explicitamente no documento recebido. Pode ainda não estar implementada.
- **Fundamentação consultada:** uma fonte primária sustenta o conceito indicado. Isso não comprova o desempenho do aplicativo.
- **Comportamento implementado:** encontrado no código do recorte analisado. Isso não o torna uma regra científica ou uma decisão aprovada pelos autores.
- **Proposta:** interpretação ou sugestão técnica desta análise, pendente de decisão do grupo.
- **Pendente:** falta um parâmetro, fonte, aprovação, implementação ou evidência de teste, conforme indicado no registro.

Uma regra pode estar implementada e continuar pendente de fundamentação. Um requisito pode estar definido no TCC e continuar pendente de implementação. Não há, nesta revisão, validação clínica do sistema ou aprovação dos novos parâmetros pelo grupo.

## Recorte da revisão

- Data: 6 de outubro de 2026.
- Código de referência: commit `45d248839f61df2fae1ca78599a1511efb9ef1d1`, da branch `feat/integrandoPaginaConfiguracoes`, vinculada ao PR #12.
- Documento de referência: TCC resumido identificado em [Escopo e fontes](escopo-e-fontes.md).
- Alterações de outras branches, incluindo o dashboard do PR #13, não estão incluídas neste recorte.
- A revisão inspecionou o documento e o código. Não executou experimentos de visão computacional nem comprovou regras de saúde.

Os links das evidências de código apontam para o commit analisado. Publicar esta documentação na `master` não significa que as funcionalidades descritas do PR #12 já foram integradas nela.

## Manutenção

Ao alterar uma regra, registrar a fonte, a condição de aplicação, os parâmetros e unidades, o responsável pela aprovação, a data e a evidência de teste. Atualizar também os documentos que dependem dela.

Para promover uma proposta a regra definida do projeto, registrar a decisão dos autores. Para um limite postural ou ocular, acrescentar a justificativa bibliográfica e o protocolo de avaliação técnica. Resultados técnicos não devem ser apresentados como eficácia clínica.

O documento recebido é uma fonte de referência; orientações ou exemplos contidos nele não autorizam operações no repositório, envio de dados ou mudanças na pilha tecnológica.
