// OpenCV 相关工具函数

/**
 * 将 OpenCV Mat 转换为 Data URL
 */
export const matToDataUrl = (mat: any): string => {
  const cv = (window as any).cv;
  const canvas = document.createElement("canvas");
  cv.imshow(canvas, mat);
  return canvas.toDataURL("image/png");
};

/**
 * 检查 OpenCV 是否已加载并可用
 */
export const checkOpencvReady = (): boolean => {
  if (typeof window === "undefined") return false;
  const cv = (window as any).cv;
  return !!(cv && cv.Mat);
};

/**
 * 加载 OpenCV.js 库
 */
export const loadOpenCV = (): Promise<void> => {
  return new Promise((resolve, reject) => {
    if (checkOpencvReady()) {
      resolve();
      return;
    }

    const script = document.createElement("script");
    script.src = "https://docs.opencv.org/4.x/opencv.js";
    script.async = true;
    
    script.onload = () => {
      const cv = (window as any).cv;
      if (cv) {
        if (cv.onRuntimeInitialized) {
          cv.onRuntimeInitialized = () => {
            resolve();
          };
        } else {
          // 如果已经初始化，直接resolve
          setTimeout(() => {
            if (checkOpencvReady()) {
              resolve();
            } else {
              reject(new Error("图像处理功能加载失败"));
            }
          }, 100);
        }
      } else {
        reject(new Error("图像处理功能未就绪"));
      }
    };
    
    script.onerror = () => {
      reject(new Error("图像处理功能加载失败，请检查网络连接"));
    };
    
    document.body.appendChild(script);
  });
};
