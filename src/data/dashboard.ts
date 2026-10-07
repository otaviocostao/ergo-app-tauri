// Figma preview data. These values are not measurements from the camera or sensors.
export const dashboardPreview = {
  ergonomicIndex: 82,
  goodPostureTime: "5h12",
  dailyGoal: "6h",
  goalProgress: 87,
  remainingTime: "48min",
};

export const posturePeriods = [
  { period: "08:00 - 08:40", ideal: true, description: "Início do monitoramento com postura estável." },
  { period: "08:40 - 09:10", ideal: false, description: "Ombros elevados e inclinação para frente." },
  { period: "11:00 - 12:20", ideal: true, description: "Melhor bloco contínuo de alinhamento." },
  { period: "12:20 - 13:00", ideal: false, description: "Recomendação de pausa e reajuste da cadeira." },
];

export const postureSegments = [40, 30, 80, 30, 80, 40, 70, 30, 100, 30, 70];

export const postureHeatmap = [
  { hour: 8, period: "08:00 - 10:00", values: [72, 76, 64, 84, 90, 92, 88, 72, 55, 68, 82, 86] },
  { hour: 10, period: "10:00 - 12:00", values: [88, 94, 97, 96, 91, 86, 74, 70, 78, 82, 89, 93] },
  { hour: 13, period: "13:00 - 15:00", values: [68, 72, 75, 82, 90, 88, 79, 63, 58, 66, 74, 81] },
  { hour: 15, period: "15:00 - 17:00", values: [84, 88, 91, 94, 89, 76, 69, 61, 70, 82, 87, 90] },
];

export const bestPostureIntervals = [
  { period: "10:20 - 10:30", description: "Postura estável sem alerta", percent: 97 },
  { period: "10:30 - 10:40", description: "Alinhamento de ombros ideal", percent: 96 },
  { period: "15:30 - 15:40", description: "Sem correções necessárias", percent: 94 },
  { period: "11:50 - 12:00", description: "Boa estabilidade lombar", percent: 93 },
  { period: "09:10 - 09:20", description: "Pescoço e tronco alinhados", percent: 92 },
];

export const preventiveAlerts = [
  { time: "08:40", title: "Pescoço projetado para frente", detail: "Sistema sugeriu aproximar o monitor e apoiar a lombar.", attention: "Correção recomendada após 6 min." },
  { time: "12:20", title: "Inclinação lateral do tronco", detail: "Alerta emitido após perda de alinhamento por 13 min.", attention: "Usuário retornou à faixa ideal em 13 min." },
  { time: "16:20", title: "Pausa preventiva ignorada", detail: "Recomendação de pausa e alongamento antes de continuar.", attention: "Sistema reforçou alerta de alongamento." },
];

export const postureAchievements = [
  { time: "09:20", title: "Bom alinhamento cervical", detail: "20 minutos seguidos sem projeção do pescoço." },
  { time: "10:30", title: "Sequência ideal concluída", detail: "Bloco de 10 minutos com 96% de postura correta." },
  { time: "12:00", title: "Postura lombar estável", detail: "Apoio lombar mantido durante o período." },
  { time: "15:40", title: "Ótimo ajuste de cadeira", detail: "Altura e distância do monitor dentro do recomendado." },
  { time: "16:30", title: "Alinhamento recuperado", detail: "Retorno à faixa ideal após alerta preventivo." },
];

export const alertTimeline = [
  { time: "08:40", positive: false },
  { time: "09:20", positive: true },
  { time: "10:30", positive: true },
  { time: "12:20", positive: false },
  { time: "15:40", positive: true },
  { time: "16:20", positive: false },
  { time: "16:30", positive: true },
];
