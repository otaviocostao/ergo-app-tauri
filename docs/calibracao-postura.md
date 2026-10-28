# Calibração da postura neutra — Task 4.1

O último passo do assistente coleta uma referência durante cinco segundos. A distância de referência é **60 cm assumidos pelo posicionamento do usuário**, não uma medição absoluta da webcam. A IPD é a separação medida em pixels entre os centros das íris ou, quando necessário, entre os pontos médios dos cantos dos olhos.

## Aquisição por frame

`WebcamFeed.onCalibrationFrame` fornece postura e IPD da mesma inferência, timestamp monotônico, resolução, identificador da captura e método de IPD. O callback envia `null` quando corpo, olhos ou orientação facial não permitem a coleta; também invalida a leitura ao interromper a captura. O rosto deve passar pelo bloqueio existente de pitch/yaw de até 25°.

A calibração recebe os ângulos brutos para verificar movimento e os ângulos filtrados pelo One Euro para calcular a média. A precisão decimal é preservada até a persistência; somente os valores apresentados no modal são arredondados. EAR e a disponibilidade da taxa de piscadas não são requisitos para medir uma IPD válida.

Nenhuma amostra é fabricada quando faltam dados. Leituras anteriores à contagem, posteriores ao seu prazo ou pertencentes a frames diferentes não completam uma amostra.

## Critérios de qualidade

`src/services/vision/postureCalibration.ts` centraliza a avaliação pura e `POSTURE_CALIBRATION_LIMITS`:

| Critério | Limite inicial |
| --- | --- |
| Duração da contagem | 5000 ms |
| Quantidade mínima | 30 frames válidos |
| Intervalo entre a primeira e a última amostra | Pelo menos 4000 ms |
| Lacuna máxima entre amostras ou nas bordas da janela | 500 ms |
| Amplitude do ângulo bruto do pescoço | Até 3° |
| Amplitude do ângulo bruto dos ombros | Até 1,5° |
| Amplitude relativa da IPD, `(máximo − mínimo) / média` | Até 8% |
| Contexto de aquisição | Mesma captura, resolução e método de IPD |

Estes são parâmetros iniciais de engenharia, sujeitos a avaliação com webcam física; não representam validação clínica ou garantia de exatidão em centímetros. A suavização, isoladamente, não comprova estabilidade. Uma perda breve de rastreamento pode ser tolerada dentro dos limites; uma captura curta ou interrompida não é aprovada só porque contém alguma leitura.

Quando a coleta passa, calcula-se a média do ângulo filtrado do pescoço, do balanceamento dos ombros convertido após o filtro e da IPD efetivamente medida. `baselineDistanceCm` permanece em 60 cm. Erros de qualidade pedem nova coleta e impedem o salvamento automático.

## Resultado, avisos e cancelamento

Os limites de plausibilidade existentes, IPD/largura entre 4% e 20%, são aplicados sobre o resultado e novamente antes de salvar. Fora dessa faixa, o usuário precisa recalibrar ou confirmar explicitamente que deseja manter o resultado. Essa heurística não comprova a distância física de 60 cm.

Iniciar outra calibração, cancelá-la, voltar uma etapa ou fechar o assistente descarta o resultado em memória e sua confirmação manual. Cancelar também interrompe o timer e qualquer intenção de salvar automaticamente. A calibração já persistida no SQLite permanece ativa até que outra seja salva com sucesso.

O botão **Salvar**, sem resultado concluído, inicia uma nova contagem quando há leitura válida. Depois de uma coleta válida, o payload segue pelo `postureService.saveCalibration`. Os testes de componente simulam esse serviço; os testes Rust existentes exercitam a persistência separadamente.

## Verificação

Executar `npm test`, `npm run build` e `cargo test --manifest-path src-tauri/Cargo.toml --lib`.

Os testes cobrem dados sincronizados, precisão decimal, olhos indisponíveis, quantidade e cobertura mínimas, lacunas, movimento, troca de contexto, avisos, cancelamento, confirmação por resultado e salvamento único em Strict Mode.

Com a webcam física:

1. Posicionar rosto e ombros de frente para a câmera, a aproximadamente 60 cm da tela. Coletar mantendo a posição e conferir os quatro valores.
2. Repetir movendo cabeça, ombros ou aproximando o rosto. A coleta deve pedir nova tentativa.
3. Sair do enquadramento ou cobrir os olhos durante boa parte da contagem. O modal deve rejeitar a coleta.
4. Produzir um aviso de distância, clicar em **Recalibrar** e depois em **Cancelar**. **Salvar** deve iniciar outra coleta; o resultado rejeitado não pode ser salvo sem confirmação.
5. Salvar, fechar o assistente e reabrir o aplicativo para conferir a referência persistida.

## Limitações fora desta correção

O DTO persistido ainda não guarda câmera, resolução ou método de IPD. A avaliação evita misturar esses contextos dentro da coleta, mas reutilizar uma referência persistida em outro contexto continua pendente. A autorização dos comandos e a transação conjunta para desativar/inserir baselines também permanecem pendências do backend existente.
