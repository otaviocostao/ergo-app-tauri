/** Analysis modules; values match the backend enum and the `settings` columns. */
export enum Module {
  POSTURAL_ANALYSIS = "postural_analysis",
  OCULAR_ANALYSIS = "ocular_analysis",
  TYPING_ANALYSIS = "typing_analysis",
}

export const MODULES = [Module.POSTURAL_ANALYSIS, Module.OCULAR_ANALYSIS, Module.TYPING_ANALYSIS] as const;

export const MODULE_LABELS: Record<Module, string> = {
  [Module.POSTURAL_ANALYSIS]: "Análise postural",
  [Module.OCULAR_ANALYSIS]: "Análise ocular",
  [Module.TYPING_ANALYSIS]: "Análise de digitação",
};

export const MODULE_DESCRIPTIONS: Record<Module, string> = {
  [Module.POSTURAL_ANALYSIS]: "Acompanha pescoço, ombros, coluna e distância da tela pela câmera.",
  [Module.OCULAR_ANALYSIS]: "Acompanha a frequência de piscadas e a distância dos olhos até a tela.",
  [Module.TYPING_ANALYSIS]: "Acompanha a cadência de digitação e o tempo de uso contínuo do teclado.",
};
