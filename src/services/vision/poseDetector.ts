import {
  FilesetResolver,
  PoseLandmarker,
  FaceLandmarker,
  type PoseLandmarkerResult,
  type FaceLandmarkerResult,
} from "@mediapipe/tasks-vision";
import type { FaceTransformationMatrix } from "./biomechanics";

/**
 * Ponto 3D normalizado contendo coordenadas e indicadores de confiança.
 * - x, y: [0.0, 1.0] normalizados em relação à largura/altura da imagem.
 * - z: profundidade relativa ao centro do landmark / câmera (menor valor = mais próximo).
 * - visibility: probabilidade [0.0, 1.0] de que o landmark esteja visível no quadro.
 * - presence: probabilidade [0.0, 1.0] de que o landmark esteja presente na cena.
 */
export interface LandmarkPoint {
  x: number;
  y: number;
  z: number;
  visibility?: number;
  presence?: number;
}

/**
 * Resultado retornado pelo detectFrame, agregando as detecções corporais (Pose) e faciais (Face).
 */
export interface VisionDetectionResult {
  hasPose: boolean;
  hasFace: boolean;
  poseLandmarks: LandmarkPoint[] | null;
  worldLandmarks: LandmarkPoint[] | null;
  faceLandmarks: LandmarkPoint[] | null;
  faceTransformationMatrix: FaceTransformationMatrix | null;
  timestamp: number;
  rawPoseResult?: PoseLandmarkerResult;
  rawFaceResult?: FaceLandmarkerResult;
}

/**
 * Opções de configuração para inicializar os detectores.
 */
export interface PoseDetectorConfig {
  /** Caminho base ou URL onde os binários WASM do MediaPipe são servidos (ex: '/wasm') */
  wasmPath?: string;
  /** Caminho ou URL para o arquivo de modelo do PoseLandmarker (.task) */
  poseModelPath?: string;
  /** Caminho ou URL para o arquivo de modelo do FaceLandmarker (.task) */
  faceModelPath?: string;
  /** Modo de execução da inferência */
  runningMode?: "IMAGE" | "VIDEO";
  /** Delegado de aceleração por hardware: GPU (WebGL) ou CPU */
  delegate?: "GPU" | "CPU";
  numPoses?: number;
  numFaces?: number;
  minPoseDetectionConfidence?: number;
  minPosePresenceConfidence?: number;
  minPoseTrackingConfidence?: number;
  minFaceDetectionConfidence?: number;
  minFacePresenceConfidence?: number;
  minFaceTrackingConfidence?: number;
  outputFaceBlendshapes?: boolean;
}

/**
 * Índices dos pontos anatômicos para o MediaPipe Pose (33 landmarks).
 * Keypoints essenciais conforme a Arquitetura de Visão Ergonômica (RF-01, RF-02, RF-03).
 */
export const POSE_LANDMARK_INDEX = {
  NOSE: 0,
  LEFT_EYE_INNER: 1,
  LEFT_EYE: 2,
  LEFT_EYE_OUTER: 3,
  RIGHT_EYE_INNER: 4,
  RIGHT_EYE: 5,
  RIGHT_EYE_OUTER: 6,
  LEFT_EAR: 7,
  RIGHT_EAR: 8,
  MOUTH_LEFT: 9,
  MOUTH_RIGHT: 10,
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13,
  RIGHT_ELBOW: 14,
  LEFT_WRIST: 15,
  RIGHT_WRIST: 16,
} as const;

/**
 * Índices dos pontos essenciais do MediaPipe Face Mesh (468/478 landmarks).
 * Utilizados para o cálculo do EAR (Eye Aspect Ratio), contagem de piscadas e orientação cefálica.
 */
