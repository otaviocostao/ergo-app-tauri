# Demonstrações selecionadas pelo formulário de calibragem

O assistente usa o dispositivo e todas as respostas Sim/Não para selecionar um roteiro. Cada etapa apresenta o título, a orientação e uma demonstração compatível, com PNG para `prefers-reduced-motion`, sem subtítulos repetindo as respostas do formulário.

Computador de Mesa e Desktop são a mesma opção. A outra opção do formulário é Notebook / Laptop. No notebook, a pergunta de regulagem da tela é apresentada como **Seu suporte para notebook possui regulagem de altura?**, usando o mesmo campo persistido `adjustableMonitor`.

## Correlação das respostas

| Campo/condição | Resposta | Demonstração selecionada |
| --- | --- | --- |
| Webcam posicionada de frente | Sim | `webcam-aligned`: conferir rosto e ombros, mantendo a câmera centralizada |
| Webcam posicionada de frente | Não | `webcam-position`: mover a câmera para a frente do usuário |
| Notebook: teclado e mouse externos | Sim / Sim | `notebook-peripherals-ready`: conferir a organização dos dois acessórios existentes |
| Notebook: teclado e mouse externos | Não / Sim | `notebook-peripherals-keyboard`: adicionar somente o teclado, mantendo o mouse |
| Notebook: teclado e mouse externos | Sim / Não | `notebook-peripherals-mouse`: adicionar somente o mouse, mantendo o teclado |
| Notebook: teclado e mouse externos | Não / Não | `notebook-peripherals-both`: adicionar os dois acessórios |
| Cadeira com regulagem | Sim | `chair-height`: regular a altura da cadeira |
| Cadeira com regulagem | Não | `chair-footrest`: a cadeira fica fixa; usar apoio se os pés não alcançarem o chão |
| Mesa com regulagem | Sim | `desk-adjustment`: ajustar a mesa, mantendo a cadeira fixa |
| Mesa sem regulagem; cadeira com regulagem | Não / Sim | `desk-chair-adjustment`: ajustar a cadeira à mesa fixa, com apoio para os pés quando necessário |
| Mesa e cadeira sem regulagem | Não / Não | `desk-fixed`: conferir o apoio e o alcance, sem animar um ajuste indisponível |
| Desktop: monitor com regulagem | Sim | `monitor-height`: elevar o monitor pela sua base |
| Desktop: monitor com regulagem | Não | `monitor-height-support`: adicionar uma base firme sob o conjunto |
| Notebook: suporte com regulagem | Sim | `notebook-height`: elevar o suporte do notebook |
| Notebook: suporte com regulagem | Não | `notebook-height-support`: usar uma base firme e estável |
| Dispositivo | Desktop | `monitor-distance-adjustment`: reposicionar o monitor |
| Dispositivo | Notebook | `notebook-distance`: reposicionar notebook e suporte juntos |

Sim nos campos de regulagem indica disponibilidade do recurso, não que a altura já esteja correta. Para equipamentos fixos, a orientação não pede que o usuário acione uma regulagem que informou não possuir. Quando mesa e cadeira não atendem à posição de trabalho, o texto explica que pode ser necessário mobiliário adequado.

O roteiro tem cinco demonstrações no desktop e seis no notebook, seguidas da etapa real de captura da postura. As respostas de teclado e mouse são ignoradas no desktop, onde esses campos ficam ocultos. Voltar ao formulário e alterar uma resposta reconstrói o roteiro com as novas opções.

## Arte e arquivos

São 17 pares GIF/PNG: quatro pares existentes foram reutilizados e 13 foram criados. Os novos GIFs têm 960 × 420 pixels, duração de oito segundos e repetição contínua. A paleta e o personagem seguem os geradores anteriores. Os exemplos combinados antigos permanecem disponíveis nos arquivos, mas o roteiro usa cenas específicas para cada condição.

- `src/components/monitoring/calibrationGuide.ts`: seleção do roteiro a partir das respostas, sem acesso à câmera ou ao banco.
- `src/components/monitoring/calibrationIllustrations.ts`: associação de cada demonstração ao GIF, PNG e texto alternativo.
- `scripts/generate_calibration_form_variants.py`: geração das 13 variantes adicionais, reutilizando os desenhos procedurais existentes.
- `scripts/calibration_animation.py`: exportação dos ciclos e imagens estáticas com paleta compartilhada.

Regenerar as variantes adicionais, com Python e Pillow já disponíveis:

```powershell
python -B scripts/generate_calibration_form_variants.py
```

Para regenerar apenas algumas, informe seus nomes:

```powershell
python -B scripts/generate_calibration_form_variants.py desk-fixed notebook-peripherals-mouse
```

Os geradores originais de cadeira, altura do monitor/notebook e posicionamento da webcam continuam produzindo os quatro pares reutilizados. A calibragem numérica, o tempo de coleta, as validações e o formato persistido do ambiente não foram modificados.

## Critérios das orientações

As alternativas de apoio dos pés e de ajuste conjunto de cadeira, mesa e monitor seguem as orientações de [cadeiras da OSHA](https://www.osha.gov/etools/computer-workstations/components/chairs). A separação entre posição da tela e dispositivos de entrada do notebook é sustentada pelo [guia de aquisição de estações da OSHA](https://www.osha.gov/etools/computer-workstations/checklists/purchasing-guide). A posição da tela é orientada pelo [guia de monitores](https://www.osha.gov/etools/computer-workstations/components/monitors/). Essas referências apoiam as instruções de preparação, sem mudar os critérios existentes de medição do app.

## Verificação desta entrega

- 672 testes Vitest em 27 arquivos passaram, incluindo todas as 128 combinações das respostas, a passagem dos valores dos controles para as ilustrações e a entrada na captura apenas depois do roteiro.
- Build TypeScript/Vite passou, mantendo o aviso anterior de bundle acima de 500 kB.
- Na prévia Chrome da entrega inicial, sete preenchimentos representativos cobriram as 17 demonstrações. Todos os GIFs e PNGs corretos carregaram em 960 × 420, sem iniciar a câmera antecipadamente.
- Todos os quadros dos 13 GIFs adicionais foram decodificados. Duração, resolução e repetição foram conferidas. Comparações de pixels verificaram que a cadeira fixa e os acessórios já existentes não se movimentam ou desaparecem durante a adição do item faltante.
- A revisão visual das sequências e da interface foi feita com imagens geradas localmente. Nenhuma webcam física ou banco de dados foi usado nessa prévia.
