import { useMemo, useState, useEffect, type CSSProperties } from "react";

import MaterialIcon from "@/components/MaterialIcon";
import type { LongTermGoal, LongTermGoalCheckpoint } from "@/services/api";
import type { Artwork } from "@/types/artwork";
import { loadStoredArtworks, USER_ARTWORKS_CHANGED_EVENT } from "@/services/artworkStorage";

import "./LongTermGoalDetails.css";

type LongTermGoalDetailsProps = {
  goal: LongTermGoal;
  onClose: () => void;
  onEdit?: () => void;
  onExport?: () => void;
  onSelectShowcase?: (checkpoint: LongTermGoalCheckpoint) => void;
  onEditCompletionNote?: (checkpoint: LongTermGoalCheckpoint) => void;
};

function LongTermGoalDetails({
  goal,
  onClose,
  onEdit,
  onExport,
  onSelectShowcase,
  onEditCompletionNote,
}: LongTermGoalDetailsProps) {
  const [selectedCheckpoint, setSelectedCheckpoint] = useState<LongTermGoalCheckpoint | null>(null);
  const [showArtworkModal, setShowArtworkModal] = useState(false);
  const [showImageViewer, setShowImageViewer] = useState(false);
  const [viewingImage, setViewingImage] = useState<string | null>(null);

  const progressPercent = clampPercent(goal.progress.progressRatio * 100);
  const timelineStyle = useMemo(() => {
    return {
      "--timeline-progress": `${progressPercent}%`,
    } as CSSProperties;
  }, [progressPercent]);

  const checkpointHours =
    goal.checkpointCount > 0 ? goal.targetHours / goal.checkpointCount : goal.targetHours;
  const checkpoints = goal.checkpoints ?? [];
  const fallbackDescription = `累计投入 ${formatHours(goal.progress.spentHours)} 小时，目标为 ${
    goal.targetHours
  } 小时，共 ${goal.checkpointCount} 个检查点。`;

  const handleSelectShowcase = (checkpoint: LongTermGoalCheckpoint) => {
    setSelectedCheckpoint(checkpoint);
    setShowArtworkModal(true);
  };

  const handleViewImage = (imageUrl: string) => {
    setViewingImage(imageUrl);
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

  return (
    <div className="long-term-details">
      <div className="long-term-details__background">
        <div className="long-term-details__glow long-term-details__glow--mint" />
        <div className="long-term-details__glow long-term-details__glow--brown" />
        <div className="long-term-details__glow long-term-details__glow--highlight" />
      </div>

      <div className="long-term-details__shell">
        <header className="long-term-details__header">
          <button
            type="button"
            className="long-term-details__nav-button"
            onClick={onClose}
            aria-label="返回目标页面"
          >
            <MaterialIcon name="arrow_back" />
          </button>

          <div className="long-term-details__action-group">
            <button
              type="button"
              className="long-term-details__action long-term-details__action--primary"
              onClick={() => onExport?.()}
            >
              <MaterialIcon name="ios_share" />
              导出
            </button>
            <button
              type="button"
              className="long-term-details__action"
              onClick={onEdit}
              disabled={!onEdit}
            >
              <MaterialIcon name="tune" />
              调整
            </button>
          </div>
        </header>

        <section className="long-term-details__intro">
          <h1 className="long-term-details__title">{goal.title}</h1>
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
                      {checkpoint.status === "completed"
                        ? formatDateLabel(checkpoint.reachedAt)
                        : checkpoint.status === "current"
                        ? "进行中"
                        : "即将开始"}
                    </p>
                  </div>

                  <CheckpointCard
                    checkpoint={checkpoint}
                    checkpointHours={checkpointHours}
                    spentMinutes={goal.progress.spentMinutes}
                    stageStartedAt={stageStartedAt}
                    onSelectShowcase={handleSelectShowcase}
                    onEditCompletionNote={onEditCompletionNote}
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
            onSelectShowcase?.(selectedCheckpoint);
            handleCloseArtworkModal();
          }}
        />
      )}

      {showImageViewer && viewingImage && (
        <ImageViewerModal imageUrl={viewingImage} onClose={handleCloseImageViewer} />
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
  onViewImage?: (imageUrl: string) => void;
};

function CheckpointCard({
  checkpoint,
  checkpointHours,
  spentMinutes,
  stageStartedAt,
  onSelectShowcase,
  onEditCompletionNote,
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
  const completionNote = checkpoint.completionNote?.trim();

  if (checkpoint.status === "completed") {
    return (
      <div className="ticket-card timeline-card timeline-card--completed">
        <div className="timeline-card__header">
          <p className="timeline-card__title">{checkpoint.label}</p>
          <span className="timeline-card__meta">
            历经 {formatDays(stageDurationDays)} 天完成
          </span>
        </div>
        <button
          type="button"
          className="timeline-card__note-button"
          onClick={() => onEditCompletionNote?.(checkpoint)}
          disabled={!onEditCompletionNote}
        >
          <span className="timeline-card__note-text">
            {completionNote || formatCompletionFallback(checkpoint.reachedAt, thresholdHours)}
          </span>
          {onEditCompletionNote ? <MaterialIcon name="edit" /> : null}
        </button>
        <div className="timeline-card__showcase">
          {checkpoint.upload?.image ? (
            <div className="timeline-card__showcase-container">
              <button
                type="button"
                className="timeline-card__showcase-image-wrapper"
                onClick={() => checkpoint.upload?.image && onViewImage?.(checkpoint.upload.image!)}
                aria-label="查看大图"
              >
                <img
                  src={checkpoint.upload.image}
                  alt={checkpoint.upload.title || "创作记录"}
                  className="timeline-card__showcase-image"
                />
              </button>
              <div className="timeline-card__showcase-info">
                <p className="timeline-card__showcase-title">
                  {checkpoint.upload.title || `第 ${checkpoint.index} 次创作`}
                </p>
                {onSelectShowcase && (
                  <button
                    type="button"
                    className="timeline-card__showcase-change-btn"
                    onClick={() => onSelectShowcase(checkpoint)}
                    aria-label="更换代表作"
                  >
                    <MaterialIcon name="edit" />
                    <span>更换图片</span>
                  </button>
                )}
              </div>
            </div>
          ) : (
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
          )}
        </div>
        {checkpoint.upload?.description ? (
          <p className="timeline-card__note-description">{checkpoint.upload.description}</p>
        ) : checkpoint.upload?.durationMinutes ? (
          <p className="timeline-card__note-description">
            本次创作用时 {formatMinutes(checkpoint.upload.durationMinutes)}。
          </p>
        ) : (
          <p className="timeline-card__placeholder">尚未填写创作说明。</p>
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
      <p className="timeline-card__placeholder">保持节奏，完成前一阶段后自动解锁这里的内容。</p>
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

function formatMinutes(value: number | null | undefined): string {
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

function formatCompletionFallback(
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
          <h3 className="artwork-selection-modal__title">选择代表作</h3>
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

export default LongTermGoalDetails;