export const FACE_LANDMARK_INDEX = {
  RIGHT_IRIS_CENTER: 468,
  LEFT_IRIS_CENTER: 473,
  NOSE_TIP: 1,
  GLABELLA: 10,
  CHIN: 152,
  // 6 pontos para cálculo de EAR do Olho Esquerdo: [canto externo, canto interno, pálpebra sup 1, pálpebra sup 2, pálpebra inf 1, pálpebra inf 2]
  LEFT_EYE: {
    OUTER: 33,
    INNER: 133,
    TOP_1: 160,
    TOP_2: 158,
    BOTTOM_1: 144,
    BOTTOM_2: 153,
    /** Aliases anatômicos explícitos (temporal = externo, nasal = interno) */
    TOP_TEMPORAL: 160,
    TOP_NASAL: 158,
    BOTTOM_TEMPORAL: 144,
    BOTTOM_NASAL: 153,
    ALL: [33, 133, 160, 158, 144, 153] as const,
  },
  // 6 pontos para cálculo de EAR do Olho Direito
  RIGHT_EYE: {
    OUTER: 362,
    INNER: 263,
    TOP_1: 385,
    TOP_2: 387,
    BOTTOM_1: 373,
    BOTTOM_2: 380,
    /** Aliases anatômicos explícitos (temporal = externo, nasal = interno) */
    TOP_TEMPORAL: 385,
    TOP_NASAL: 387,
    BOTTOM_TEMPORAL: 380,
    BOTTOM_NASAL: 373,
    ALL: [362, 263, 385, 387, 373, 380] as const,
  },
} as const;

/**
 * Ordem canônica P1..P6 para cálculo do EAR (Soukupová & Čech, 2016):
 *   P1: Canto externo (temporal)
 *   P2: Pálpebra superior externa (temporal)
 *   P3: Pálpebra superior interna (nasal)
 *   P4: Canto interno (nasal)
 *   P5: Pálpebra inferior interna (nasal)  <-- par vertical com P3
 *   P6: Pálpebra inferior externa (temporal) <-- par vertical com P2
 *
 * Fórmula: (|P2 - P6| + |P3 - P5|) / (2 * |P1 - P4|)
 *
 * NOTA DE NOMENCLATURA:
 * 1. LEFT/RIGHT aqui referem-se aos olhos anatômicos do sujeito.
 * 2. As chaves legadas BOTTOM_1/BOTTOM_2 possuíam sentidos invertidos:
 *    - LEFT_EYE (olho anatômico direito): BOTTOM_1 era temporal (144) e BOTTOM_2 era nasal (153).
 *    - RIGHT_EYE (olho anatômico esquerdo): BOTTOM_1 era nasal (373) e BOTTOM_2 era temporal (380).
 *    Os aliases anatômicos TOP/BOTTOM_TEMPORAL e TOP/BOTTOM_NASAL acima eliminam essa ambiguidade.
 * 3. Ambas as tuplas canônicas resultam em:
 *    - RIGHT_EYE (anatômico direito):  [33, 160, 158, 133, 153, 144]
 *    - LEFT_EYE (anatômico esquerdo): [362, 385, 387, 263, 373, 380]
 */
export const FACE_EAR_INDEX = {
  RIGHT_EYE: [
    FACE_LANDMARK_INDEX.LEFT_EYE.OUTER,
    FACE_LANDMARK_INDEX.LEFT_EYE.TOP_TEMPORAL,
    FACE_LANDMARK_INDEX.LEFT_EYE.TOP_NASAL,
    FACE_LANDMARK_INDEX.LEFT_EYE.INNER,
    FACE_LANDMARK_INDEX.LEFT_EYE.BOTTOM_NASAL,
    FACE_LANDMARK_INDEX.LEFT_EYE.BOTTOM_TEMPORAL,
  ],
  LEFT_EYE: [
    FACE_LANDMARK_INDEX.RIGHT_EYE.OUTER,
    FACE_LANDMARK_INDEX.RIGHT_EYE.TOP_TEMPORAL,
    FACE_LANDMARK_INDEX.RIGHT_EYE.TOP_NASAL,
    FACE_LANDMARK_INDEX.RIGHT_EYE.INNER,
    FACE_LANDMARK_INDEX.RIGHT_EYE.BOTTOM_NASAL,
    FACE_LANDMARK_INDEX.RIGHT_EYE.BOTTOM_TEMPORAL,
  ],
} as const;

