# Pendências e validação

Esta lista reúne decisões necessárias para completar os requisitos e tornar as regras verificáveis. Os responsáveis e critérios de aprovação ainda devem ser definidos pelo grupo. Nenhuma proposta abaixo altera automaticamente o aplicativo.

## Decisões abertas

| ID | Decisão | Evidência e critério de fechamento |
| --- | --- | --- |
| P-01 | Papel do monitoramento de digitação. | O TCC o exclui, mas o software o inclui. Confirmar se é funcionalidade extra, se fica fora da avaliação ou se o escopo acadêmico será revisado. |
| P-02 | Métricas posturais, fórmulas, limiares e política temporal dos alertas. | Definir landmarks, plano 2D/3D, unidade, erro aceitável, origem dos limites, duração mínima, repetição e recuperação. Resolver divergências entre feed e cartões. Não aprovar os números demonstrativos por reprodução do código. |
| P-03 | Significado e validade da calibração. | Decidir quais medidas constituem a base, como obtê-las, critérios de captura, necessidade de persistência e invalidação ao trocar câmera, usuário ou ambiente. O workspace atual guarda apenas respostas. |
| P-04 | Propriedade dos dados e workspace ativo. | Definir se o ambiente pertence ao dispositivo, usuário ou empresa e como selecionar entre registros. Hoje as telas usam o mais recentemente criado, sem proprietário. |
| P-05 | Regras dos lembretes e pausas. | Definir pausa/retomada, uso em segundo plano, suspensão do computador, horários, fuso, confirmação e convivência entre alertas automáticos e personalizados. Separar notificação enviada de pausa efetivamente realizada. |
| P-06 | Política de imagens e métricas. | Especificar dados necessários, destino, retenção, exclusão, acesso, informações ao usuário e eventuais componentes remotos. Explicar o item de cloud no orçamento sem presumir envio de imagens. |
| P-07 | Indicadores demonstrativos e índice agregado. | Decidir se haverá índice ergonômico, sua fórmula e interpretação. O `healthScore`, histórico inicial e “42 min monitorados” atuais não são resultados experimentais. Definir apresentação inequívoca do modo demonstrativo. |
| P-08 | Papéis e autorização. | Definir capacidades de visitante, conta local, conta externa e empresa; verificar autorização nos comandos necessários. A restrição de edição de conta externa não estabelece propriedade de workspace ou lembrete. |
| P-09 | Protocolo de avaliação técnica. | Escolher dados de referência, origem e permissões de uso, hardware, condições e critérios quantitativos antes de coletar resultados. Harmonizar a menção a testes simulados com a declaração de ausência de experimentos com seres humanos. |
| P-10 | Coerência da redação acadêmica. | A segunda fase menciona algoritmos para “calcular ... fadiga ocular”, mas o referencial restringe EAR a indicadores; a metodologia fala em mitigação, enquanto a justificativa não comprova prevenção. Revisar os termos para refletir o objetivo técnico declarado. |
| P-11 | Detector e condições válidas de aquisição. | Definir biblioteca/modelo, landmarks, requisitos de câmera, confiança, enquadramento, oclusão e iluminação. Falha de captura não deve ser confundida com uma medida válida; o comportamento definitivo depende de aprovação. |
| P-12 | Padrões do ambiente e orientação de manutenção. | Reconciliar notebook no formulário versus desktop no backend e atualizar referências desatualizadas do README, incluindo a política de migrações. Não modificar migrações aplicadas nesta tarefa documental. |

## Protocolo técnico proposto

O TCC exige testes técnicos, mas não fornece números de aprovação. O roteiro abaixo é uma proposta para detalhar RQ-02 e RQ-03; valores finais e responsáveis continuam pendentes.

| Cenário | Verificação | Parâmetros ainda necessários |
| --- | --- | --- |
| Cálculo de ângulos | Comparar coordenadas conhecidas e ângulos de referência; testar pontos coincidentes e ausentes. | Fórmula, plano, definição de cada ângulo e erro máximo permitido. |
| Cálculo de EAR | Comparar o resultado com seis pontos oculares de referência; testar denominador zero e ausência de pontos. | Correspondência dos landmarks do detector escolhido e tolerância numérica. |
| Piscadas | Comparar eventos identificados com uma sequência anotada e medir falsos positivos/negativos. | Janela temporal, amostragem, referência e critérios de associação de eventos. |
| Limite de alerta | Exercitar valor abaixo, igual e acima do limite, com desvio curto e persistente. | Comparadores, limiares e duração mínima aprovados em P-02. |
| Repetição e recuperação | Verificar retorno ao estado normal e evitar alertas repetidos para o mesmo evento conforme política aprovada. | Intervalo entre avisos, encerramento do evento e histerese, se adotada. |
| Pausa e retomada | Verificar câmera, relógios, métricas e agendador ao pausar, retomar ou suspender o computador. | Quais contadores avançam ou reiniciam em cada estado. |
| Câmera e iluminação | Exercitar câmera indisponível, corpo/rosto ausente, oclusão e condições controladas distintas. | Critérios de quadro válido e comportamento quando a análise estiver indisponível. |
| Persistência | Reabrir o app e verificar configuração, atualização do mesmo registro e tratamento de erro de gravação. | Propriedade dos dados e definição do ambiente ativo em P-04. |
| Desempenho | Medir CPU, RAM, taxa de processamento e latência até o alerta com carga e hardware registrados. | Máquina de referência, duração do teste e metas quantitativas. |
| Dados | Verificar destino dos frames, ausência de armazenamento/envio não previsto e descarte segundo a política aprovada. | Inventário, retenção e fluxos permitidos de P-06. |

A [fonte original de EAR](https://vision.fe.uni-lj.si/cvww2016/proceedings/papers/05.pdf) apresenta a métrica de abertura ocular. Sua utilização aqui como referência de cálculo não determina o limiar final do Ergo.

Os testes CRUD existentes e as verificações do modal não validam o módulo de visão, os limites posturais ou a eficácia dos alertas sobre a saúde. A aprovação técnica precisa registrar entradas, resultados esperados, resultados obtidos, versão do código e condições do experimento.

## Ordem sugerida de trabalho

1. Resolver o escopo e a linguagem do protótipo: P-01, P-07 e P-10.
2. Definir métodos, parâmetros, calibração e condições de aquisição: P-02, P-03 e P-11.
3. Especificar dados, propriedade, acesso e pausas: P-04, P-05, P-06 e P-08.
4. Fechar o protocolo de teste e metas: P-09.
5. Reconciliar padrões e documentação: P-12.

Não introduzir mudanças de tecnologia ou de schema apenas para preencher lacunas documentais. Essas mudanças precisam de uma tarefa de implementação com escopo definido.

## Registro de decisões

Adicionar as decisões aprovadas à tabela abaixo e atualizar as regras afetadas. A tabela começa vazia porque os autores ainda não aprovaram as propostas desta revisão.

| Decisão | Pendência | Definição aprovada | Responsável e data | Fonte e evidência |
| --- | --- | --- | --- | --- |
