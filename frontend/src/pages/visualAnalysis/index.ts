// 视觉分析模块的统一导出入口

// 类型定义
export type {
  VisualAnalysisResult,
  VisualAnalysisProps,
  BinaryThresholdOption,
  GrayscaleLevels,
  SavedResultData,
} from "./types";

export { BINARY_THRESHOLD_OPTIONS } from "./types";

// Hooks
export { useOpenCV } from "./hooks/useOpenCV";
export { useTaskPolling, type TaskPollingCallbacks } from "./hooks/useTaskPolling";
export { useVisualAnalysisResults, type UseVisualAnalysisResultsReturn } from "./hooks/useVisualAnalysisResults";
export { useExistingResultCheck, type ExistingResultCheckCallbacks } from "./hooks/useExistingResultCheck";

// 工具函数
export {
  processImageUrl,
  processSavedResultUrls,
  convertUrlToBase64,
} from "./utils/imageUrlUtils";

export {
  matToDataUrl,
  checkOpencvReady,
  loadOpenCV,
} from "./utils/opencvUtils";

export {
  generateGrayscaleLevels,
  processImageBasic,
} from "./utils/imageProcessing";

// 服务
export {
  saveBasicResultsToServer,
  updateComprehensiveResultsToServer,
} from "./services/visualAnalysisService";