export const DEFAULT_DETECTOR_CONFIG: Required<PoseDetectorConfig> = {
  wasmPath: "/wasm",
  poseModelPath: "/models/pose_landmarker_lite.task",
  faceModelPath: "/models/face_landmarker.task",
  runningMode: "VIDEO",
  delegate: "GPU",
  numPoses: 1,
  numFaces: 1,
  minPoseDetectionConfidence: 0.5,
  minPosePresenceConfidence: 0.5,
  minPoseTrackingConfidence: 0.5,
  minFaceDetectionConfidence: 0.5,
  minFacePresenceConfidence: 0.5,
  minFaceTrackingConfidence: 0.5,
  outputFaceBlendshapes: false,
};

/**
 * Serviço responsável por gerenciar instâncias do PoseLandmarker e FaceLandmarker do MediaPipe,
 * configurar a aceleração WebGL e executar inferências em tempo real nos quadros de vídeo.
 */
export class PoseDetectorService {
  private poseLandmarker: PoseLandmarker | null = null;
  private faceLandmarker: FaceLandmarker | null = null;
  private config: Required<PoseDetectorConfig> = { ...DEFAULT_DETECTOR_CONFIG };
  private initPromise: Promise<void> | null = null;
  private isInitialized = false;
  private lastTimestamp = -1;

  /**
   * Inicializa o FilesetResolver e carrega tanto o PoseLandmarker quanto o FaceLandmarker.
   * Caso o delegado WebGL (GPU) falhe, realiza fallback automático para o delegado CPU.
   */
  public async initialize(customConfig?: Partial<PoseDetectorConfig>): Promise<void> {
    if (this.isInitialized) {
      if (customConfig?.runningMode && customConfig.runningMode !== this.config.runningMode) {
        await this.setRunningMode(customConfig.runningMode);
      }
      return;
    }

    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = (async () => {
      this.config = {
        ...DEFAULT_DETECTOR_CONFIG,
        ...customConfig,
      };

      try {
        console.info(
          `[PoseDetector] Carregando runtime WebAssembly do MediaPipe em: ${this.config.wasmPath}`
        );
        const visionFileset = await FilesetResolver.forVisionTasks(this.config.wasmPath);

        // Tenta inicializar com o delegado configurado (padrão GPU / WebGL)
        try {
          await this.createDetectors(visionFileset, this.config.delegate);
        } catch (gpuError) {
          if (this.config.delegate === "GPU") {
            console.warn(
              "[PoseDetector] Falha ao inicializar com delegado GPU/WebGL. Alternando para CPU.",
              gpuError
            );
            this.config.delegate = "CPU";
            await this.createDetectors(visionFileset, "CPU");
          } else {
            throw gpuError;
          }
        }

        this.isInitialized = true;
        this.lastTimestamp = -1;
        console.info(
          `[PoseDetector] Inicializado com sucesso (modo: ${this.config.runningMode}, delegado: ${this.config.delegate})`
        );
      } catch (error) {
        console.error("[PoseDetector] Falha na inicialização:", error);
        this.poseLandmarker = null;
        this.faceLandmarker = null;
        this.isInitialized = false;
        throw error;
      } finally {
        this.initPromise = null;
      }
    })();

    return this.initPromise;
  }

  /**
   * Auxiliar interno para criar as instâncias do PoseLandmarker e FaceLandmarker.
   */
  private async createDetectors(
    visionFileset: Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>,
    delegate: "GPU" | "CPU"
  ): Promise<void> {
    const [poseInstance, faceInstance] = await Promise.all([
      PoseLandmarker.createFromOptions(visionFileset, {
        baseOptions: {
          modelAssetPath: this.config.poseModelPath,
          delegate,
        },
        runningMode: this.config.runningMode,
        numPoses: this.config.numPoses,
        minPoseDetectionConfidence: this.config.minPoseDetectionConfidence,
        minPosePresenceConfidence: this.config.minPosePresenceConfidence,
        minTrackingConfidence: this.config.minPoseTrackingConfidence,
        outputSegmentationMasks: false,
      }),
      FaceLandmarker.createFromOptions(visionFileset, {
        baseOptions: {
          modelAssetPath: this.config.faceModelPath,
          delegate,
        },
        runningMode: this.config.runningMode,
        numFaces: this.config.numFaces,
        minFaceDetectionConfidence: this.config.minFaceDetectionConfidence,
        minFacePresenceConfidence: this.config.minFacePresenceConfidence,
        minTrackingConfidence: this.config.minFaceTrackingConfidence,
        outputFaceBlendshapes: this.config.outputFaceBlendshapes,
        outputFacialTransformationMatrixes: true,
      }),
    ]);

    this.poseLandmarker = poseInstance;
    this.faceLandmarker = faceInstance;
  }

