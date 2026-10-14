# Escopo e fontes

## Fonte principal

Documento fornecido pelos autores: **TCC Resumido - Visão computacional para saude no trabalho.docx**.

- Título interno: *Sistema de detecção e alerta de riscos posturais e visuais em usuários de computador por meio de visão computacional*.
- Autores: Lucas Nascimento de Almeida e Otavio Costa de Oliveira.
- Instituição: Centro Universitário Nobre, Engenharia da Computação, 2026.
- SHA-256 do arquivo recebido: `1c387ee3dd9103bbc46993518376229d2a3daaad6dd2615d5aa7ba0625192570`.
- O arquivo original permanece fora do repositório. As referências abaixo usam os títulos das seções, sem atribuir números de páginas não verificados.

O resumo recebido não contém uma especificação completa de requisitos, valores finais de limiares, fórmulas posturais ou critérios quantitativos de aprovação. As lacunas estão registradas em [Pendências e validação](pendencias-e-validacao.md).

## Objetivo e público

Segundo **Introdução / Objetivo Geral**, desenvolver um protótipo que detecte indicadores posturais e visuais em usuários de computador e emita orientações em tempo real. Sua avaliação será técnica, em ambiente controlado.

O público contextualizado inclui pessoas que trabalham com computadores, em escritórios, teletrabalho e trabalho híbrido. O documento não especifica perfis de autorização, acesso de gestores ou separação de dados por empresa.

## Capacidades previstas

| ID | Capacidade | Localizador no TCC |
| --- | --- | --- |
| RF-01 | Capturar vídeo e identificar pontos corporais e faciais. | Objetivos Específicos; Metodologia / Fases de Desenvolvimento, segunda fase. |
| RF-02 | Calcular ângulos corporais, incluindo indicadores de pescoço e ombros. | Objetivos Específicos; Metodologia / Abordagem da Pesquisa. |
| RF-03 | Calcular EAR e analisar padrões oculares para orientar alertas. | Objetivos Específicos; Referencial Teórico / Visão Computacional como Solução para Monitoramento Contínuo. |
| RF-04 | Emitir alertas de orientação a partir de regras computacionais previamente definidas. | Objetivo Geral; Objetivos Específicos. |
| RF-05 | Exibir informações, notificações e um dashboard analítico dos dados extraídos. | Metodologia / Fases de Desenvolvimento, segunda fase. |
| RQ-01 | Priorizar processamento local, extrair as métricas necessárias e descartar as imagens após o processamento. | Referencial Teórico / Visão Computacional como Solução para Monitoramento Contínuo. |
| RQ-02 | Verificar cálculos e alertas usando imagens, vídeos ou dados de referência. | Objetivos Específicos. |
| RQ-03 | Avaliar execução em computador pessoal, consumo de CPU e RAM e condições de câmera e iluminação. | Hipótese; Metodologia / Abordagem da Pesquisa; terceira fase. |

Os exemplos de OpenCV e MediaPipe na metodologia são possibilidades para o módulo de visão. O documento não decide a biblioteca final. A implementação atual permanece em Tauri, Rust, React, TypeScript e SQLite; esta documentação não altera essas tecnologias.

## Limites expressos no TCC

- O protótipo não tem finalidade diagnóstica e não comprova prevenção de doenças ocupacionais: **Justificativa**.
- Alertas não substituem avaliação ergonômica profissional nem comprovam atendimento integral à NR-17: **O Impacto do Trabalho Digital e a Ergonomia Ocupacional**.
- A análise da cadência de digitação não integra os objetivos do protótipo: mesma seção.
- EAR isolado não identifica a iminência de fadiga visual: **Visão Computacional como Solução para Monitoramento Contínuo**.
- Não serão avaliados benefícios clínicos, produtividade, retenção ou outros resultados organizacionais: **A Visão Corporativa e a Gestão de Saúde Estratégica** e **Aplicações da Inteligência Artificial na Saúde**.
- O documento declara que não serão realizados experimentos com seres humanos: **Aplicações da Inteligência Artificial na Saúde**. A origem e o procedimento de uso dos dados de teste ainda precisam ser especificados.

## Referências primárias consultadas nesta revisão

### NR-17

Foi consultado o [PDF oficial citado no TCC](https://www.gov.br/trabalho-e-emprego/pt-br/acesso-a-informacao/participacao-social/conselhos-e-orgaos-colegiados/comissao-tripartite-partitaria-permanente/normas-regulamentadora/normas-regulamentadoras-vigentes/nr-17-atualizada-2023.pdf), especialmente os itens 17.3, 17.4.3, 17.6 e 17.7.3.

Esses itens tratam de avaliação ergonômica, medidas de organização do trabalho, mobiliário e adaptação de equipamentos. Não oferecem os limiares de classificação de pescoço e ombros atualmente codificados na interface. Esses números precisam de outra fundamentação e de definição do método de medida.

### Descanso visual

A [página da American Optometric Association sobre Computer Vision Syndrome](https://www.aoa.org/healthy-eyes/eye-and-vision-conditions/computer-vision-syndrome?ss0=y&sso=y) descreve a orientação 20-20-20: a cada 20 minutos, olhar por 20 segundos para algo a 20 pés, aproximadamente 6 metros.

Isso fundamenta o conteúdo de um lembrete. Não define o limiar de EAR do aplicativo, não demonstra que o usuário cumpriu a pausa e não valida clinicamente o protótipo. A fonte foi acessada pelo resultado de pesquisa; a abertura direta apresentou indisponibilidade.

### EAR

Foi consultado o artigo original [Real-Time Eye Blink Detection using Facial Landmarks, Soukupová e Čech, 2016](https://vision.fe.uni-lj.si/cvww2016/proceedings/papers/05.pdf), seções 2.1 e 2.2. Ele descreve EAR como medida de abertura ocular e considera a sequência temporal para detectar piscadas.

Esta é uma fonte complementar desta análise, não listada no resumo recebido. Sua inclusão na bibliografia do TCC depende dos autores. A aplicação do método não transforma EAR em diagnóstico de fadiga nem autoriza copiar um limiar experimental para outro detector sem validação.

### Proteção de dados

Foi consultada a [LGPD no portal do Planalto](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm), especialmente o art. 46, sobre proteção de dados desde a concepção. A existência de processamento local não comprova atendimento integral à lei. Esta revisão não determina a base legal nem certifica conformidade.

### Limite da checagem bibliográfica

A lista completa de referências do TCC foi lida, mas não foi integralmente verificada. Não foram extraídos limiares quantitativos dos trabalhos de Menanno, Agostinelli ou Singhtaun nesta revisão. Não atribuir a esses trabalhos regras numéricas ou validação do Ergo sem consultar método, condições e resultados.
