# VisualAnalysis 模块使用示例

本文档展示了如何使用新提取的组件和 Hooks 来简化主组件。

## 📦 新创建的组件和 Hooks

### 组件
1. **DeleteConfirmModal** - 删除确认对话框
2. **ImageUploadArea** - 图片上传区域
3. **VisualAnalysisMenu** - 更多操作菜单

### Hooks
1. **useImageUpload** - 图片上传管理
2. **useMenuActions** - 菜单操作管理

## 🔄 重构示例

### 示例 1：替换删除确认对话框

**重构前** (2133-2223 行)：

```typescript
{showDeleteConfirm && (resultId || savedResultId) ? (
  <div className="artwork-delete-confirm-overlay" onClick={...}>
    {/* 90 行 JSX 代码 */}
  </div>
) : null}
```

**重构后**：

```typescript
import { DeleteConfirmModal } from "./components/DeleteConfirmModal";

<DeleteConfirmModal
  open={showDeleteConfirm && !!(resultId || savedResultId)}
  isDeleting={isDeleting}
  onConfirm={handleDelete}
  onCancel={() => setShowDeleteConfirm(false)}
/>
```

**效果**：减少 90 行代码，提高可读性

---

### 示例 2：替换图片上传区域

**重构前** (1949-2019 行)：

```typescript
{!originalImage && !results && !imagePreview && !loadingSavedResult ? (
  <div className="visual-analysis__upload">
    {/* 上传 UI 代码 */}
  </div>
) : imagePreview && !originalImage && !results ? (
  <div className="visual-analysis__upload">
    {/* 预览 UI 代码 */}
  </div>
) : ...}
```

**重构后**：

```typescript
import { ImageUploadArea } from "./components/ImageUploadArea";
import { useImageUpload } from "./hooks/useImageUpload";

function VisualAnalysis({ onBack, onSave, resultId }: VisualAnalysisProps) {
  const {
    imageFile,
    imagePreview,
    isCompressing,
    error: uploadError,
    handleFileSelect,
    handleConfirm,
    clear: clearUpload,
  } = useImageUpload();

  // ... 其他代码

  return (
    <>
      {/* 上传/预览区域 */}
      {!originalImage && !results && !loadingSavedResult && (
        <ImageUploadArea
          onFileSelect={handleFileSelect}
          preview={imagePreview}
          onConfirm={async () => {
            const { file, dataUrl } = await handleConfirm();
            setOriginalImage(dataUrl);
            // 开始分析...
          }}
          onCancel={clearUpload}
          opencvReady={opencvReady}
          loading={loading}
          compressing={isCompressing}
        />
      )}
      
      {/* 其他内容 */}
    </>
  );
}
```

**效果**：减少 70 行代码，逻辑更清晰

---

### 示例 3：替换菜单操作

**重构前** (1770-1852 行)：

```typescript
const [menuOpen, setMenuOpen] = useState(false);
const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

const handleToggleMenu = useCallback(() => {
  setMenuOpen((prev) => !prev);
}, []);

// 点击外部关闭菜单的 useEffect (1830-1852 行)
// ESC 键关闭删除确认的 useEffect (1854-1871 行)

{menuOpen && resultId ? (
  <div className="visual-analysis-menu">
    {/* 菜单内容 */}
  </div>
) : null}
```

**重构后**：

```typescript
import { VisualAnalysisMenu } from "./components/VisualAnalysisMenu";
import { useMenuActions } from "./hooks/useMenuActions";

function VisualAnalysis({ onBack, onSave, resultId }: VisualAnalysisProps) {
  const {
    menuOpen,
    showDeleteConfirm,
    handleToggleMenu,
    handleOpenDeleteConfirm,
    handleCloseDeleteConfirm,
  } = useMenuActions();

  return (
    <>
      <TopNav
        trailingActions={
          resultId
            ? [
                {
                  icon: "more_vert",
                  label: "更多操作",
                  onClick: handleToggleMenu,
                  className: "visual-analysis-menu__trigger",
                },
              ]
            : []
        }
      />
      
      {resultId && (
        <VisualAnalysisMenu
          open={menuOpen}
          onDelete={handleOpenDeleteConfirm}
        />
      )}
      
      <DeleteConfirmModal
        open={showDeleteConfirm}
        isDeleting={isDeleting}
        onConfirm={handleDelete}
        onCancel={handleCloseDeleteConfirm}
      />
    </>
  );
}
```

