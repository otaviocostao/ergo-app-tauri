# GIF de ajuste da cadeira

A primeira ilustração do modal de calibragem demonstra a cadeira descendo até os
pés ficarem apoiados, com destaque para o ângulo de 90° nos joelhos. O desenho usa
as cores do aplicativo e mantém a posição final por alguns segundos para leitura.

## Arquivos

| Arquivo | Finalidade |
| --- | --- |
| [generate_calibration_chair.py](../scripts/generate_calibration_chair.py) | Fonte editável do desenho e da animação. |
| [chair-height.gif](../src/assets/calibration/chair-height.gif) | Animação usada no modal. |
| [chair-height-still.png](../src/assets/calibration/chair-height-still.png) | Imagem da postura final para movimento reduzido. |
| [WorkspaceCalibrationModal.tsx](../src/components/monitoring/WorkspaceCalibrationModal.tsx) | Integração dos arquivos com a etapa de ajuste da cadeira. |

## Regeneração

São necessários Python, Pillow e a fonte Segoe UI ou DejaVu Sans. Para instalar a
dependência e gerar os dois arquivos, execute na raiz do projeto:

```powershell
python -m pip install Pillow
python scripts/generate_calibration_chair.py
```

O gerador procura a Segoe UI no diretório padrão do Windows ou a DejaVu Sans no
diretório indicado no código para Linux. A fonte escolhida influencia o desenho
dos textos. Os arquivos produzidos ficam em `src/assets/calibration`.

## Sequência da animação

| Intervalo aproximado | Exibição |
| --- | --- |
| 0–0,8 s | Cadeira alta, pés suspensos e seta indicando o ajuste. |
| 0,8–2,8 s | Descida suave da cadeira e da pessoa. |
| 2,8–6,56 s | Pés apoiados, indicação de 90° e confirmação visual. |
| 6,56–7,04 s | Desaparecimento gradual da cena. |
| 7,04–7,68 s | Retorno gradual à posição inicial para repetir o ciclo. |

O GIF tem resolução de 960 × 420 pixels, repetição infinita e duração de 7,68 s.
O gerador compõe 96 quadros de 80 ms; o Pillow reúne quadros idênticos, preservando
a duração. Na versão gerada, são 48 quadros codificados e aproximadamente 454 KiB.
A paleta compartilhada mantém as cores estáveis durante o movimento.

## Exibição no modal

O GIF aparece na etapa **Ajuste da Cadeira**. A imagem usa `object-contain` para
preservar o desenho inteiro, enquanto o fundo do painel acompanha a ilustração.
O texto alternativo descreve a posição demonstrada.

O elemento `picture` seleciona o PNG quando a preferência do sistema ou navegador
é `prefers-reduced-motion: reduce`. Nesse caso, a postura final aparece sem animar.

## Evolução apresentada nos commits

| Etapa | Mudança |
| --- | --- |
| 1 | Primitivas de desenho, suavização e tipografia. |
| 2 | Composição do fundo e das orientações. |
| 3 | Desenho da cadeira e do mecanismo de regulagem. |
| 4 | Desenho das pernas, dos pés e dos calçados. |
| 5 | Desenho do tronco, do braço e do rosto. |
| 6 | Seta de ajuste, marcação de 90° e confirmação do apoio. |
| 7 | Exportação da imagem estática da postura final. |
| 8 | Exportação do GIF com movimento, pausa e repetição. |
| 9 | Integração do GIF na etapa da cadeira e texto alternativo. |
| 10 | Enquadramento que preserva a proporção da ilustração. |
| 11 | Fundo do painel, suporte a movimento reduzido e documentação para reproduzir e apresentar o trabalho. |

Para listar essas etapas em ordem de implementação:

```powershell
git log --reverse --oneline HEAD~11..HEAD
```

Esse intervalo considera que o último commit é o desta documentação. Para uma
apresentação posterior, use os hashes dos commits desejados em `git show <hash>`.
