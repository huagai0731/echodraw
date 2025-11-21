import { useMemo, useState, useEffect, type CSSProperties } from "react";

import MaterialIcon from "@/components/MaterialIcon";
import TopNav from "@/components/TopNav";
import type { LongTermGoal, LongTermGoalCheckpoint } from "@/services/api";
import type { Artwork } from "@/types/artwork";
import { loadStoredArtworks, USER_ARTWORKS_CHANGED_EVENT } from "@/services/artworkStorage";
import { replaceLocalhostInUrl } from "@/utils/urlUtils";

import "./LongTermGoalDetails.css";

type LongTermGoalDetailsProps = {
  goal: LongTermGoal;
  onClose: () => void;
  onEdit?: () => void;
  onExport?: () => void;
  onSelectShowcase?: (checkpoint: LongTermGoalCheckpoint, artworkId?: number) => void;
  onEditCompletionNote?: (checkpoint: LongTermGoalCheckpoint) => void;
  onAddMessage?: (checkpoint: LongTermGoalCheckpoint, message: string) => void;
};

function LongTermGoalDetails({
  goal,
  onClose,
  onEdit,
  onExport,
  onSelectShowcase,
  onEditCompletionNote,
  onAddMessage,
}: LongTermGoalDetailsProps) {
  const [selectedCheckpoint, setSelectedCheckpoint] = useState<LongTermGoalCheckpoint | null>(null);
  const [showArtworkModal, setShowArtworkModal] = useState(false);
  const [showImageViewer, setShowImageViewer] = useState(false);
  const [viewingImage, setViewingImage] = useState<string | null>(null);
  const [showMessageModal, setShowMessageModal] = useState(false);
  const [messageCheckpoint, setMessageCheckpoint] = useState<LongTermGoalCheckpoint | null>(null);

  // 计算进度轴应该到达的位置：到达当前进行中的checkpoint的圆圈
  const timelineProgressPercent = useMemo(() => {
    const checkpoints = goal.checkpoints ?? [];
    if (checkpoints.length === 0) return 0;
    
    // 找到当前进行中的checkpoint索引
    const currentIndex = checkpoints.findIndex(cp => cp.status === "current");
    
    if (currentIndex === -1) {
      // 如果没有进行中的，找到最后一个已完成的
      let lastCompletedIndex = -1;
      for (let i = checkpoints.length - 1; i >= 0; i--) {
        if (checkpoints[i].status === "completed") {
          lastCompletedIndex = i;
          break;
        }
      }
      if (lastCompletedIndex === -1) return 0;
      // 进度到达最后一个已完成的checkpoint的圆圈位置
      // 每个checkpoint占据 1/n 的空间，圆圈在checkpoint的顶部
      return clampPercent(((lastCompletedIndex + 1) / checkpoints.length) * 100);
    }
    
    // 进度到达当前进行中的checkpoint的圆圈位置
    // 每个checkpoint占据 1/n 的空间，圆圈在checkpoint的顶部
    return clampPercent(((currentIndex + 1) / checkpoints.length) * 100);
  }, [goal.checkpoints]);
  
  const timelineStyle = useMemo(() => {
    return {
      "--timeline-progress": `${timelineProgressPercent}%`,
    } as CSSProperties;
  }, [timelineProgressPercent]);

  const checkpointHours =
    goal.checkpointCount > 0 ? goal.targetHours / goal.checkpointCount : goal.targetHours;
  const checkpoints = goal.checkpoints ?? [];
  const fallbackDescription = `累计投入 ${formatHours(goal.progress?.spentHours ?? 0)} 小时，目标为 ${
    goal.targetHours
  } 小时，共 ${goal.checkpointCount} 个检查点。`;

  // 计算启动日期和历经天数
  const startDate = goal.startedAt ? parseDate(goal.startedAt) : null;
  const startDateLabel = startDate
    ? `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, "0")}-${String(startDate.getDate()).padStart(2, "0")}`
    : "未记录";
  const durationDays = startDate
    ? calculateDurationDays(goal.startedAt, new Date().toISOString())
    : null;

  const handleSelectShowcase = (checkpoint: LongTermGoalCheckpoint) => {
    setSelectedCheckpoint(checkpoint);
    setShowArtworkModal(true);
  };

  const handleViewImage = (imageUrl: string) => {
    setViewingImage(replaceLocalhostInUrl(imageUrl));
    setShowImageViewer(true);
  };

  const handleCloseArtworkModal = () => {
    setShowArtworkModal(false);
    setSelectedCheckpoint(null);
  };

  const handleCloseImageViewer = () => {
    setShowImageViewer(false);
    setViewingImage(null);
  };

  const handleOpenMessageModal = (checkpoint: LongTermGoalCheckpoint) => {
    setMessageCheckpoint(checkpoint);
    setShowMessageModal(true);
  };

  const handleCloseMessageModal = () => {
    setShowMessageModal(false);
    setMessageCheckpoint(null);
  };

  return (
    <div className="long-term-details">
      <div className="long-term-details__background">
        <div className="long-term-details__glow long-term-details__glow--mint" />
        <div className="long-term-details__glow long-term-details__glow--brown" />
        <div className="long-term-details__glow long-term-details__glow--highlight" />
      </div>

      <div className="long-term-details__shell">
        <TopNav
          title="长期计划"
          subtitle="Long-term Plan"
          className="top-nav--fixed top-nav--flush"
          leadingAction={{
            icon: "arrow_back",
            label: "返回",
            onClick: onClose,
          }}
          trailingActions={[
            ...(onEdit
              ? [
                  {
                    icon: "edit",
                    label: "调整",
                    onClick: onEdit,
                  },
                ]
              : []),
            ...(onExport
              ? [
                  {
                    icon: "ios_share",
                    label: "导出",
                    onClick: onExport,
                  },
                ]
              : []),
          ]}
        />

        <section className="long-term-details__intro">
          <h1 className="long-term-details__title">{goal.title}</h1>
          <p className="long-term-details__start-info">
            启动于{startDateLabel}，目前历经{durationDays != null ? `${durationDays}` : "—"}天
          </p>
          <p className="long-term-details__description">
            {goal.description?.trim() || fallbackDescription}
          </p>
        </section>

        <main className="long-term-details__main">
          <div className="timeline" style={timelineStyle}>
            <div className="timeline-line" aria-hidden="true" />
            {checkpoints.map((checkpoint, index) => {
              const previousCheckpoint = index > 0 ? checkpoints[index - 1] : null;
              const stageStartedAt = previousCheckpoint?.reachedAt ?? goal.startedAt;
              return (
                <div className="timeline-item" key={checkpoint.index}>
                  <div className="timeline-item__header">
                    <span className={`timeline-dot timeline-dot--${checkpoint.status}`}>
                      <TimelineDotContent status={checkpoint.status} />
                    </span>
                    <p className="timeline-status">
                      {checkpoint.status === "completed" ? (
                        <span className="timeline-status__completed">
                          <span className="timeline-status__hours">
                            {formatHours(checkpoint.thresholdMinutes / 60)}h
                          </span>
                          <span className="timeline-status__separator"> - </span>
                          <span className="timeline-status__date">
                            达成于{formatDateLabel(checkpoint.reachedAt)}
                          </span>
                        </span>
                      ) : checkpoint.status === "current" ? (
                        "进行中"
                      ) : (
                        "即将开始"
                      )}
                    </p>
                  </div>

                  <CheckpointCard
                    checkpoint={checkpoint}
                    checkpointHours={checkpointHours}
                    spentMinutes={goal.progress?.spentMinutes ?? 0}
                    stageStartedAt={stageStartedAt}
                    onSelectShowcase={handleSelectShowcase}
                    onEditCompletionNote={onEditCompletionNote}
                    onAddMessage={handleOpenMessageModal}
                    onViewImage={handleViewImage}
                  />
                </div>
              );
            })}
          </div>
        </main>
      </div>

      {showArtworkModal && selectedCheckpoint && (
        <ArtworkSelectionModal
          checkpoint={selectedCheckpoint}
          goal={goal}
          onClose={handleCloseArtworkModal}
          onSelect={(artwork) => {
            if (selectedCheckpoint) {
              // 从 "art-{id}" 格式中提取数字ID
              const numericId = artwork.id.replace(/^art-/, "");
              const uploadId = Number.parseInt(numericId, 10);
              if (Number.isFinite(uploadId) && uploadId > 0) {
                onSelectShowcase?.(selectedCheckpoint, uploadId);
              }
            }
            handleCloseArtworkModal();
          }}
        />
      )}

      {showImageViewer && viewingImage && (
        <ImageViewerModal imageUrl={viewingImage} onClose={handleCloseImageViewer} />
      )}

      {showMessageModal && messageCheckpoint && (
        <MessageEditModal
          checkpoint={messageCheckpoint}
          onClose={handleCloseMessageModal}
          onSave={(message) => {
            onAddMessage?.(messageCheckpoint, message);
            handleCloseMessageModal();
          }}
        />
      )}
    </div>
  );
}