  /**
   * Verifica se os detectores estão inicializados e prontos para processar quadros.
   */
  public isReady(): boolean {
    return this.isInitialized && this.poseLandmarker !== null && this.faceLandmarker !== null;
  }

  /**
   * Retorna o modo de execução atual ("VIDEO" | "IMAGE").
   */
  public getRunningMode(): "IMAGE" | "VIDEO" {
    return this.config.runningMode;
  }

  /**
   * Alterna dinamicamente o modo de execução entre "IMAGE" e "VIDEO".
   */
  public async setRunningMode(mode: "IMAGE" | "VIDEO"): Promise<void> {
    if (this.config.runningMode === mode) return;

    this.config.runningMode = mode;
    this.lastTimestamp = -1;

    if (this.poseLandmarker) {
      await this.poseLandmarker.setOptions({ runningMode: mode });
    }
    if (this.faceLandmarker) {
      await this.faceLandmarker.setOptions({ runningMode: mode });
    }
  }

  /**
   * Executa a detecção em um único quadro a partir de um HTMLVideoElement.
   * Extrai as coordenadas 3D (x, y, z) e indicadores de confiança (visibility/presence).
   *
   * @param videoElement Elemento HTMLVideoElement contendo a reprodução ativa da webcam.
   * @param timestamp Timestamp monotônico opcional em milissegundos (padrão: performance.now()).
   * @returns VisionDetectionResult consolidado.
   */
  public detectFrame(videoElement: HTMLVideoElement, timestamp?: number): VisionDetectionResult {
    const emptyResult: VisionDetectionResult = {
      hasPose: false,
      hasFace: false,
      poseLandmarks: null,
      worldLandmarks: null,
      faceLandmarks: null,
      faceTransformationMatrix: null,
      timestamp: timestamp ?? performance.now(),
    };

    if (!this.isReady()) {
      return emptyResult;
    }

    // Garante que o elemento de vídeo possui dimensões válidas e está pronto para renderização
    if (
      videoElement.readyState < 2 ||
      videoElement.videoWidth === 0 ||
      videoElement.videoHeight === 0
    ) {
      return emptyResult;
    }

    let rawPoseResult: PoseLandmarkerResult | undefined;
    let rawFaceResult: FaceLandmarkerResult | undefined;

    if (this.config.runningMode === "VIDEO") {
      let ts = timestamp ?? performance.now();
      // O MediaPipe exige timestamps estritamente monotônicos e crescentes no modo VIDEO
      if (ts <= this.lastTimestamp) {
        ts = this.lastTimestamp + 1;
      }
      this.lastTimestamp = ts;

      try {
        rawPoseResult = this.poseLandmarker!.detectForVideo(videoElement, ts);
      } catch (err) {
        console.warn("[PoseDetector] Erro na detecção corporal (Pose) no quadro:", err);
      }

      try {
        rawFaceResult = this.faceLandmarker!.detectForVideo(videoElement, ts);
      } catch (err) {
        console.warn("[PoseDetector] Erro na detecção facial (Face) no quadro:", err);
      }

      emptyResult.timestamp = ts;
    } else {
      // Modo de execução IMAGE
      try {
        rawPoseResult = this.poseLandmarker!.detect(videoElement);
      } catch (err) {
        console.warn("[PoseDetector] Erro na detecção corporal (Pose) na imagem:", err);
      }

      try {
        rawFaceResult = this.faceLandmarker!.detect(videoElement);
      } catch (err) {
        console.warn("[PoseDetector] Erro na detecção facial (Face) na imagem:", err);
      }
    }

    // Extrai as landmarks corporais normalizadas
    let poseLandmarks: LandmarkPoint[] | null = null;
    let worldLandmarks: LandmarkPoint[] | null = null;
    let hasPose = false;

    if (rawPoseResult && rawPoseResult.landmarks && rawPoseResult.landmarks.length > 0) {
      const firstPose = rawPoseResult.landmarks[0];
      if (firstPose && firstPose.length > 0) {
        hasPose = true;
        poseLandmarks = this.mapLandmarks(firstPose);
      }

      if (rawPoseResult.worldLandmarks && rawPoseResult.worldLandmarks.length > 0) {
        const firstWorldPose = rawPoseResult.worldLandmarks[0];
        if (firstWorldPose && firstWorldPose.length > 0) {
          worldLandmarks = this.mapLandmarks(firstWorldPose);
        }
      }
    }

    // Extrai as landmarks faciais normalizadas
    let faceLandmarks: LandmarkPoint[] | null = null;
    let hasFace = false;

    if (
      rawFaceResult &&
      rawFaceResult.faceLandmarks &&
      rawFaceResult.faceLandmarks.length > 0
    ) {
      const firstFace = rawFaceResult.faceLandmarks[0];
      if (firstFace && firstFace.length > 0) {
        hasFace = true;
        faceLandmarks = this.mapFaceLandmarks(firstFace);
      }
    }

    return {
      hasPose,
      hasFace,
      poseLandmarks,
      worldLandmarks,
      faceLandmarks,
      faceTransformationMatrix: hasFace ? rawFaceResult?.facialTransformationMatrixes?.[0] ?? null : null,
      timestamp: emptyResult.timestamp,
      rawPoseResult,
      rawFaceResult,
    };
  }

