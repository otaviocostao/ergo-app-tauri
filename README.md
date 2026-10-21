# Ergo App (Tauri + React + TypeScript)

Este projeto é uma aplicação Desktop construída com **Tauri v2**, **React** e **TypeScript**.

## Base de conhecimento

O [índice da base de conhecimento](docs/base-conhecimento/README.md) reúne o escopo do TCC, as regras de negócio, o estado da implementação e as pendências de validação. Cada registro distingue sua fonte, o comportamento encontrado no código e as decisões ainda abertas.

## 🚀 Como Executar o Projeto Localmente

### Pré-requisitos
- **Node.js** (20.19+ ou 22.12+; prefira uma versão LTS suportada)
- **Rust & Cargo** (instalados via `rustup`)
- Dependências do sistema para o Tauri (consulte a [Documentação oficial do Tauri](https://v2.tauri.app/start/prerequisites/))
- No Windows: Visual C++ Build Tools com o workload **Desenvolvimento para desktop com C++**, Windows SDK e WebView2 Runtime.

### Passos para inicializar
1. Instale as dependências Node:
   ```bash
   npm ci
   ```

2. Inicie o servidor de desenvolvimento do Tauri:
   ```bash
   npm run tauri dev
   ```

---

## Login e cadastro local

- Ao abrir o app, a tela inicial é o login (`/login`).
- **Cadastrar** abre um modal para escolher entre o cadastro on-line de empresas e o cadastro off-line. Como ainda não há backend remoto, a opção **Cadastrar online** exibe o aviso de indisponibilidade; **Cadastrar offline** abre o cadastro no próprio app (`/cadastro`).
- O cadastro local pede nome, e-mail, senha de 8 a 128 caracteres e confirmação da senha. Após o sucesso, uma animação de verificação é exibida antes do retorno ao login.
- A conta permanece no SQLite após encerrar o app. A sessão fica somente na memória do processo Rust: recarregar a tela ou ocultar a janela pelo X mantém a sessão; usar **Sair do Ergo** e abrir novamente exige novo login.
- Senhas são armazenadas como hash **Argon2id**, com salt aleatório por cadastro. O hash nunca é retornado ao frontend. Após cinco tentativas de login em 30 segundos, novas tentativas aguardam o fim dessa janela.
- Não há envio de dados, confirmação de e-mail, recuperação de senha ou sincronização online nesta versão. O SQLite não é criptografado; o login não substitui as permissões de acesso aos arquivos do sistema operacional.

### Compartilhar com os colegas

Compartilhe código, `package-lock.json`, `src-tauri/Cargo.lock` e migrações pelo Git. Cada colega executa `npm ci` e `npm run tauri dev`; o app cria o banco automaticamente e cada pessoa cadastra sua conta no próprio computador. Contas e dados não são compartilhados entre máquinas. Os arquivos de banco estão no `.gitignore`.

No PowerShell, se `npm.ps1` estiver bloqueado, use `npm.cmd ci` e `npm.cmd run tauri dev`.

`npm run dev` abre apenas a prévia web das telas de login e cadastro. Login/cadastro reais e acesso às telas internas exigem o app Tauri. A prévia não simula um cadastro bem-sucedido. A interface usa a pilha de fontes do sistema e não depende do download de fontes.

### Carregamento das telas

As páginas de login, cadastro e as páginas internas usam importações estáticas e fazem parte do bundle inicial. As rotas internas exigem autenticação; sessões anônimas são redirecionadas para o login.

Durante a consulta inicial da sessão e a primeira leitura do tema de cada conta, a interface mostra um indicador de carregamento em tela cheia. Nas navegações internas, a barra lateral e o cabeçalho permanecem montados. Novas tentativas de leitura do tema mostram o progresso em um aviso dentro da página, preservando formulários e alterações ainda não salvas. Os estilos globais fazem parte do carregamento inicial.

O Tailwind procura classes em `src/` e `index.html`. Classes usadas por novos componentes devem estar nesses arquivos. O observador de desenvolvimento do Vite ignora `src-tauri/`, `logs/` e `dist/`, evitando acompanhar o backend, os perfis de navegador dos testes e os arquivos compilados. Mudanças no frontend continuam atualizando a prévia automaticamente.

### Execução na bandeja do sistema

- No aplicativo desktop, clicar no **X** (ou usar **Alt+F4** no Windows) oculta a janela e mantém o Ergo na bandeja. O processo, a sessão e o agendador de lembretes continuam ativos.
- Clique com o botão esquerdo no ícone da bandeja para reabrir a mesma janela, restaurando-a se estiver minimizada e trazendo-a para frente. O menu do botão direito também oferece **Abrir Ergo**.
- Para encerrar completamente, escolha **Sair do Ergo** no menu da bandeja. Isso encerra o processo e interrompe o agendador. O botão de minimizar da janela mantém seu comportamento normal.
- No Windows, o ícone pode estar na área de ícones ocultos, acessível pela seta junto ao relógio. A bandeja existe no app Tauri; fechar uma aba da prévia web continua fechando essa aba.

Validação manual no Windows:

1. Execute `npm run tauri dev`, entre na conta e abra uma tela interna.
2. Clique no X: a janela deve desaparecer da barra de tarefas e o ícone do Ergo deve permanecer na bandeja.
3. Reabra pelo clique esquerdo e pelo menu **Abrir Ergo**. Confira se a tela e a sessão foram mantidas. Repita após minimizar a janela e também com Alt+F4.
4. Crie um lembrete para um horário próximo, oculte a janela pelo X e aguarde o aviso do sistema. Confira também a execução com a janela aberta.
5. Use **Sair do Ergo** e confirme que o processo e o ícone desaparecem. Abra novamente e confira que o login é solicitado. Repita a verificação na versão instalada.

## 🗄️ Configuração do Banco de Dados SQLite Local

O projeto utiliza **SQLite** local. A autenticação é gerenciada pelo backend Rust com SQLx em `src-tauri/src/auth.rs`.

### 💡 Por que SQLite?
O SQLite é um banco de dados **embarcado (embedded)**. Isso significa que:
- **Zero Instalação:** Não é necessário instalar nenhum serviço de banco de dados separado (como PostgreSQL, MySQL ou contêineres Docker) na sua máquina local.
- **Auto-Gerado:** O arquivo `.db` é criado automaticamente na primeira vez que a aplicação é executada.

### 📍 Localização do Arquivo do Banco de Dados (`ergo.db`)
Ao rodar a aplicação em modo dev ou produção, o arquivo do banco de dados `ergo.db` é gerado automaticamente no diretório de dados padrão do sistema operacional:

- **Windows:** `%APPDATA%\com.ergo.ergo-app-tauri\ergo.db`  
  *(ex: `C:\Users\<SeuUsuario>\AppData\Roaming\com.ergo.ergo-app-tauri\ergo.db`)*
- **macOS:** `~/Library/Application Support/com.ergo.ergo-app-tauri/ergo.db`
- **Linux:** `~/.config/com.ergo.ergo-app-tauri/ergo.db`

### 🔄 Migrações Automáticas
O backend abre o banco e aplica a migração SQLx de `src-tauri/migrations/` na inicialização. Nesta fase do projeto, os dados locais são considerados descartáveis e `0001_initial_migration.sql` contém todo o schema: usuários, lembretes, empresas e ambientes de trabalho. A tabela `_sqlx_migrations` registra a versão aplicada.

Para adicionar novas tabelas ou alterar tabelas existentes:
1. Atualize `src-tauri/migrations/0001_initial_migration.sql`, mantendo o schema completo na migração inicial.
2. O SQLx verifica o checksum da migração. Quando ela for alterada nesta fase de desenvolvimento, feche o aplicativo e remova `ergo.db`, `ergo.db-wal` e `ergo.db-shm` (se existirem) do diretório de dados indicado acima. Isso apaga as contas e os dados locais; use este procedimento somente com dados descartáveis. Se for necessário preservar dados, mantenha as migrações aplicadas intactas e use novas migrações incrementais.
3. Reinicie o app (`npm run tauri dev`). As migrações são embutidas no executável durante a compilação, portanto também funcionam no app instalado.

A migração inicial inclui `reminders.user_id`, uma chave estrangeira para `users.id`, e um índice para consultas por usuário. O banco rejeita referências a usuários inexistentes e impede excluir usuários que tenham lembretes vinculados. O backend atribui o proprietário de novos lembretes pela sessão autenticada; o frontend não escolhe nem altera esse vínculo. Listar, consultar, editar, excluir e alternar o status exigem autenticação e se restringem aos lembretes do usuário conectado. Visitantes e sessões sem login não podem executar essas operações. Os exemplos sem proprietário (`user_id` nulo) ficam fora das listas das contas; não são atribuídos automaticamente a nenhum usuário.

### 🛠️ Como Utilizar o Banco no Frontend (TypeScript)
Para autenticação, use `src/auth/authService.ts`, que chama os comandos `register_local`, `login_local`, `get_session` e `logout`. O `AuthProvider` mantém os dados públicos da sessão e as rotas internas exigem uma sessão autenticada.

As permissões de SQL genérico foram removidas de `src-tauri/capabilities/default.json` para impedir leitura/alteração da tabela de credenciais pelo WebView. O helper antigo `src/db.ts` não é usado nesse fluxo. Novas operações de dados devem ser implementadas como comandos Rust específicos, validando a sessão no backend quando precisarem de autenticação.

As contas e os lembretes por usuário são persistidos no SQLite local. As rotas internas exigem uma conta autenticada. As métricas de ergonomia continuam demonstrativas.

### Preferência de tema por usuário

O campo `users.theme_preference` guarda `light`, `dark` ou `system`. Novas contas recebem `system` (Automático), tanto no cadastro pelo aplicativo quanto no padrão SQL da coluna. Essa preferência acompanha o tema do computador, inclusive quando ele muda com o aplicativo aberto.

Os comandos `get_user_theme_preference` e `update_user_theme_preference` consultam e alteram somente a conta da sessão autenticada. A atualização recebe `{ payload: { theme: "dark" } }`, sem identificador de usuário, e preserva os demais dados cadastrais. O serviço frontend `src/services/userThemeService.ts` disponibiliza essas operações.

Ao entrar na conta, o aplicativo carrega sua preferência antes de mostrar as telas internas. Em Configurações, a escolha é aplicada imediatamente e gravada no banco; enquanto a operação está em andamento, o seletor fica desabilitado. Se a gravação falhar, a aparência anterior é restaurada e uma mensagem é exibida. Se a primeira leitura falhar, o aplicativo acompanha o tema do sistema temporariamente, informa a falha e permite tentar novamente antes de alterar a preferência.

O botão **Tentar novamente** recarrega a preferência mantendo a página e seus formulários montados. Durante essa leitura, o aviso mostra o progresso e o seletor de tema permanece desabilitado. Se a nova tentativa falhar, a aparência atual é mantida e o botão volta a ficar disponível.

Na abertura e após sair da conta, login e cadastro usam o tema do computador. Um script no HTML aplica essa aparência antes do bundle React, e as telas acompanham mudanças do sistema enquanto permanecem abertas. A preferência de uma conta é consultada somente após sua autenticação. Contas com `light` ou `dark` usam a escolha explícita ao entrar; contas com `system` acompanham o computador.

O antigo registro `ergo.theme` do navegador não é consultado nem gravado. Login, cadastro, calendário de nascimento, mensagens e janelas acompanham o tema ativo. A prévia web, sem banco Tauri, também acompanha o sistema.

Logout e troca de conta invalidam respostas pendentes, para que uma operação anterior não altere a aparência ou as mensagens da conta atual. Atualizar os dados do mesmo perfil não recarrega o tema. A preferência permanece local a este dispositivo, sem sincronização com a plataforma online.

Como o schema de tema foi alterado na migração inicial, bancos criados com uma versão anterior dessa migração precisam ser recriados conforme o procedimento de desenvolvimento acima. Isso inclui bancos com o padrão antigo `light` ou com a antiga tabela de tema da última conta. A recriação descarta contas e dados locais; o aplicativo não migra nem apaga esses arquivos automaticamente. Quando os dados precisarem ser preservados, será necessário adotar migrações incrementais.

### Disparo dos lembretes

O agendador Rust acompanha os lembretes do usuário conectado a cada segundo e funciona em qualquer tela, com a janela aberta, minimizada ou oculta na bandeja após clicar no X. Escolher **Sair do Ergo** encerra o agendador; ele não funciona como um serviço do sistema operacional.

- Para lembretes recorrentes, o primeiro aviso ocorre após um intervalo contado a partir do início. Por exemplo, de 08h às 18h com intervalo de 60 minutos, os avisos ocorrem de 09h a 17h. O horário de fim é exclusivo.
- As frequências respeitam os dias locais do computador: diariamente, segunda a sexta, sábado e domingo ou os dias personalizados.
- “Não repetir” dispara uma vez na data e no horário de início escolhidos. O intervalo e o horário de fim não se aplicam.
- Entrar na conta ou reiniciar o aplicativo agenda o próximo horário futuro. Após suspensão, avisos atrasados mais de dez segundos são ignorados; não há envio acumulado. O controle de disparos fica na memória, e horários passados não são reenviados na inicialização. Horários locais ambíguos ou inexistentes em transições de fuso são ignorados.
- Edição, desativação e exclusão atualizam o agendamento na próxima verificação. Logout e troca de conta cancelam a programação anterior.
- O aviso aparece dentro do aplicativo e também é enviado ao sistema pelo plugin de notificações do Tauri. No Windows, a opção de som usa o som padrão do sistema; lembretes silenciosos não solicitam som. Volume, modo de concentração e bloqueios de notificações do sistema podem impedir a apresentação ou o áudio. Na execução de desenvolvimento, o Windows pode identificar o aviso como PowerShell; valide também o aplicativo instalado.
- Após o plugin aceitar o envio, `reminders.last_sent_at` registra o horário efetivo em UTC (RFC 3339). Falhas reportadas pelo plugin não alteram esse campo. Esse registro não confirma a exibição ou a leitura da notificação pelo usuário. O modal de detalhes mostra o último envio no fuso local do computador, ou “Nunca enviado”, e se atualiza quando está aberto durante um disparo.
- Registrar o envio altera somente `last_sent_at`, preservando `updated_at` como referência das alterações do lembrete. Edições e mudanças de status continuam atualizando `updated_at`, inclusive a desativação automática de lembretes que não se repetem. O campo começa vazio e não recompõe envios anteriores a esta implementação.

Para conferir manualmente: entre na conta, crie um lembrete diário com início no próximo minuto, intervalo de um minuto e fim pelo menos três minutos depois. O primeiro aviso deve acontecer um minuto após o início; confira o seguinte, desative o lembrete e confirme que não há novos avisos. Repita com notificação silenciosa, outra tela aberta e a janela minimizada. Para “Não repetir”, escolha a data local de hoje e um horário futuro.

### Relatórios de postura

A opção **Relatórios** no menu abre `/reports`. Os três cartões **Ver detalhes** da tela inicial abrem as respectivas seções: índice ergonômico, boa postura e alertas. Os endereços antigos em `/dashboard/` redirecionam para essas seções.

- Filtros de dia, semana (domingo a sábado) e mês, com seleção de data e navegação entre períodos. Filtros e seção ficam na URL para preservar a navegação de voltar/avançar.
- Visão geral com evolução em pontos percentuais, tempo em boa postura, alertas por hora, tempo em monitoramento, meta demonstrativa de 6h e histórico diário. A seção de alertas inclui a contagem de alertas críticos.
- Detalhes com distribuição do tempo dentro/fora da faixa, mapa de intervalos de 10 minutos, melhores horários e registro de alertas por tipo.
- O índice é ponderado pelo tempo monitorado; dias sem leituras não recebem pontuação. Períodos em andamento comparam os dias decorridos com o mesmo trecho do período anterior (limitado ao tamanho do mês anterior).

O **histórico demonstrativo** é gerado em `src/data/reports.ts` para os últimos 120 dias, com leituras em dias úteis. A tela inicial usa essa mesma fonte; o aviso demonstrativo foi removido da interface. Os relatórios ainda não consultam as medições persistidas pelo backend nem o monitoramento ao vivo; a evolução exibida é ilustrativa.

### Testes

```bash
npm test
npm run build
npm run test:auth
npm run test:reports
npm run test:theme
```

- `test`: testes geométricos, adaptação dos landmarks do MediaPipe e integração do componente de câmera com captura e detector simulados. Cobrem resolução do vídeo, espelhamento, confiança, oclusão, ausência, suavização, pausa, retomada, erros e liberação de streams pendentes. Use `npm run test:watch` durante o desenvolvimento.
- `test:auth`: testes Rust com SQLite temporário, cobrindo cadastro, validações, duplicidade, hash, login, sessões, limite de tentativas, persistência e preferências de tema por conta, incluindo o padrão SQL automático.
- `test:reports`: testes de agregação, comparação entre períodos, dias sem leituras, limites de calendário e consistência dos dados demonstrativos (Node.js 22.6+).
- `test:theme`: testes do tema inicial e dos contratos de comunicação, além de testes de integração com React e jsdom. Exercita os providers de autenticação e tema, as rotas, o layout e Configurações em Strict Mode, com comunicação Tauri simulada. Cobre carregamento inicial, preservação de formulários em novas tentativas, restauração após falha ao salvar, mudanças do sistema e respostas atrasadas após logout ou troca de conta. As páginas sem relação com esses cenários são substituídas por componentes simples; os testes não acessam câmera, contas ou bancos reais.

### Cálculos geométricos de pescoço e ombros

O módulo `src/services/vision/biomechanics.ts` expõe funções puras para geometria em 2D e orientação vertical do rosto. As funções em 2D recebem pontos `{ x, y }`, com X crescendo para a direita e Y para baixo. Os eixos devem usar a mesma escala: converta landmarks normalizados para pixels com `x * largura` e `y * altura` do frame original.

- `calculateNeckAngle(nose, ear, shoulderCenter)` retorna o ângulo em graus entre a vertical para cima e o vetor do centro dos ombros até o ponto médio entre nariz e orelha. Varia de 0° a 180°; 0° indica alinhamento vertical. Em vista lateral, o deslocamento horizontal representa projeção anterior; em vista frontal, representa inclinação lateral. O resultado é uma medida bruta em 2D; a comparação com uma postura neutra calibrada fica a cargo de quem chama a função.
- `calculateShoulderBalance(leftShoulder, rightShoulder)` usa `atan2` para obter a inclinação aguda em relação à horizontal, independentemente da ordem dos ombros ou do espelhamento. Retorna `max(0, 100 - ângulo * 10)`: 0° → 100%, 3° → 70% e ≥ 10° → 0%.
- `calculateHeadPitch(matrix)` extrai a rotação vertical assinada da cabeça a partir da matriz facial 4×4 do MediaPipe, em ordem de colunas. Ignora translação e escala uniforme, separa pitch de yaw/roll pela convenção `Rz * Ry * Rx` e retorna `null` para dados ausentes, inválidos ou rotação lateral singular. A saída estima a orientação do rosto em relação à câmera; não representa um ângulo cervical anatômico calibrado.

Ambas retornam `null` para coordenadas não finitas ou vetores de comprimento zero, preservando a distinção entre medida indisponível e postura alinhada.

O feed da câmera usa essas funções através de `src/services/vision/poseAngles.ts`. O adaptador converte as coordenadas normalizadas pela largura e altura reais do vídeo, independentemente do tamanho da prévia. Usa o ponto médio das duas orelhas visíveis na vista frontal ou a orelha visível na vista lateral, evitando selecionar sempre um lado. Nariz, ombros e ao menos uma orelha precisam ter coordenadas finitas e confiança acima de 0,35. Pontos insuficientes pausam as métricas e solicitam ajuste do enquadramento; ausência corporal por cinco segundos pausa o rastreamento.

O detector habilita `outputFacialTransformationMatrixes` no [Face Landmarker](https://developers.google.com/edge/mediapipe/solutions/vision/face_landmarker/web_js) e repassa a matriz do rosto detectado no quadro atual. O feed usa `max(ângulo 2D, abs(pitch))` como desvio do pescoço, permitindo identificar olhar para cima ou para baixo mesmo quando o vetor cabeça–ombros permanece centralizado. Os limites atuais da interface são aviso acima de 14° e alerta acima de 20°. Se a matriz facial estiver ausente ou inválida, as métricas ficam pausadas como detecção parcial, sem assumir um pitch de 0° nem reutilizar a orientação do quadro anterior.

A suavização EMA começa na primeira medida válida e mantém a precisão decimal internamente, arredondando apenas os valores exibidos. O módulo usa o valor absoluto do pitch antes do filtro, evitando cancelar desvios verticais de sentidos opostos. Após perder pontos necessários, a próxima medida válida reinicia o filtro. O modo simulado é ativado explicitamente e declara uma orientação vertical neutra para os dados demonstrativos. A distância permanece uma estimativa pela largura dos ombros; a comparação com uma referência neutra calibrada e a persistência de uma sessão real continuam em outras tarefas. A posição e inclinação da câmera afetam a orientação estimada; o assistente de ambiente ainda não salva uma referência neutra de cabeça.

Para conferir com a webcam física, reinicie o aplicativo após atualizar o detector, execute `npm run tauri -- dev`, abra **Monitoramento**, permita a captura e enquadre rosto, orelhas e ombros, com a câmera aproximadamente na altura dos olhos. Compare postura alinhada e inclinada; olhe para baixo e depois para cima mantendo a cabeça centralizada horizontalmente. Sustente cada posição por cerca de um segundo: o desvio deve aumentar e mudar a classificação, ou indicar detecção parcial se o rosto deixar de ser reconhecido. Volte a olhar para a câmera e confira a recuperação. Redimensionar a janela deve preservar os ângulos para os mesmos landmarks. Pause e confirme a liberação da câmera, retome e verifique o retorno das métricas. Cubra os pontos necessários e saia do enquadramento por mais de cinco segundos para conferir os estados de detecção parcial e ausência. Os testes automatizados simulam a captura e o detector; disponibilidade do hardware, permissões do Windows e precisão do modelo com pessoas reais exigem essa conferência manual.

### 🔍 Como Inspecionar / Visualizar os Dados
Para abrir e visualizar as tabelas do banco de dados na sua máquina local durante o desenvolvimento, utilize uma destas opções:

1. **Extensão do VS Code (Recomendado):**
   - Instale a extensão **SQLite Viewer** (`qwtel.sqlite-viewer`) ou **SQLite** (`alexcvzz.vscode-sqlite`).
   - Abra o arquivo `ergo.db` localizado na pasta de dados do seu SO diretamente no VS Code.

2. **Ferramenta Desktop Externa:**
   - Baixe e instale o [DB Browser for SQLite](https://sqlitebrowser.org/).
   - Abra o arquivo `ergo.db` através do programa.

---

## 🛠️ IDE Recomendada

- [VS Code](https://code.visualstudio.com/) + [Tauri Extension](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)