type TimelineDotContentProps = {
  status: LongTermGoalCheckpoint["status"];
};

function TimelineDotContent({ status }: TimelineDotContentProps) {
  if (status === "completed") {
    return <MaterialIcon name="check" />;
  }
  if (status === "current") {
    return (
      <>
        <span className="timeline-dot__ring" />
        <span className="timeline-dot__core" />
      </>
    );
  }
  return <span className="timeline-dot__placeholder" />;
}

type CheckpointCardProps = {
  checkpoint: LongTermGoalCheckpoint;
  checkpointHours: number;
  spentMinutes: number;
  stageStartedAt: string | null | undefined;
  onSelectShowcase?: (checkpoint: LongTermGoalCheckpoint) => void;
  onEditCompletionNote?: (checkpoint: LongTermGoalCheckpoint) => void;
  onAddMessage?: (checkpoint: LongTermGoalCheckpoint) => void;
  onViewImage?: (imageUrl: string) => void;
};

function CheckpointCard({
  checkpoint,
  checkpointHours,
  spentMinutes,
  stageStartedAt,
  onSelectShowcase,
  onEditCompletionNote: _onEditCompletionNote,
  onAddMessage,
  onViewImage,
}: CheckpointCardProps) {
  const thresholdHours = checkpoint.thresholdMinutes / 60;
  const progressPercent =
    checkpoint.status === "current" && checkpoint.thresholdMinutes > 0
      ? clampPercent((spentMinutes / checkpoint.thresholdMinutes) * 100)
      : 0;
  const stageDurationDays =
    checkpoint.status === "completed"
      ? calculateDurationDays(stageStartedAt, checkpoint.reachedAt)
      : null;

  if (checkpoint.status === "completed") {
    return (
      <div className="timeline-card timeline-card--current">
        <div className="timeline-card__header">
          <p className="timeline-card__title">{checkpoint.label}</p>
          <span className="timeline-card__meta">
            历经 {formatDays(stageDurationDays)} 天
          </span>
        </div>
        <div className="timeline-card__progress timeline-card__progress--completed">
          <span className="timeline-card__progress-fill" style={{ width: "100%" }}>
            <span className="timeline-card__progress-text">100%</span>
          </span>
        </div>
        {checkpoint.upload?.image ? (
          <div className="timeline-card__showcase-completed">
            <button
              type="button"
              className="timeline-card__showcase-image-wrapper"
              onClick={() => checkpoint.upload?.image && onViewImage?.(replaceLocalhostInUrl(checkpoint.upload.image!))}
              aria-label="查看大图"
            >
              <img
                src={replaceLocalhostInUrl(checkpoint.upload.image)}
                alt={checkpoint.upload.title || "创作记录"}
                className="timeline-card__showcase-image"
              />
            </button>
            <div className="timeline-card__showcase-content">
              {checkpoint.completionNote ? (
                <p className="timeline-card__message-text">{checkpoint.completionNote}</p>
              ) : null}
              <div className="timeline-card__showcase-actions">
                {onSelectShowcase && (
                  <button
                    type="button"
                    className="timeline-card__action-btn"
                    onClick={() => onSelectShowcase(checkpoint)}
                    aria-label="更换代表作"
                  >
                    <MaterialIcon name="edit" />
                  </button>
                )}
                {onAddMessage && (
                  <button
                    type="button"
                    className="timeline-card__action-btn"
                    onClick={() => onAddMessage(checkpoint)}
                    aria-label="留下想说的话"
                  >
                    <MaterialIcon name="chat_bubble_outline" />
                  </button>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="timeline-card__showcase-completed">
            <button
              type="button"
              className="timeline-card__showcase-trigger timeline-card__showcase-trigger--empty"
              onClick={() => onSelectShowcase?.(checkpoint)}
              disabled={!onSelectShowcase}
              aria-label="选择代表作"
            >
              <div className="timeline-card__showcase-placeholder" aria-hidden="true">
                <MaterialIcon name="add_photo_alternate" />
              </div>
              <div className="timeline-card__showcase-copy">
                <p className="timeline-card__showcase-title">选择代表作</p>
                <span className="timeline-card__showcase-hint">
                  {onSelectShowcase
                    ? "仅显示本阶段已上传的作品"
                    : "暂无可选作品"}
                </span>
              </div>
            </button>
            {onAddMessage && (
              <button
                type="button"
                className="timeline-card__action-btn"
                onClick={() => handleOpenMessageModal(checkpoint)}
                aria-label="留下想说的话"
              >
                <MaterialIcon name="chat_bubble_outline" />
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  if (checkpoint.status === "current") {
    return (
      <div className="timeline-card timeline-card--current">
        <div className="timeline-card__header">
          <p className="timeline-card__title">{checkpoint.label}</p>
          <span className="timeline-card__meta">目标 {formatHours(thresholdHours)} 小时</span>
        </div>
        <p className="timeline-card__subtitle">
          当前累计 {formatHours(spentMinutes / 60)} 小时，还需{" "}
          {formatHours(Math.max(thresholdHours - spentMinutes / 60, 0))} 小时
        </p>
        <div className="timeline-card__progress">
          <span className="timeline-card__progress-fill" style={{ width: `${progressPercent}%` }} />
        </div>
      </div>
    );
  }

  return (
    <div className="timeline-card timeline-card--upcoming">
      <p className="timeline-card__title">{checkpoint.label}</p>
      <p className="timeline-card__subtitle">
        目标累计 {formatHours(thresholdHours)} 小时（每阶段约 {formatHours(checkpointHours)} 小时）
      </p>
      <p className="timeline-card__placeholder">未来，无限可能。</p>
    </div>
  );
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(Math.max(Math.round(value), 0), 100);
}

function formatHours(value: number): string {
  if (!Number.isFinite(value)) {
    return "0";
  }
  const rounded = Math.round(value * 10) / 10;
  if (Number.isInteger(rounded)) {
    return String(Math.trunc(rounded));
  }
  return rounded.toFixed(1);
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars, no-unused-vars
export function formatMinutes(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) {
    return "0 分钟";
  }
  return `${value} 分钟`;
}

function formatDateLabel(iso: string | null | undefined): string {
  if (!iso) {
    return "未记录";
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return date.toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function parseDate(iso: string | null | undefined): Date | null {
  if (!iso) {
    return null;
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date;
}

function calculateDurationDays(
  startIso: string | null | undefined,
  endIso: string | null | undefined,
): number | null {
  const end = parseDate(endIso);
  if (!end) {
    return null;
  }
  const start = parseDate(startIso) ?? end;
  const diffMs = end.getTime() - start.getTime();
  const dayMs = 1000 * 60 * 60 * 24;
  if (diffMs <= 0) {
    return 1;
  }
  return Math.max(1, Math.ceil(diffMs / dayMs));
}

function formatDays(value: number | null): string {
  if (value == null || !Number.isFinite(value)) {
    return "—";
  }
  return String(value);
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars, no-unused-vars
export function formatCompletionFallback(
  reachedAt: string | null | undefined,
  thresholdHours: number,
): string {
  const dateLabel = formatDateLabel(reachedAt);
  const targetLabel = Number.isFinite(thresholdHours)
    ? `目标 ${formatHours(thresholdHours)} 小时`
    : "";
  if (!reachedAt) {
    return targetLabel ? `完成时间未记录（${targetLabel}）` : "完成时间未记录";
  }
  return targetLabel ? `完成于 ${dateLabel}（${targetLabel}）` : `完成于 ${dateLabel}`;
}

type ArtworkSelectionModalProps = {
  checkpoint: LongTermGoalCheckpoint;
  goal: LongTermGoal;
  onClose: () => void;
  onSelect: (artwork: Artwork) => void;
};

function ArtworkSelectionModal({
  checkpoint,
  goal,
  onClose,
  onSelect,
}: ArtworkSelectionModalProps) {
  const [allArtworks, setAllArtworks] = useState<Artwork[]>(() => loadStoredArtworks());
  
  // 监听画作数据变化
  useEffect(() => {
    const handleArtworksChange = () => {
      setAllArtworks(loadStoredArtworks());
    };
    
    window.addEventListener(USER_ARTWORKS_CHANGED_EVENT, handleArtworksChange);
    return () => {
      window.removeEventListener(USER_ARTWORKS_CHANGED_EVENT, handleArtworksChange);
    };
  }, []);
  
  // 计算checkpoint的时间范围
  const checkpointIndex = checkpoint.index;
  const checkpoints = goal.checkpoints ?? [];
  const previousCheckpoint = checkpointIndex > 1 
    ? checkpoints.find(cp => cp.index === checkpointIndex - 1)
    : null;
  
  const startDate = previousCheckpoint?.reachedAt 
    ? new Date(previousCheckpoint.reachedAt)
    : new Date(goal.startedAt);
  const endDate = checkpoint.reachedAt 
    ? new Date(checkpoint.reachedAt)
    : new Date();

  // 筛选在checkpoint时间段内的画作
  const filteredArtworks = useMemo(() => {
    return allArtworks.filter((artwork) => {
      const artworkDate = artwork.uploadedAt 
        ? new Date(artwork.uploadedAt)
        : artwork.uploadedDate
        ? new Date(`${artwork.uploadedDate}T00:00:00Z`)
        : null;
      
      if (!artworkDate) return false;
      
      return artworkDate >= startDate && artworkDate <= endDate;
    });
  }, [allArtworks, startDate, endDate]);

  return (
    <div className="artwork-selection-modal" onClick={onClose}>
      <div className="artwork-selection-modal__content" onClick={(e) => e.stopPropagation()}>
        <div className="artwork-selection-modal__header">
          <div className="artwork-selection-modal__header-content">
            <h3 className="artwork-selection-modal__title">选择代表作</h3>
            <p className="artwork-selection-modal__subtitle">请选择该阶段你最喜欢的作品</p>
          </div>
          <button
            type="button"
            className="artwork-selection-modal__close"
            onClick={onClose}
            aria-label="关闭"
          >
            <MaterialIcon name="close" />
          </button>
        </div>
        <div className="artwork-selection-modal__body">
          {filteredArtworks.length === 0 ? (
            <div className="artwork-selection-modal__empty">
              <MaterialIcon name="image_not_supported" />
              <p>该时间段内没有上传的画作</p>
            </div>
          ) : (
            <div className="artwork-selection-modal__grid">
              {filteredArtworks.map((artwork) => (
                <button
                  key={artwork.id}
                  type="button"
                  className="artwork-selection-modal__item"
                  onClick={() => onSelect(artwork)}
                >
                  <img
                    src={artwork.imageSrc}
                    alt={artwork.title}
                    className="artwork-selection-modal__item-image"
                  />
                  <p className="artwork-selection-modal__item-title">{artwork.title}</p>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

type ImageViewerModalProps = {
  imageUrl: string;
  onClose: () => void;
};

function ImageViewerModal({ imageUrl, onClose }: ImageViewerModalProps) {
  return (
    <div className="image-viewer-modal" onClick={onClose}>
      <button
        type="button"
        className="image-viewer-modal__close"
        onClick={onClose}
        aria-label="关闭"
      >
        <MaterialIcon name="close" />
      </button>
      <img
        src={imageUrl}
        alt="查看大图"
        className="image-viewer-modal__image"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}

type MessageEditModalProps = {
  checkpoint: LongTermGoalCheckpoint;
  onClose: () => void;
  onSave: (message: string) => void;
};

function MessageEditModal({ checkpoint, onClose, onSave }: MessageEditModalProps) {
  const [message, setMessage] = useState(checkpoint.completionNote || "");
  const MAX_LENGTH = 500;
  const remainingChars = MAX_LENGTH - message.length;

  const handleMessageChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    // 允许删除，但限制最多500字
    if (newValue.length <= MAX_LENGTH) {
      setMessage(newValue);
    } else if (newValue.length < message.length) {
      // 如果新值比旧值短（删除操作），允许更新
      setMessage(newValue);
    }
    // 如果新值比旧值长且超过限制，不更新（阻止输入）
  };

  const handleSave = () => {
    onSave(message);
  };

  return (
    <div className="message-edit-modal" onClick={onClose}>
      <div className="message-edit-modal__content" onClick={(e) => e.stopPropagation()}>
        <div className="message-edit-modal__header">
          <h3 className="message-edit-modal__title">留下想记录的话</h3>
          <button
            type="button"
            className="message-edit-modal__close"
            onClick={onClose}
            aria-label="关闭"
          >
            <MaterialIcon name="close" />
          </button>
        </div>
        <div className="message-edit-modal__body">
          <textarea
            className="message-edit-modal__textarea"
            value={message}
            onChange={handleMessageChange}
            placeholder="对这张图的感受，这段时间的感悟，或是随便什么，想留给未来的自己记录的话…"
            rows={8}
            maxLength={MAX_LENGTH}
          />
          <div className="message-edit-modal__char-count">
            <span className={remainingChars < 0 ? "message-edit-modal__char-count--warning" : ""}>
              {message.length} / {MAX_LENGTH}
            </span>
          </div>
        </div>
        <div className="message-edit-modal__footer">
          <button
            type="button"
            className="message-edit-modal__cancel"
            onClick={onClose}
          >
            取消
          </button>
          <button
            type="button"
            className="message-edit-modal__save"
            onClick={handleSave}
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
}

export default LongTermGoalDetails;
