// 视觉分析相关的类型定义

export type VisualAnalysisResult = {
  originalImage: string;
  step1Binary: string;
  step2Grayscale: string;
  step2Grayscale3Level: string; // 3阶层灰度
  step2Grayscale4Level: string; // 4阶层灰度
  step3LabL: string;
  step4HsvS: string;
  step4HlsS: string;
  step5Hue: string;
  binaryThreshold: number;
  timestamp: string;
  comprehensive_analysis?: any; // 专业分析结果
};

export type VisualAnalysisProps = {
  onBack: () => void;
  onSave?: (result: VisualAnalysisResult) => void;
  resultId?: number; // 如果提供resultId，则显示已保存的结果
};

export type BinaryThresholdOption = {
  label: string;
  value: number;
};

export type GrayscaleLevels = {
  level3: string;
  level4: string;
};

export type SavedResultData = {
  id: number;
  original_image: string;
  step1_binary: string;
  step2_grayscale: string;
  step2_grayscale_3_level?: string;
  step2_grayscale_4_level?: string;
  step3_lab_l: string;
  step4_hsv_s?: string;
  step4_hls_s: string;
  step4_hls_s_inverted?: string;
  step5_hue: string;
  kmeans_segmentation_image?: string;
  kmeans_segmentation_image_12?: string;
  binary_threshold: number;
  created_at: string;
  comprehensive_analysis?: any;
  [key: string]: any;
};

// 二值化阈值选项（6个等级，从高到低）
export const BINARY_THRESHOLD_OPTIONS: BinaryThresholdOption[] = [
  { label: "等级1（最高）", value: 200 },
  { label: "等级2", value: 170 },
  { label: "等级3", value: 140 },
  { label: "等级4", value: 110 },
  { label: "等级5", value: 80 },
  { label: "等级6（最低）", value: 50 },
];
