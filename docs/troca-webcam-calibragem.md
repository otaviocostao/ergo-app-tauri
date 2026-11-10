# Troca de webcam e calibragem

Uma referência neutra pertence à câmera usada na coleta. Alterar o dispositivo pode modificar os ângulos e a distância estimada. O aplicativo compara o dispositivo da captura com `cameraDeviceId` antes de aplicar os valores salvos.

## Seletor do monitoramento

Escolher outra câmera interrompe a captura e a digitação, encerra a sessão atual pelo ciclo normal de persistência e abre o aviso **Troca de câmera exige nova calibragem**. O dispositivo anterior continua selecionado e a preferência não é salva antes da confirmação.

- **Manter câmera anterior**, X, Escape, fundo ou navegação: descarta a escolha pendente, preservando câmera e calibragem. O monitoramento permanece parado.
- **Trocar câmera e recalibrar**: aguarda o encerramento da sessão, salva a preferência e abre o modal de calibragem. Com ambiente existente, abre diretamente a etapa da câmera; sem ambiente, inicia pelo formulário.
- Falhas no encerramento ou salvamento permitem tentar novamente. Durante o salvamento, as ações ficam bloqueadas para evitar duplicação.

Selecionar a mesma câmera não encerra a sessão. Mudanças automáticas de dispositivo não abrem esse aviso; a verificação de compatibilidade continua protegendo as leituras.

## Seletor da calibragem

A câmera muda imediatamente e a preferência é salva. A troca descarta amostras, contagem regressiva, resultados ainda não salvos e confirmações de distância. Enquanto a preferência é salva, novas seleções e o salvamento da calibragem ficam bloqueados. Se a gravação falhar, o seletor retorna à câmera anterior e informa o erro.

Cancelar o modal mantém a preferência já salva. A calibragem anterior permanece no banco, mas só pode ser aplicada à câmera que a produziu. Iniciar análises com câmera exige referência ativa e compatível; iniciar apenas digitação não depende dela. Concluir ou cancelar a calibragem não reinicia automaticamente o monitoramento.

O identificador persistido vem da captura: `MediaStreamTrack.getSettings().deviceId` ou, quando o driver omite essa informação, do dispositivo aberto por uma restrição `deviceId.exact`. Uma coleta sem identificação confiável não pode ser salva. A avaliação também rejeita mudanças de câmera dentro da mesma coleta.

## Persistência

`posture_calibrations.camera_device_id` é `TEXT`, permitindo ler referências antigas sem identificação como `null`. Novos salvamentos exigem identificador não vazio, respeitando o limite de tamanho já usado para a preferência de webcam. Identificadores de câmera são opacos; usuários, sessões e calibragens mantêm seus UUIDs em texto.

A desativação da referência anterior e a inserção da nova usam uma única transação. Falhar na inserção preserva a calibragem ativa anterior. Continua existindo uma referência ativa por usuário, sem reutilização automática de um catálogo por dispositivo.

Somente `0001_initial_migration.sql` foi alterada, conforme o padrão do projeto e o processo das alterações para UUID. Bancos antigos precisam ser recriados conforme o README, usando dados descartáveis. Nenhum banco pessoal é apagado ou atualizado automaticamente; não há alteração de checksum nem migration incremental.

## Verificação automatizada

- Testes React exercitam solicitação sem troca de stream, encerramento único, confirmação, saídas de cancelamento, erros e tentativas novamente, retomada manual e navegação durante salvamento.
- Os testes da calibragem verificam entrada direta, fallback para formulário, troca durante e após a coleta, bloqueio enquanto salva e retorno à câmera anterior em caso de erro.
- Os testes da captura e da avaliação verificam identificação do dispositivo real e rejeição de referências incompatíveis ou sem câmera identificada.
- Os testes Rust usam bancos temporários ou em memória para verificar schema, persistência, validação, isolamento de proprietários UUID e rollback após falha de inserção.

Execute `npm test`, `npm run build` e `cargo test --manifest-path src-tauri/Cargo.toml`.

## Roteiro com duas webcams físicas

Use uma conta de teste em banco descartável criado com o schema atual.

1. Calibre a câmera A e inicie o monitoramento. Escolha B: a sessão deve encerrar e A permanecer selecionada até confirmar.
2. Cancele por botão, X, Escape e fundo. A preferência e a calibragem de A devem permanecer; iniciar manualmente deve criar outra sessão.
3. Escolha B e confirme. A etapa da câmera deve abrir usando B. Feche sem concluir e tente iniciar: a nova calibragem deve ser solicitada.
4. Reabra, conclua a coleta e salve. O monitoramento deve permanecer parado; inicie manualmente e confira as leituras com B.
5. Dentro da calibragem, troque de dispositivo durante os cinco segundos e depois de concluir uma coleta. O resultado anterior deve ser descartado em ambos os casos.
6. Reinicie o aplicativo após trocar de câmera sem calibrar. A referência incompatível deve continuar bloqueada. Desative os módulos de câmera e confira que somente digitação pode iniciar.
7. Desconecte a câmera e negue a permissão em uma tentativa separada. Confira as mensagens existentes, a liberação da captura ao fechar o modal e a ausência de métricas calibradas com o dispositivo errado.

Os testes automatizados usam dispositivos e IPC simulados. Eles não substituem este roteiro com os drivers e webcams físicos.
