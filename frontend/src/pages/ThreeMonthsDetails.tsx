import { useState, useEffect, useCallback, useRef } from "react";
import MaterialIcon from "@/components/MaterialIcon";
import TopNav from "@/components/TopNav";
import type { LongTermGoal, ThreeMonthsRound } from "@/services/api";
import { updateThreeMonthsRound, createUserUpload } from "@/services/api";
import { loadStoredArtworks, USER_ARTWORKS_CHANGED_EVENT } from "@/services/artworkStorage";
import type { Artwork } from "@/types/artwork";
import { formatISODateInShanghai, parseISODateInShanghai } from "@/utils/dateUtils";
import ArtworkSelector from "@/components/ArtworkSelector";
import RoundCompleteModal from "@/components/RoundCompleteModal";
import "./ThreeMonthsDetails.css";

type ThreeMonthsDetailsProps = {
  goal: LongTermGoal;
  onClose: () => void;
  onGoalUpdated?: (goal: LongTermGoal) => void;
};

function ThreeMonthsDetails({ goal, onClose, onGoalUpdated }: ThreeMonthsDetailsProps) {
  const rounds = goal.rounds ?? [];
  
  // 初始化当前轮次索引：优先找第一个进行中的轮次，否则找第一个轮次，否则默认为1
  const getInitialRoundIndex = () => {
    if (rounds.length === 0) return 1;
    const sortedRounds = [...rounds].sort((a, b) => a.roundIndex - b.roundIndex);
    const inProgressRound = sortedRounds.find((r) => r.status === "in-progress");
    if (inProgressRound) return inProgressRound.roundIndex;
    return sortedRounds[0]?.roundIndex ?? 1;
  };
  
  const [currentRoundIndex, setCurrentRoundIndex] = useState(getInitialRoundIndex);
  const [showArtworkSelector, setShowArtworkSelector] = useState(false);
  const [showCompleteModal, setShowCompleteModal] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const saveTimeoutRef = useRef<number | null>(null);

  // 找到当前轮次
  const currentRound = rounds.find((r) => r.roundIndex === currentRoundIndex) ?? null;

  // 确保 currentRoundIndex 始终有效
  useEffect(() => {
    if (rounds.length > 0) {
      const sortedRounds = [...rounds].sort((a, b) => a.roundIndex - b.roundIndex);
      const exists = sortedRounds.some((r) => r.roundIndex === currentRoundIndex);
      if (!exists) {
        // 如果当前轮次不存在，切换到第一个进行中的轮次，否则切换到第一个轮次
        const inProgressRound = sortedRounds.find((r) => r.status === "in-progress");
        const targetRoundIndex = inProgressRound?.roundIndex ?? sortedRounds[0]?.roundIndex;
        if (targetRoundIndex && typeof targetRoundIndex === "number") {
          setCurrentRoundIndex(targetRoundIndex);
        }
      }
    }
  }, [rounds, currentRoundIndex]);

  // 本地状态管理
  const [localRound, setLocalRound] = useState<Partial<ThreeMonthsRound>>(() => {
    if (currentRound) {
      return {
        planImage: currentRound.planImage ?? null,
        planText: currentRound.planText ?? null,
        doImageId: currentRound.doImageId ?? null,
        checkText: currentRound.checkText ?? null,
        actionText: currentRound.actionText ?? null,
      };
    }
    return {
      planImage: null,
      planText: null,
      doImageId: null,
      checkText: null,
      actionText: null,
    };
  });

  // 当轮次切换时，更新本地状态
  useEffect(() => {
    if (currentRound) {
      setLocalRound({
        planImage: currentRound.planImage ?? null,
        planText: currentRound.planText ?? null,
        doImageId: currentRound.doImageId ?? null,
        checkText: currentRound.checkText ?? null,
        actionText: currentRound.actionText ?? null,
      });
      setHasUnsavedChanges(false);
    }
  }, [currentRoundIndex, currentRound]);

  // 实时保存草稿（防抖）
  const saveDraft = useCallback(async () => {
    if (!currentRound || !hasUnsavedChanges) return;

    if (saveTimeoutRef.current) {
      window.clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = window.setTimeout(async () => {
      setIsSaving(true);
      try {
        const updatedGoal = await updateThreeMonthsRound({
          goalId: goal.id,
          roundIndex: currentRoundIndex,
          planImage: localRound.planImage ?? undefined,
          planText: localRound.planText ?? undefined,
          doImageId: localRound.doImageId ?? undefined,
          checkText: localRound.checkText ?? undefined,
          actionText: localRound.actionText ?? undefined,
          completeRound: false,
        });
        if (onGoalUpdated) {
          onGoalUpdated(updatedGoal);
        }
        setHasUnsavedChanges(false);
      } catch (error) {
        console.error("保存草稿失败", error);
      } finally {
        setIsSaving(false);
      }
    }, 1000); // 1秒防抖
  }, [goal.id, currentRoundIndex, localRound, hasUnsavedChanges, currentRound, onGoalUpdated]);

  // 当有未保存的更改时，自动保存
  useEffect(() => {
    if (hasUnsavedChanges) {
      saveDraft();
    }
    return () => {
      if (saveTimeoutRef.current) {
        window.clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [hasUnsavedChanges, saveDraft]);

  // 离开页面提示
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = "";
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [hasUnsavedChanges]);

  // 更新本地状态并标记为已更改
  const updateLocalRound = useCallback((updates: Partial<ThreeMonthsRound>) => {
    setLocalRound((prev) => ({ ...prev, ...updates }));
    setHasUnsavedChanges(true);
  }, []);

  // 切换轮次
  const switchRound = useCallback(
    (direction: "prev" | "next") => {
      if (hasUnsavedChanges) {
        const confirmed = window.confirm("当前轮次有未保存的更改，是否保存？");
        if (confirmed) {
          saveDraft();
        }
      }

      const sortedRounds = [...rounds].sort((a, b) => a.roundIndex - b.roundIndex);
      const currentIdx = sortedRounds.findIndex((r) => r.roundIndex === currentRoundIndex);

      if (direction === "prev" && currentIdx > 0) {
        const prevRound = sortedRounds[currentIdx - 1];
        if (prevRound && typeof prevRound.roundIndex === "number") {
          setCurrentRoundIndex(prevRound.roundIndex);
        }
      } else if (direction === "next" && currentIdx < sortedRounds.length - 1) {
        const nextRound = sortedRounds[currentIdx + 1];
        if (nextRound && typeof nextRound.roundIndex === "number") {
          setCurrentRoundIndex(nextRound.roundIndex);
        }
      }
    },
    [currentRoundIndex, rounds, hasUnsavedChanges, saveDraft]
  );

  // 处理PLAN图片上传
  const handlePlanImageUpload = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      try {
        // 上传图片到服务器（作为附件，不进入画集）
        // 使用特殊标题标记，以便区分
        const upload = await createUserUpload({
          file,
          title: `[3个月学习法-附件] 第${typeof currentRoundIndex === "number" ? currentRoundIndex : 1}轮-PLAN`,
          description: "3个月学习法PLAN图片附件",
          tags: [],
          moodId: null,
          selfRating: 0,
          durationMinutes: 0,
        });

        // 使用返回的图片URL
        if (upload.image) {
          updateLocalRound({ planImage: upload.image });
        }
      } catch (error) {
        console.error("上传PLAN图片失败", error);
        alert("上传图片失败，请重试");
      }
    },
    [updateLocalRound, currentRoundIndex]
  );

  // 处理DO图片选择
  const handleDoImageSelect = useCallback(
    (artworkId: number) => {
      updateLocalRound({ doImageId: artworkId });
      setShowArtworkSelector(false);
    },
    [updateLocalRound]
  );

  // 检查是否可以完成本轮
  const canCompleteRound = useCallback(() => {
    return (
      !!localRound.planImage &&
      !!localRound.doImageId &&
      !!localRound.checkText?.trim() &&
      !!localRound.actionText?.trim()
    );
  }, [localRound]);

  // 完成本轮
  const handleCompleteRound = useCallback(async () => {
    if (!canCompleteRound() || !currentRound) return;

    // 先保存当前数据
    try {
      const updatedGoal = await updateThreeMonthsRound({
        goalId: goal.id,
        roundIndex: currentRoundIndex,
        planImage: localRound.planImage ?? undefined,
        planText: localRound.planText ?? undefined,
        doImageId: localRound.doImageId ?? undefined,
        checkText: localRound.checkText ?? undefined,
        actionText: localRound.actionText ?? undefined,
        completeRound: true,
      });

      if (onGoalUpdated) {
        onGoalUpdated(updatedGoal);
      }

      // 切换到下一轮
      const sortedRounds = [...(updatedGoal.rounds ?? [])].sort(
        (a, b) => a.roundIndex - b.roundIndex
      );
      const nextRound = sortedRounds.find(
        (r) => r.roundIndex > currentRoundIndex && r.status === "in-progress"
      );
      if (nextRound) {
        setCurrentRoundIndex(nextRound.roundIndex);
      }

      setShowCompleteModal(false);
      setHasUnsavedChanges(false);
    } catch (error) {
      console.error("完成本轮失败", error);
    }
  }, [goal.id, currentRoundIndex, localRound, canCompleteRound, currentRound, onGoalUpdated]);

  // 计算时间范围（3个月）
  const timeRange = useCallback(() => {
    if (!goal.startedAt) return null;
    const startDate = parseISODateInShanghai(goal.startedAt);
    if (!startDate) return null;
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 90);
    return { startDate, endDate };
  }, [goal.startedAt]);

  // 获取DO图片的URL
  const getDoImageUrl = useCallback(() => {
    if (!localRound.doImageId) return null;
    const artworks = loadStoredArtworks();
    const artwork = artworks.find((a) => {
      const numericId = a.id.replace(/^art-/, "");
      return Number.parseInt(numericId, 10) === localRound.doImageId;
    });
    return artwork?.imageSrc ?? null;
  }, [localRound.doImageId]);

  const sortedRounds = [...rounds].sort((a, b) => a.roundIndex - b.roundIndex);
  const currentRoundIdx = sortedRounds.findIndex((r) => r.roundIndex === currentRoundIndex);
  const canGoPrev = currentRoundIdx > 0;
  const canGoNext = currentRoundIdx < sortedRounds.length - 1;

  return (
    <div className="three-months-details">
      <div className="three-months-details__background">
        <div className="three-months-details__glow three-months-details__glow--mint" />
        <div className="three-months-details__glow three-months-details__glow--brown" />
      </div>

      <TopNav
        title="3个月学习法"
        subtitle={typeof currentRoundIndex === "number" ? `第 ${currentRoundIndex} 轮` : "第 1 轮"}
        className="top-nav--fixed top-nav--flush"
        leadingAction={{
          icon: "arrow_back",
          label: "返回",
          onClick: () => {
            if (hasUnsavedChanges) {
              const confirmed = window.confirm("有未保存的更改，是否保存？");
              if (confirmed) {
                saveDraft();
              }
            }
            onClose();
          },
        }}
        trailingActions={
          canGoPrev || canGoNext
            ? [
                {
                  icon: "more_vert",
                  label: "切换轮次",
                  onClick: () => {
                    // 显示轮次选择器（可以后续实现）
                  },
                },
              ]
            : undefined
        }
      />

      <main className="three-months-details__content">
        {/* 轮次切换控制 */}
        {sortedRounds.length > 1 && (
          <div className="three-months-details__round-controls">
            <button
              type="button"
              className="three-months-details__round-nav"
              onClick={() => switchRound("prev")}
              disabled={!canGoPrev}
              aria-label="上一轮"
            >
              <MaterialIcon name="chevron_left" />
            </button>
            <div className="three-months-details__round-info">
              <span className="three-months-details__round-label">
                第 {typeof currentRoundIndex === "number" ? currentRoundIndex : 1} 轮
                {currentRound?.status === "completed" && "（已完成）"}
                {currentRound?.status === "not-started" && "（未开始）"}
              </span>
            </div>
            <button
              type="button"
              className="three-months-details__round-nav"
              onClick={() => switchRound("next")}
              disabled={!canGoNext}
              aria-label="下一轮"
            >
              <MaterialIcon name="chevron_right" />
            </button>
          </div>
        )}

        {/* 未开始轮次提示 */}
        {currentRound?.status === "not-started" && (
          <div className="three-months-details__not-started">
            <p>第 {typeof currentRoundIndex === "number" ? currentRoundIndex : 1} 轮（未开始）</p>
            <p className="three-months-details__not-started-hint">
              完成前面的轮次后，此轮次将自动开始
            </p>
          </div>
        )}

        {/* 四宫格编辑界面 */}
        {currentRound?.status !== "not-started" && (
          <div className="three-months-details__grid">
            {/* PLAN */}
            <div className="three-months-details__cell three-months-details__cell--plan">
              <div className="three-months-details__cell-header">
                <MaterialIcon name="edit_note" />
                <h3>PLAN（计划）</h3>
              </div>
              <div className="three-months-details__cell-content">
                <div className="three-months-details__image-upload">
                  {localRound.planImage ? (
                    <div className="three-months-details__image-preview">
                      <img src={localRound.planImage} alt="PLAN" />
                      <button
                        type="button"
                        className="three-months-details__image-remove"
                        onClick={() => updateLocalRound({ planImage: null })}
                        aria-label="删除图片"
                      >
                        <MaterialIcon name="close" />
                      </button>
                    </div>
                  ) : (
                    <label className="three-months-details__image-upload-button">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handlePlanImageUpload}
                        style={{ display: "none" }}
                      />
                      <MaterialIcon name="add_photo_alternate" />
                      <span>上传图片</span>
                    </label>
                  )}
                </div>
                <textarea
                  className="three-months-details__text-input"
                  placeholder="计划说明（可选）"
                  value={localRound.planText ?? ""}
                  onChange={(e) => updateLocalRound({ planText: e.target.value })}
                  rows={4}
                />
              </div>
            </div>

            {/* DO */}
            <div className="three-months-details__cell three-months-details__cell--do">
              <div className="three-months-details__cell-header">
                <MaterialIcon name="brush" />
                <h3>DO（执行）</h3>
              </div>
              <div className="three-months-details__cell-content">
                <div className="three-months-details__image-upload">
                  {getDoImageUrl() ? (
                    <div className="three-months-details__image-preview">
                      <img src={getDoImageUrl()!} alt="DO" />
                      <button
                        type="button"
                        className="three-months-details__image-remove"
                        onClick={() => updateLocalRound({ doImageId: null })}
                        aria-label="删除图片"
                      >
                        <MaterialIcon name="close" />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="three-months-details__image-upload-button"
                      onClick={() => setShowArtworkSelector(true)}
                    >
                      <MaterialIcon name="image" />
                      <span>从画集选择</span>
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* CHECK */}
            <div className="three-months-details__cell three-months-details__cell--check">
              <div className="three-months-details__cell-header">
                <MaterialIcon name="search" />
                <h3>CHECK（检查）</h3>
                <span className="three-months-details__required">必填</span>
              </div>
              <div className="three-months-details__cell-content">
                <textarea
                  className="three-months-details__text-input"
                  placeholder="对比两张图之间的差异，哪些对了哪些错了"
                  value={localRound.checkText ?? ""}
                  onChange={(e) => updateLocalRound({ checkText: e.target.value })}
                  rows={6}
                  required
                />
              </div>
            </div>

            {/* ACTION */}
            <div className="three-months-details__cell three-months-details__cell--action">
              <div className="three-months-details__cell-header">
                <MaterialIcon name="trending_up" />
                <h3>ACTION（改进）</h3>
                <span className="three-months-details__required">必填</span>
              </div>
              <div className="three-months-details__cell-content">
                <textarea
                  className="three-months-details__text-input"
                  placeholder="改进，肯定成功经验和失败教训，找出未解决的问题"
                  value={localRound.actionText ?? ""}
                  onChange={(e) => updateLocalRound({ actionText: e.target.value })}
                  rows={6}
                  required
                />
              </div>
            </div>
          </div>
        )}

        {/* 完成本轮按钮 */}
        {currentRound?.status === "in-progress" && (
          <div className="three-months-details__footer">
            <button
              type="button"
              className="three-months-details__complete-button"
              onClick={() => setShowCompleteModal(true)}
              disabled={!canCompleteRound() || isSaving}
            >
              {isSaving ? "保存中..." : "完成本轮练习"}
            </button>
          </div>
        )}

        {/* 保存状态提示 */}
        {isSaving && (
          <div className="three-months-details__save-status">
            <MaterialIcon name="save" />
            <span>正在保存...</span>
          </div>
        )}
      </main>

      {/* 画集选择器 */}
      {showArtworkSelector && timeRange() && (
        <ArtworkSelector
          startDate={timeRange()!.startDate}
          endDate={timeRange()!.endDate}
          onSelect={handleDoImageSelect}
          onClose={() => setShowArtworkSelector(false)}
        />
      )}

      {/* 完成本轮确认弹窗 */}
      {showCompleteModal && currentRound && (
        <RoundCompleteModal
          planImage={localRound.planImage}
          doImageUrl={getDoImageUrl()}
          checkText={localRound.checkText}
          actionText={localRound.actionText}
          onConfirm={handleCompleteRound}
          onCancel={() => setShowCompleteModal(false)}
        />
      )}
    </div>
  );
}

export default ThreeMonthsDetails;

