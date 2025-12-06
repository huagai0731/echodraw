// OpenCV Hook - 管理 OpenCV.js 的加载状态

import { useState, useEffect } from "react";
import { loadOpenCV, checkOpencvReady } from "../utils/opencvUtils";

/**
 * 管理 OpenCV.js 库的加载状态
 */
export function useOpenCV() {
  const [opencvReady, setOpencvReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // 先检查是否已经加载
    if (checkOpencvReady()) {
      setOpencvReady(true);
      return;
    }

    // 加载 OpenCV
    loadOpenCV()
      .then(() => {
        setOpencvReady(true);
        setError(null);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "图像处理功能加载失败");
        setOpencvReady(false);
      });
  }, []);

  return { opencvReady, error };
}
