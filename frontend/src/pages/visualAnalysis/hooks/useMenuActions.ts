// 菜单操作 Hook - 管理菜单和删除确认对话框状态

import { useState, useEffect, useCallback, useRef } from "react";

type UseMenuActionsReturn = {
  menuOpen: boolean;
  showDeleteConfirm: boolean;
  handleToggleMenu: () => void;
  handleOpenDeleteConfirm: () => void;
  handleCloseDeleteConfirm: () => void;
  handleCloseMenu: () => void;
};

/**
 * 管理菜单和删除确认对话框状态的 Hook
 */
export function useMenuActions(): UseMenuActionsReturn {
  const [menuOpen, setMenuOpen] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const handleToggleMenu = useCallback(() => {
    setMenuOpen((prev) => !prev);
  }, []);

  const handleCloseMenu = useCallback(() => {
    setMenuOpen(false);
  }, []);

  const handleOpenDeleteConfirm = useCallback(() => {
    setMenuOpen(false);
    setShowDeleteConfirm(true);
  }, []);

  const handleCloseDeleteConfirm = useCallback(() => {
    setShowDeleteConfirm(false);
  }, []);

  // 点击外部关闭菜单
  useEffect(() => {
    if (!menuOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }
      if (
        target.closest(".visual-analysis-menu") ||
        target.closest(".visual-analysis-menu__trigger")
      ) {
        return;
      }
      setMenuOpen(false);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [menuOpen]);

  // ESC 键关闭删除确认对话框
  useEffect(() => {
    if (!showDeleteConfirm) {
      return;
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setShowDeleteConfirm(false);
      }
    };

    document.addEventListener("keydown", handleEscape);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = "";
    };
  }, [showDeleteConfirm]);

  return {
    menuOpen,
    showDeleteConfirm,
    handleToggleMenu,
    handleOpenDeleteConfirm,
    handleCloseDeleteConfirm,
    handleCloseMenu,
  };
}

