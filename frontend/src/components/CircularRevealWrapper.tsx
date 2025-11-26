import { useEffect, useRef, useState, type ReactNode } from "react";
import clsx from "clsx";

import "./CircularRevealWrapper.css";

type CircularRevealWrapperProps = {
  children: ReactNode;
  open: boolean;
  onClose: () => void;
  originX?: number; // 动画起始位置的 X 坐标（相对于视口）
  originY?: number; // 动画起始位置的 Y 坐标（相对于视口）
  originSize?: number; // 动画起始圆圈的大小（直径）
};

export function CircularRevealWrapper({
  children,
  open,
  onClose,
  originX,
  originY,
  originSize = 64, // 默认 64px（按钮大小）
}: CircularRevealWrapperProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [isAnimating, setIsAnimating] = useState(false);
  const [shouldRender, setShouldRender] = useState(false);
  const animationFrameRef = useRef<number | null>(null);

  useEffect(() => {
    // 清理之前的 animationFrame
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    if (open) {
      // 打开时：先重置状态，确保每次都是全新的开始
      setIsAnimating(false);
      setShouldRender(true);
      
      // 使用三重 requestAnimationFrame 确保 Android 浏览器能看到状态变化
      // 这对于 Android 浏览器尤其重要
      animationFrameRef.current = requestAnimationFrame(() => {
        animationFrameRef.current = requestAnimationFrame(() => {
          // 强制触发重排和重新计算样式，确保 Android 浏览器能正确应用初始样式
          animationFrameRef.current = requestAnimationFrame(() => {
            if (wrapperRef.current) {
              // 确保类被移除，状态是初始的
              const element = wrapperRef.current;
              element.classList.remove('circular-reveal-wrapper--open');
              element.offsetHeight; // 触发重排
              
              // 再等一帧后添加类，触发动画
              animationFrameRef.current = requestAnimationFrame(() => {
                setIsAnimating(true);
                animationFrameRef.current = null;
              });
            } else {
              setIsAnimating(true);
              animationFrameRef.current = null;
            }
          });
        });
      });
    } else {
      // 关闭时：先触发关闭动画，然后移除元素
      setIsAnimating(false);
      const timer = setTimeout(() => {
        setShouldRender(false);
      }, 400); // 匹配CSS动画时长
      return () => {
        clearTimeout(timer);
        if (animationFrameRef.current !== null) {
          cancelAnimationFrame(animationFrameRef.current);
          animationFrameRef.current = null;
        }
      };
    }

    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [open]);

  // 如果不需要渲染，返回 null
  if (!shouldRender) {
    return null;
  }

  // 计算动画的起点（使用按钮位置，如果没有提供则使用右下角）
  // 每次渲染时都重新计算，确保值是最新的
  const centerX = originX ?? (typeof window !== "undefined" ? window.innerWidth - 80 : 50); // 默认右下角
  const centerY = originY ?? (typeof window !== "undefined" ? window.innerHeight - 100 : 50); // 默认右下角
  const size = originSize;

  // 计算需要覆盖整个屏幕的圆的半径
  const maxRadius =
    typeof window !== "undefined"
      ? Math.sqrt(
          Math.pow(Math.max(centerX, window.innerWidth - centerX), 2) +
            Math.pow(Math.max(centerY, window.innerHeight - centerY), 2)
        ) + 100 // 添加一些余量确保完全覆盖
      : 2000; // 默认值，确保足够大

  return (
    <div
      ref={wrapperRef}
      className={clsx("circular-reveal-wrapper", isAnimating && "circular-reveal-wrapper--open")}
      style={{
        // 使用 CSS 变量传递动画参数
        // 每次渲染时都重新设置，确保 Android 浏览器能正确应用
        ["--origin-x" as string]: `${centerX}px`,
        ["--origin-y" as string]: `${centerY}px`,
        ["--origin-size" as string]: `${size}px`,
        ["--max-radius" as string]: `${maxRadius}px`,
        // 强制硬件加速
        transform: "translateZ(0)",
        WebkitTransform: "translateZ(0)",
      }}
    >
      <div className="circular-reveal-wrapper__backdrop" onClick={onClose} />
      <div className="circular-reveal-wrapper__content">{children}</div>
    </div>
  );
}
