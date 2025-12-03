# VisualAnalysis 重构指南

## 📝 概述

本文档说明如何使用已提取的模块来重构主组件 `VisualAnalysis.tsx`。

## ✅ 已提取的模块

所有模块都已创建完成，包括：

1. **类型定义** (`types.ts`)
2. **OpenCV Hook** (`hooks/useOpenCV.ts`)
3. **结果管理 Hook** (`hooks/useVisualAnalysisResults.ts`)
4. **任务轮询 Hook** (`hooks/useTaskPolling.ts`)
5. **已有结果检查 Hook** (`hooks/useExistingResultCheck.ts`)
6. **图片处理工具** (`utils/imageProcessing.ts`)
7. **URL 处理工具** (`utils/imageUrlUtils.ts`)
8. **OpenCV 工具** (`utils/opencvUtils.ts`)
9. **服务器保存服务** (`services/visualAnalysisService.ts`)

## 🔄 重构步骤

### 步骤 1: 替换 OpenCV 加载逻辑

**替换前** (约50行):
```typescript
const [opencvReady, setOpencvReady] = useState(false);
useEffect(() => {
  // ... 复杂的OpenCV加载逻辑
}, []);
```

**替换后**:
```typescript
import { useOpenCV } from "./hooks/useOpenCV";

const { opencvReady, error: opencvError } = useOpenCV();
```

### 步骤 2: 替换结果管理逻辑

**替换前** (约200行):
```typescript
const [results, setResults] = useState<Partial<VisualAnalysisResult> | null>(null);
const [comprehensiveResults, setComprehensiveResults] = useState<any>(null);
const loadResultWithGrayscaleLevels = useCallback(async (savedResult: any) => {
  // ... 复杂的结果加载逻辑
}, []);
```

**替换后**:
```typescript
import { useVisualAnalysisResults } from "./hooks/useVisualAnalysisResults";

const {
  results,
  savedResultData,
  comprehensiveResults,
  selectedThreshold,
  setResults,
  setSelectedThreshold,
  setComprehensiveResults,
  setSavedResultData,
  loadResultWithGrayscaleLevels,
  loadResultWithGrayscaleLevelsRef,
} = useVisualAnalysisResults(opencvReady);
```

### 步骤 3: 替换图片处理逻辑

**替换前** (约250行):
```typescript
const processImage = async (imageDataUrl: string, _file?: File) => {
  // ... 复杂的图片处理逻辑
};
```

**替换后**:
```typescript
import { processImageBasic } from "./utils/imageProcessing";

const processImage = async (imageDataUrl: string, _file?: File) => {
  setLoading(true);
  setError(null);
  try {
    const result = await processImageBasic(imageDataUrl, selectedThreshold, opencvReady);
    setResults(result);
    // 保存基础结果到服务器
    await saveBasicResultsToServer(result);
  } catch (err) {
    setError(err instanceof Error ? err.message : "处理图像时出错");
  } finally {
    setLoading(false);
  }
};
```

### 步骤 4: 替换任务轮询逻辑

**替换前** (约180行):
```typescript
const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
// ... 复杂的轮询逻辑
```

**替换后**:
```typescript
import { useTaskPolling } from "./hooks/useTaskPolling";

const { startPolling, stopPolling } = useTaskPolling();

// 在需要开始轮询的地方
startPolling(taskId, {
  onProgress: (progress) => setComprehensiveProgress(progress),
  onSuccess: async (result) => {
    await loadResultWithGrayscaleLevels(result);
    setComprehensiveLoading(false);
    setComprehensiveProgress(100);
  },
  onError: (error) => {
    setError(error);
    setComprehensiveLoading(false);
  },
}, isMountedRef);
```

### 步骤 5: 替换已有结果检查逻辑

**替换前** (约400行):
```typescript
useEffect(() => {
  async function checkExistingResult() {
    // ... 非常复杂的检查逻辑
  }
  checkExistingResult();
}, [resultId]);
```

