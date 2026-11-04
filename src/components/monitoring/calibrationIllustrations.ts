import chairHeightGif from "../../assets/calibration/chair-height.gif";
import chairHeightStill from "../../assets/calibration/chair-height-still.png";
import chairFootrestGif from "../../assets/calibration/chair-footrest.gif";
import chairFootrestStill from "../../assets/calibration/chair-footrest-still.png";
import deskAdjustmentGif from "../../assets/calibration/desk-adjustment.gif";
import deskAdjustmentStill from "../../assets/calibration/desk-adjustment-still.png";
import deskChairGif from "../../assets/calibration/desk-chair-adjustment.gif";
import deskChairStill from "../../assets/calibration/desk-chair-adjustment-still.png";
import deskFixedGif from "../../assets/calibration/desk-fixed.gif";
import deskFixedStill from "../../assets/calibration/desk-fixed-still.png";
import monitorHeightGif from "../../assets/calibration/monitor-height.gif";
import monitorHeightStill from "../../assets/calibration/monitor-height-still.png";
import monitorSupportGif from "../../assets/calibration/monitor-height-support.gif";
import monitorSupportStill from "../../assets/calibration/monitor-height-support-still.png";
import notebookHeightGif from "../../assets/calibration/notebook-height.gif";
import notebookHeightStill from "../../assets/calibration/notebook-height-still.png";
import notebookSupportGif from "../../assets/calibration/notebook-height-support.gif";
import notebookSupportStill from "../../assets/calibration/notebook-height-support-still.png";
import monitorDistanceGif from "../../assets/calibration/monitor-distance-adjustment.gif";
import monitorDistanceStill from "../../assets/calibration/monitor-distance-adjustment-still.png";
import notebookDistanceGif from "../../assets/calibration/notebook-distance.gif";
import notebookDistanceStill from "../../assets/calibration/notebook-distance-still.png";
import peripheralsReadyGif from "../../assets/calibration/notebook-peripherals-ready.gif";
import peripheralsReadyStill from "../../assets/calibration/notebook-peripherals-ready-still.png";
import peripheralsKeyboardGif from "../../assets/calibration/notebook-peripherals-keyboard.gif";
import peripheralsKeyboardStill from "../../assets/calibration/notebook-peripherals-keyboard-still.png";
import peripheralsMouseGif from "../../assets/calibration/notebook-peripherals-mouse.gif";
import peripheralsMouseStill from "../../assets/calibration/notebook-peripherals-mouse-still.png";
import peripheralsBothGif from "../../assets/calibration/notebook-peripherals-both.gif";
import peripheralsBothStill from "../../assets/calibration/notebook-peripherals-both-still.png";
import webcamPositionGif from "../../assets/calibration/webcam-position.gif";
import webcamPositionStill from "../../assets/calibration/webcam-position-still.png";
import webcamAlignedGif from "../../assets/calibration/webcam-aligned.gif";
import webcamAlignedStill from "../../assets/calibration/webcam-aligned-still.png";
import type { CalibrationIllustration } from "./calibrationGuide";

/** Every route has a matching still for prefers-reduced-motion. */
export const CALIBRATION_ILLUSTRATIONS: Record<CalibrationIllustration, readonly [string, string, string]> = {
  "chair-height": [chairHeightGif, chairHeightStill, "A cadeira é regulada até que os pés fiquem apoiados."],
  "chair-footrest": [chairFootrestGif, chairFootrestStill, "A cadeira permanece fixa enquanto um apoio é colocado sob os pés."],
  "desk-adjustment": [deskAdjustmentGif, deskAdjustmentStill, "A mesa é regulada enquanto a cadeira permanece na mesma posição."],
  "desk-chair-adjustment": [deskChairGif, deskChairStill, "A cadeira é elevada junto à mesa fixa e os pés recebem um apoio."],
  "desk-fixed": [deskFixedGif, deskFixedStill, "Mesa e cadeira permanecem fixas enquanto o apoio dos braços é destacado para conferência."],
  "monitor-height": [monitorHeightGif, monitorHeightStill, "A base regulável eleva o monitor até a altura dos olhos."],
  "monitor-height-support": [monitorSupportGif, monitorSupportStill, "Um suporte fixo eleva o conjunto do monitor sem regular sua base."],
  "notebook-height": [notebookHeightGif, notebookHeightStill, "O suporte regulável eleva o notebook até a altura dos olhos."],
  "notebook-height-support": [notebookSupportGif, notebookSupportStill, "Uma base firme eleva o notebook sem depender de regulagem no suporte."],
  "monitor-distance-adjustment": [monitorDistanceGif, monitorDistanceStill, "O monitor é reposicionado sobre a mesa para ajustar a distância de leitura."],
  "notebook-distance": [notebookDistanceGif, notebookDistanceStill, "O notebook e seu suporte são reposicionados juntos para ajustar a distância da tela."],
  "notebook-peripherals-ready": [peripheralsReadyGif, peripheralsReadyStill, "Teclado e mouse externos já estão presentes, próximos ao notebook."],
  "notebook-peripherals-keyboard": [peripheralsKeyboardGif, peripheralsKeyboardStill, "Um teclado externo é adicionado enquanto o mouse existente permanece no lugar."],
  "notebook-peripherals-mouse": [peripheralsMouseGif, peripheralsMouseStill, "Um mouse externo é adicionado enquanto o teclado existente permanece no lugar."],
  "notebook-peripherals-both": [peripheralsBothGif, peripheralsBothStill, "Teclado e mouse externos são adicionados ao ambiente do notebook."],
  "webcam-position": [webcamPositionGif, webcamPositionStill, "A webcam é movida da lateral para o centro, alinhada ao rosto."],
  "webcam-aligned": [webcamAlignedGif, webcamAlignedStill, "A webcam permanece centralizada enquanto o enquadramento do rosto e dos ombros é destacado."],
};
