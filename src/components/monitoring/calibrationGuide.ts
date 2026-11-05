import type { WorkspaceItem } from "../../services/workspaceService";

export type WorkspaceSetup = Pick<WorkspaceItem, "deviceType" | "isWebcamFront" | "hasExternalKeyboard" |
  "hasExternalMouse" | "adjustableDesk" | "adjustableChair" | "adjustableMonitor">;

export type CalibrationIllustration = "webcam-position" | "webcam-aligned" |
  "notebook-peripherals-ready" | "notebook-peripherals-keyboard" | "notebook-peripherals-mouse" | "notebook-peripherals-both" |
  "chair-height" | "chair-footrest" | "desk-adjustment" | "desk-chair-adjustment" | "desk-fixed" |
  "monitor-height" | "monitor-height-support" | "notebook-height" | "notebook-height-support" |
  "monitor-distance-adjustment" | "notebook-distance";

export interface CalibrationGuideStep {
  id: number;
  title: string;
  description: string;
  illustration: CalibrationIllustration;
}

/** Select demonstrations from the equipment the user actually reported. */
export function buildCalibrationGuide(setup: WorkspaceSetup): CalibrationGuideStep[] {
  const notebook = setup.deviceType === "notebook";
  const steps: CalibrationGuideStep[] = [{
    id: 6,
    title: setup.isWebcamFront ? "Conferir o enquadramento" : "Posicionar a webcam",
    illustration: setup.isWebcamFront ? "webcam-aligned" : "webcam-position",
    description: setup.isWebcamFront
      ? "Sua webcam já está à sua frente. Confira se rosto e ombros ficam visíveis e mantenha esse enquadramento na etapa de calibração."
      : "Você informou que a webcam não está em frente a você. Posicione-a no centro, alinhada ao rosto, para enquadrar rosto e ombros sem precisar virar a cabeça.",
  }];

  if (notebook) {
    const keyboard = setup.hasExternalKeyboard;
    const mouse = setup.hasExternalMouse;
    steps.push({
      id: 5,
      title: keyboard && mouse ? "Organizar os acessórios do notebook" : keyboard ? "Adicionar um mouse externo"
        : mouse ? "Adicionar um teclado externo" : "Adicionar teclado e mouse externos",
      illustration: keyboard && mouse ? "notebook-peripherals-ready" : keyboard ? "notebook-peripherals-mouse"
        : mouse ? "notebook-peripherals-keyboard" : "notebook-peripherals-both",
      description: keyboard && mouse
        ? "Você já usa teclado e mouse externos. Mantenha-os próximos ao corpo, com o mouse ao lado do teclado, para posicionar a tela sem depender do teclado integrado."
        : keyboard
          ? "Mantenha seu teclado externo e adicione um mouse externo ao lado dele. Assim você pode elevar a tela sem precisar alcançar o touchpad do notebook."
          : mouse
            ? "Mantenha seu mouse externo e adicione um teclado externo. Isso permite elevar a tela sem precisar usar o teclado integrado nessa posição."
            : "Adicione teclado e mouse externos para posicionar as mãos separadamente da tela do notebook. Mantenha o mouse ao lado do teclado e os dois acessórios próximos ao corpo.",
    });
  }

  steps.push({
    id: 1,
    title: setup.adjustableChair ? "Ajustar a altura da cadeira" : "Apoiar os pés com a cadeira fixa",
    illustration: setup.adjustableChair ? "chair-height" : "chair-footrest",
    description: setup.adjustableChair
      ? "Use a regulagem da cadeira para apoiar os pés no chão e manter uma posição confortável. Confira o apoio das costas e a posição dos joelhos."
      : "Sua cadeira não possui regulagem. Mantenha os pés no chão ou use um apoio firme caso eles não alcancem o piso. Se a cadeira não permitir uma posição confortável, será necessário buscar um modelo adequado.",
  });

  steps.push({
    id: 2,
    title: setup.adjustableDesk ? "Ajustar a altura da mesa" : setup.adjustableChair ? "Adaptar a cadeira à mesa fixa" : "Conferir mesa e cadeira fixas",
    illustration: setup.adjustableDesk ? "desk-adjustment" : setup.adjustableChair ? "desk-chair-adjustment" : "desk-fixed",
    description: setup.adjustableDesk
      ? "Ajuste a mesa para usar teclado e mouse com os braços relaxados, próximos ao corpo e sem elevar os ombros. A demonstração mantém a cadeira na mesma posição."
      : setup.adjustableChair
        ? "Como a mesa é fixa, use a regulagem da cadeira para encontrar uma posição confortável para os braços. Se os pés perderem o contato com o chão, use um apoio firme para eles."
        : "Mesa e cadeira não possuem regulagem. Confira o alcance do teclado e o apoio dos braços, sem tentar alterar a altura dos móveis. Se a combinação não permitir uma posição confortável, procure mobiliário que ofereça o ajuste necessário.",
  });

  steps.push({
    id: 3,
    title: notebook ? "Ajustar a altura da tela do notebook" : "Ajustar a altura do monitor",
    illustration: notebook ? setup.adjustableMonitor ? "notebook-height" : "notebook-height-support"
      : setup.adjustableMonitor ? "monitor-height" : "monitor-height-support",
    description: notebook
      ? setup.adjustableMonitor
        ? "Use a regulagem do suporte para elevar a tela do notebook. Confira o topo da tela próximo da altura dos olhos e mantenha teclado e mouse externos acessíveis."
        : "Sem regulagem de altura no suporte, use uma base firme e estável para elevar o notebook. Confira a posição da tela e mantenha teclado e mouse externos na superfície de trabalho."
      : setup.adjustableMonitor
        ? "Use a regulagem da base do monitor para aproximar o topo da tela da altura dos olhos, sem precisar inclinar a cabeça para cima."
        : "Seu monitor não possui regulagem de altura. Use um suporte firme e estável para elevar o conjunto, mantendo a base do monitor apoiada e o topo da tela próximo da altura dos olhos.",
  }, {
    id: 4,
    title: "Conferir a distância da tela",
    illustration: notebook ? "notebook-distance" : "monitor-distance-adjustment",
    description: notebook
      ? "Posicione o notebook e seu suporte à sua frente, a uma distância confortável de leitura, aproximadamente um braço. Mova o conjunto com cuidado e mantenha teclado e mouse ao alcance."
      : "Posicione o monitor à sua frente, a uma distância confortável de leitura, aproximadamente um braço. Mova a base com cuidado e mantenha os acessórios ao alcance.",
  });
  return steps;
}