**替换后**:
```typescript
import { useExistingResultCheck } from "./hooks/useExistingResultCheck";

useExistingResultCheck(resultId, {
  onLoadResult: loadResultWithGrayscaleLevels,
  onSetSavedResultId: setSavedResultId,
  onSetSavedResultData: setSavedResultData,
  onSetComprehensiveResults: setComprehensiveResults,
  onSetShowComprehensive: setShowComprehensive,
  onSetIsViewMode: setIsViewMode,
  onSetComprehensiveLoading: setComprehensiveLoading,
  onSetComprehensiveProgress: setComprehensiveProgress,
  onSetError: setError,
  onSetLoadingSavedResult: setLoadingSavedResult,
  onSetCheckingExistingResult: setCheckingExistingResult,
  onStartPolling: (taskId, progress) => {
    setCurrentTaskId(taskId);
    setComprehensiveProgress(progress);
    startPolling(taskId, {
      onProgress: setComprehensiveProgress,
      onSuccess: async (result) => {
        await loadResultWithGrayscaleLevels(result);
        setComprehensiveLoading(false);
      },
      onError: setError,
    });
  },
  onSetCurrentTaskId: setCurrentTaskId,
});
```

### 步骤 6: 替换服务器保存逻辑

**替换前** (约180行):
```typescript
const saveBasicResultsToServer = async (basicResults: Partial<VisualAnalysisResult>, imageDataUrl: string) => {
  // ... 复杂的保存逻辑
};

const updateComprehensiveResultsToServer = async (comprehensiveResults: any) => {
  // ... 非常复杂的更新逻辑
};
```

**替换后**:
```typescript
import {
  saveBasicResultsToServer,
  updateComprehensiveResultsToServer,
} from "./services/visualAnalysisService";

// 保存基础结果
const savedResult = await saveBasicResultsToServer(result);
setSavedResultId(savedResult.id);

// 更新专业分析结果
const updatedResult = await updateComprehensiveResultsToServer(
  comprehensiveResults,
  savedResultId,
  originalImage,
  results?.step2Grayscale || null,
  selectedThreshold
);
if (updatedResult) {
  setSavedResultId(updatedResult.id);
  setSavedResultData(processSavedResultUrls(updatedResult));
}
```

### 步骤 7: 替换 URL 处理逻辑

**替换前**:
```typescript
const processImageUrl = useCallback((url: string | null | undefined): string => {
  // ... URL处理逻辑
}, []);

const processSavedResultUrls = useCallback((savedResult: any) => {
  // ... 批量处理逻辑
}, []);
```

**替换后**:
```typescript
import { processImageUrl, processSavedResultUrls } from "./utils/imageUrlUtils";

// 直接使用，无需定义
```

## 📊 预期效果

重构完成后，主组件应该：

- **代码量**: 从 2231 行减少到约 600-800 行
- **状态变量**: 从 20+ 个减少到约 10-12 个
- **useEffect**: 从多个复杂的 useEffect 简化为清晰的 hooks 调用
- **可维护性**: 大幅提升，每个模块职责单一
- **可测试性**: 提升，工具函数和 hooks 可以独立测试

## ⚠️ 注意事项

1. **渐进式重构**: 建议先替换一个模块，测试通过后再继续
2. **保持功能一致**: 重构不应该改变任何功能行为
3. **充分测试**: 每次替换后都要测试所有相关功能
4. **保留原文件备份**: 重构前建议创建备份

## 🚀 快速开始

1. 导入需要的模块：
```typescript
import { useOpenCV } from "./hooks/useOpenCV";
import { useVisualAnalysisResults } from "./hooks/useVisualAnalysisResults";
import { useTaskPolling } from "./hooks/useTaskPolling";
import { processImageBasic } from "./utils/imageProcessing";
import { saveBasicResultsToServer } from "./services/visualAnalysisService";
```

2. 替换对应的逻辑块

3. 测试功能是否正常

4. 继续下一个模块

## 📚 完整示例

完整的重构示例请参考各模块的导出和文档注释。