  /**
   * Método auxiliar para mapear landmarks do MediaPipe para objetos LandmarkPoint,
   * extraindo coordenadas (x, y, z) e índices de confiança (visibility e presence).
   */
  private mapLandmarks(
    landmarks: Array<{
      x: number;
      y: number;
      z: number;
      visibility?: number;
      presence?: number;
    }>
  ): LandmarkPoint[] {
    return landmarks.map((lm) => ({
      x: lm.x,
      y: lm.y,
      z: lm.z,
      visibility: typeof lm.visibility === "number" ? lm.visibility : 1.0,
      presence: typeof lm.presence === "number" ? lm.presence : 1.0,
    }));
  }

  /**
   * Mapeamento de landmarks faciais. No runtime MediaPipe WebAssembly FaceLandmarker,
   * a propriedade visibility não é calculada por vértice e vem sempre como 0.
   * Portanto, a confiança real do ponto facial é provida por presence (ou 1.0).
   */
  private mapFaceLandmarks(
    landmarks: Array<{
      x: number;
      y: number;
      z: number;
      visibility?: number;
      presence?: number;
    }>
  ): LandmarkPoint[] {
    const isWasmZeroVisibility = landmarks.length > 0 && landmarks.every((lm) => lm.visibility === 0);

    return landmarks.map((lm) => ({
      x: lm.x,
      y: lm.y,
      z: lm.z,
      visibility: isWasmZeroVisibility
        ? (typeof lm.presence === "number" && lm.presence > 0 ? lm.presence : 1.0)
        : (typeof lm.visibility === "number" ? lm.visibility : 1.0),
      presence: typeof lm.presence === "number" ? lm.presence : 1.0,
    }));
  }

  /**
   * Encerra os detectores ativos e libera recursos de WebGL / WebAssembly.
   */
  public close(): void {
    if (this.poseLandmarker) {
      try {
        this.poseLandmarker.close();
      } catch (e) {
        console.warn("[PoseDetector] Erro ao fechar PoseLandmarker:", e);
      }
      this.poseLandmarker = null;
    }

    if (this.faceLandmarker) {
      try {
        this.faceLandmarker.close();
      } catch (e) {
        console.warn("[PoseDetector] Erro ao fechar FaceLandmarker:", e);
      }
      this.faceLandmarker = null;
    }

    this.isInitialized = false;
    this.initPromise = null;
    this.lastTimestamp = -1;
  }
}

/**
 * Instância singleton do PoseDetectorService.
 */
export const poseDetector = new PoseDetectorService();

export default poseDetector;