**效果**：减少 100 行代码，状态管理更清晰

---

## 🎯 完整重构示例

### 主组件简化版（前 200 行示例）

```typescript
import { useState, useRef, useEffect } from "react";
import TopNav from "@/components/TopNav";
import { useOpenCV } from "./hooks/useOpenCV";
import { useImageUpload } from "./hooks/useImageUpload";
import { useMenuActions } from "./hooks/useMenuActions";
import { ImageUploadArea } from "./components/ImageUploadArea";
import { VisualAnalysisMenu } from "./components/VisualAnalysisMenu";
import { DeleteConfirmModal } from "./components/DeleteConfirmModal";
import VisualAnalysisComprehensive from "./VisualAnalysisComprehensive";

function VisualAnalysis({ onBack, onSave, resultId }: VisualAnalysisProps) {
  // OpenCV 状态
  const { opencvReady, error: opencvError } = useOpenCV();
  
  // 图片上传
  const {
    imageFile,
    imagePreview,
    isCompressing,
    handleFileSelect,
    handleConfirm,
    clear: clearUpload,
  } = useImageUpload();
  
  // 菜单操作
  const {
    menuOpen,
    showDeleteConfirm,
    handleToggleMenu,
    handleOpenDeleteConfirm,
    handleCloseDeleteConfirm,
  } = useMenuActions();
  
  // 其他状态...
  const [results, setResults] = useState<Partial<VisualAnalysisResult> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // 处理图片确认
  const handleImageConfirm = async () => {
    try {
      const { file, dataUrl } = await handleConfirm();
      setOriginalImage(dataUrl);
      // 开始分析...
      await startAnalysis(file, dataUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "处理失败");
    }
  };
  
  return (
    <div className="visual-analysis">
      <TopNav
        leadingAction={{ icon: "arrow_back", label: "返回", onClick: onBack }}
        title="视觉分析"
        trailingActions={
          resultId
            ? [
                {
                  icon: "more_vert",
                  label: "更多操作",
                  onClick: handleToggleMenu,
                  className: "visual-analysis-menu__trigger",
                },
              ]
            : []
        }
      />
      
      {resultId && (
        <VisualAnalysisMenu
          open={menuOpen}
          onDelete={handleOpenDeleteConfirm}
        />
      )}
      
      <main className="visual-analysis__content">
        {/* 上传区域 */}
        {!originalImage && !results && !loadingSavedResult && (
          <ImageUploadArea
            onFileSelect={handleFileSelect}
            preview={imagePreview}
            onConfirm={handleImageConfirm}
            onCancel={clearUpload}
            opencvReady={opencvReady}
            loading={loading}
            compressing={isCompressing}
          />
        )}
        
        {/* 分析结果 */}
        {results && (
          <VisualAnalysisComprehensive
            results={comprehensiveResults}
            basicResults={results}
            // ... 其他 props
          />
        )}
      </main>
      
      <DeleteConfirmModal
        open={showDeleteConfirm && !!(resultId || savedResultId)}
        isDeleting={isDeleting}
        onConfirm={handleDelete}
        onCancel={handleCloseDeleteConfirm}
      />
    </div>
  );
}
```

## 📊 重构效果对比

### 代码量

| 部分 | 重构前 | 重构后 | 减少 |
|------|--------|--------|------|
| 删除对话框 | 90 行 | 5 行 | -94% |
| 上传区域 | 70 行 | 15 行 | -79% |
| 菜单逻辑 | 100 行 | 10 行 | -90% |
| 主组件总计 | 2231 行 | ~600 行（预计） | -73% |

### 可维护性提升

1. **职责分离**：UI 组件、业务逻辑、状态管理分离
2. **易于测试**：组件和 Hooks 可独立测试
3. **易于复用**：组件可在其他页面使用
4. **易于扩展**：新增功能只需修改对应的 Hook 或组件

## 🚀 下一步

1. **逐步重构**：按照示例逐步替换主组件中的代码
2. **测试验证**：每次重构后测试功能是否正常
3. **继续提取**：提取更多组件和 Hooks（如 AnalysisLoadingView）
4. **优化性能**：使用 React.memo 优化组件渲染

## 📝 注意事项

1. **保持功能一致**：重构过程中确保功能完全一致
2. **充分测试**：每次提取模块后都要测试
3. **代码审查**：提取的代码要符合项目规范
4. **文档更新**：及时更新相关文档

---

**创建时间**：2024
**维护者**：开发团队

