import { useMemo, useState, useEffect, useRef, useCallback, type CSSProperties } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";

import MaterialIcon from "@/components/MaterialIcon";
import TopNav from "@/components/TopNav";
import type { LongTermGoal, LongTermGoalCheckpoint } from "@/services/api";
import type { Artwork } from "@/types/artwork";
import { loadStoredArtworks, USER_ARTWORKS_CHANGED_EVENT } from "@/services/artworkStorage";
import type { Artwork } from "@/types/artwork";
import { replaceLocalhostInUrl } from "@/utils/urlUtils";
import html2canvas from "html2canvas";

import "./LongTermGoalDetails.css";

type LongTermGoalDetailsProps = {
  goal: LongTermGoal;
  onClose: () => void;
  onEdit?: () => void;
  onExport?: () => void;
  onSelectShowcase?: (checkpoint: LongTermGoalCheckpoint, artworkId?: number) => void;
  onEditCompletionNote?: (checkpoint: LongTermGoalCheckpoint) => void;
  onAddMessage?: (checkpoint: LongTermGoalCheckpoint, message: string) => void;
  onComplete?: (goal: LongTermGoal) => void;
};

function LongTermGoalDetails({
  goal,
  onClose,
  onEdit,
  onExport,
  onSelectShowcase,
  onEditCompletionNote,
  onAddMessage,
  onComplete,
}: LongTermGoalDetailsProps) {
  const [selectedCheckpoint, setSelectedCheckpoint] = useState<LongTermGoalCheckpoint | null>(null);
  const [showArtworkModal, setShowArtworkModal] = useState(false);
  const [showImageViewer, setShowImageViewer] = useState(false);
  const [viewingImage, setViewingImage] = useState<string | null>(null);
  const [showMessageModal, setShowMessageModal] = useState(false);
  const [messageCheckpoint, setMessageCheckpoint] = useState<LongTermGoalCheckpoint | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editCheckpoint, setEditCheckpoint] = useState<LongTermGoalCheckpoint | null>(null);
  const [showViewer, setShowViewer] = useState(false);
  const [viewingCheckpointIndex, setViewingCheckpointIndex] = useState<number | null>(null);
  const [showDownloadModal, setShowDownloadModal] = useState(false);
  const [downloadImageUrl, setDownloadImageUrl] = useState<string | null>(null);
  const [showCompleteButton, setShowCompleteButton] = useState(false);
  const [showNineGridModal, setShowNineGridModal] = useState(false);
  const [nineGridImageUrl, setNineGridImageUrl] = useState<string | null>(null);
  const lastCheckpointRef = useRef<HTMLDivElement | null>(null);
  
  // 跟踪已完成的检查点的折叠状态，默认全部折叠
  const [collapsedCheckpoints, setCollapsedCheckpoints] = useState<Set<number>>(() => {
    const checkpoints = goal.checkpoints ?? [];
    const completedIndices = checkpoints
      .filter(cp => cp.status === "completed")
      .map(cp => cp.index);
    return new Set(completedIndices);
  });

  // 当 goal 变化时，更新折叠状态
  useEffect(() => {
    const checkpoints = goal.checkpoints ?? [];
    const completedIndices = checkpoints
      .filter(cp => cp.status === "completed")
      .map(cp => cp.index);
    setCollapsedCheckpoints(new Set(completedIndices));
    
    // 检查是否所有检查点都已完成
    const allCompleted = checkpoints.length > 0 && checkpoints.every(cp => cp.status === "completed");
    setShowCompleteButton(allCompleted);
  }, [goal.checkpoints]);

  // 自动滚动到最后一个检查点（如果goal有_scrollToLastCheckpoint标志）
  useEffect(() => {
    if ((goal as any)._scrollToLastCheckpoint && lastCheckpointRef.current) {
      setTimeout(() => {
        lastCheckpointRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        // 自动展开最后一个检查点
        const checkpoints = goal.checkpoints ?? [];
        if (checkpoints.length > 0) {
          const lastCheckpoint = checkpoints[checkpoints.length - 1];
          if (lastCheckpoint) {
            setCollapsedCheckpoints((prev) => {
              const next = new Set(prev);
              // 如果最后一个检查点是折叠的，则展开它
              if (next.has(lastCheckpoint.index)) {
                next.delete(lastCheckpoint.index);
              }
              return next;
            });
          }
        }
        // 清除标志
        delete (goal as any)._scrollToLastCheckpoint;
      }, 300);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goal]);

  // 切换检查点的折叠状态
  const toggleCheckpointCollapse = useCallback((checkpointIndex: number) => {
    setCollapsedCheckpoints((prev) => {
      const next = new Set(prev);
      if (next.has(checkpointIndex)) {
        next.delete(checkpointIndex);
      } else {
        next.add(checkpointIndex);
      }
      return next;
    });
  }, []);

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
    goal.checkpointCount && goal.checkpointCount > 0 
      ? (goal.targetHours ?? 0) / goal.checkpointCount 
      : (goal.targetHours ?? 0);
  const checkpoints = goal.checkpoints ?? [];
  const targetHours = goal.targetHours ?? 0;
  const checkpointCount = goal.checkpointCount ?? 0;
  const fallbackDescription = `累计投入 ${formatHours(goal.progress?.spentHours ?? 0)} 小时，目标为 ${
    targetHours
  } 小时，共 ${checkpointCount} 个检查点。`;

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

  const handleDownloadCheckpoint = async (_checkpoint: LongTermGoalCheckpoint, element: HTMLElement) => {
    try {
      // 使用 html2canvas 将卡片转换为图片，添加背景色避免透明通道问题
      const canvas = await html2canvas(element, {
        backgroundColor: '#2b242a',
        scale: 2,
        useCORS: true,
        logging: false,
        width: element.offsetWidth,
        height: element.offsetHeight,
      });

      // 创建图片 URL
      const dataUrl = canvas.toDataURL('image/png');
      setDownloadImageUrl(dataUrl);
      setShowDownloadModal(true);
    } catch (error) {
      console.error('生成图片失败:', error);
    }
  };

  const handleCloseDownloadModal = () => {
    setShowDownloadModal(false);
    setDownloadImageUrl(null);
  };

  const handleOpenMessageModal = (checkpoint: LongTermGoalCheckpoint) => {
    setMessageCheckpoint(checkpoint);
    setShowMessageModal(true);
  };

  const handleCloseMessageModal = () => {
    setShowMessageModal(false);
    setMessageCheckpoint(null);
  };

  const handleOpenEditModal = (checkpoint: LongTermGoalCheckpoint) => {
    setEditCheckpoint(checkpoint);
    setShowEditModal(true);
  };

  const handleCloseEditModal = () => {
    setShowEditModal(false);
    setEditCheckpoint(null);
  };

  const handleEditSave = async (artworkId: number | null, message: string) => {
    if (!editCheckpoint) return;
    
    // 先更新图片
    if (artworkId !== null && onSelectShowcase) {
      onSelectShowcase(editCheckpoint, artworkId);
    }
    
    // 再更新留言
    if (onAddMessage) {
      onAddMessage(editCheckpoint, message);
    }
    
    handleCloseEditModal();
  };

  // 生成9图
  const generateNineGridImage = async (goal: LongTermGoal) => {
    const checkpoints = goal.checkpoints ?? [];
    const completedCheckpoints = checkpoints.filter(cp => cp.status === "completed" && cp.upload?.image);
    
    if (completedCheckpoints.length === 0) {
      alert("没有可用的检查点图片");
      return;
    }

    // 获取所有画作，用于查找图片序号
    const allArtworks = loadStoredArtworks();
    // 按上传时间排序，获取序号
    const sortedArtworks = [...allArtworks].sort((a, b) => {
      const dateA = a.uploadedAt ? new Date(a.uploadedAt).getTime() : (a.uploadedDate ? new Date(`${a.uploadedDate}T00:00:00Z`).getTime() : 0);
      const dateB = b.uploadedAt ? new Date(b.uploadedAt).getTime() : (b.uploadedDate ? new Date(`${b.uploadedDate}T00:00:00Z`).getTime() : 0);
      return dateA - dateB;
    });

    // 选择9个检查点的图片（如果检查点数量少于9个，则重复使用）
    const selectedCheckpoints: Array<{
      checkpoint: LongTermGoalCheckpoint;
      imageUrl: string;
      artworkIndex: number;
    }> = [];
    
    for (let i = 0; i < 9; i++) {
      const checkpoint = completedCheckpoints[i % completedCheckpoints.length];
      if (checkpoint.upload?.image && checkpoint.upload?.id) {
        // 查找对应的画作序号
        const artworkIndex = sortedArtworks.findIndex(art => {
          const numericId = art.id.replace(/^art-/, "");
          return Number.parseInt(numericId, 10) === checkpoint.upload.id;
        });
        const displayIndex = artworkIndex >= 0 ? artworkIndex + 1 : 0;
        
        selectedCheckpoints.push({
          checkpoint,
          imageUrl: replaceLocalhostInUrl(checkpoint.upload.image),
          artworkIndex: displayIndex,
        });
      }
    }

    // 创建canvas来合成9图
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      alert("无法创建画布");
      return;
    }

    // 9图布局：3x3网格
    const gridSize = 3;
    const textHeight = 30; // 文字区域高度
    const cellSize = 300; // 每个单元格的大小（图片区域）
    const gap = 4; // 单元格之间的间距（水平）
    const rowGap = textHeight + 4; // 行之间的间距（垂直，用于放置文字，确保有足够空间）
    const totalCellSize = cellSize + textHeight; // 包含文字的总单元格高度
    const totalWidth = gridSize * cellSize + (gridSize - 1) * gap;
    // 总高度 = 3行图片 + 3行文字 + 2个行间距（最后一行后面不需要间距）
    const totalHeight = gridSize * cellSize + gridSize * textHeight + (gridSize - 1) * rowGap;
    
    canvas.width = totalWidth;
    canvas.height = totalHeight;

    // 填充深色背景（和单图模版一样）
    ctx.fillStyle = '#2b242a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 加载所有图片
    const imagePromises = selectedCheckpoints.map((item) => {
      return new Promise<{ img: HTMLImageElement; data: typeof item }>((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve({ img, data: item });
        img.onerror = reject;
        img.src = item.imageUrl;
      });
    });

    try {
      const loadedImages = await Promise.all(imagePromises);
      
      // 绘制9图
      for (let i = 0; i < 9; i++) {
        const row = Math.floor(i / gridSize);
        const col = i % gridSize;
        const x = col * (cellSize + gap);
        // 计算每个单元格的起始y坐标：图片区域 + 行间距
        const imageY = row * (cellSize + rowGap);
        
        const { img, data } = loadedImages[i];
        const checkpoint = data.checkpoint;
        
        // 先绘制图片（限制在cellSize范围内，确保不会覆盖文字区域）
        // 裁剪并居中显示图片
        const scale = Math.max(cellSize / img.width, cellSize / img.height);
        const scaledWidth = img.width * scale;
        const scaledHeight = img.height * scale;
        const offsetX = (cellSize - scaledWidth) / 2;
        const offsetY = (cellSize - scaledHeight) / 2;
        
        // 确保图片只绘制在cellSize范围内，不会溢出
        ctx.save();
        ctx.beginPath();
        ctx.rect(x, imageY, cellSize, cellSize);
        ctx.clip();
        ctx.drawImage(img, x + offsetX, imageY + offsetY, scaledWidth, scaledHeight);
        ctx.restore();
        
        // 绘制文字区域（在图片下方，行间距中）- 使用深色背景
        const textY = imageY + cellSize;
        ctx.fillStyle = '#2b242a';
        ctx.fillRect(x, textY, cellSize, textHeight);
        
        // 绘制文字（薄荷绿色 #98dbc6）
        ctx.fillStyle = '#98dbc6';
        // 使用细体字，小字体
        ctx.font = '300 12px Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        // 格式化日期：0000-00-00
        const dateStr = checkpoint.reachedAt 
          ? new Date(checkpoint.reachedAt).toISOString().split('T')[0]
          : '0000-00-00';
        
        // 合并三个数据，用·分割
        const textContent = `${dateStr} · No.${data.artworkIndex} · CP${checkpoint.index}`;
        
        // 绘制文字信息（居中显示）
        const textX = x + cellSize / 2;
        const textYCenter = textY + textHeight / 2;
        ctx.fillText(textContent, textX, textYCenter);
      }

      // 转换为图片URL
      const dataUrl = canvas.toDataURL('image/png');
      setNineGridImageUrl(dataUrl);
      setShowNineGridModal(true);
    } catch (error) {
      console.error("生成9图失败:", error);
      alert("生成9图失败，请重试");
    }
  };

  // 处理完成确认
  const handleCompleteConfirm = () => {
    setShowNineGridModal(false);
    if (onComplete) {
      onComplete(goal);
    }
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
              const isLastCheckpoint = index === checkpoints.length - 1;
              return (
                <div 
                  className="timeline-item" 
                  key={checkpoint.index}
                  ref={isLastCheckpoint ? lastCheckpointRef : null}
                >
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
                    isCollapsed={collapsedCheckpoints.has(checkpoint.index)}
                    onToggleCollapse={() => toggleCheckpointCollapse(checkpoint.index)}
                    onSelectShowcase={handleSelectShowcase}
                    onEditCompletionNote={onEditCompletionNote}
                    onAddMessage={handleOpenMessageModal}
                    onViewImage={handleViewImage}
                    onEdit={handleOpenEditModal}
                    onDownload={handleDownloadCheckpoint}
                    onView={() => {
                      const completedCheckpoints = checkpoints.filter(cp => cp.status === "completed");
                      const completedIndex = completedCheckpoints.findIndex(cp => cp.index === checkpoint.index);
                      if (completedIndex !== -1) {
                        setViewingCheckpointIndex(completedIndex);
                        setShowViewer(true);
                      }
                    }}
                  />
                  
                  {/* 在最后一个检查点下方显示完成按钮 */}
                  {isLastCheckpoint && showCompleteButton && (
                    <div className="timeline-item__complete-section">
                      <button
                        type="button"
                        className="timeline-item__complete-button"
                        onClick={async () => {
                          // 生成9图
                          await generateNineGridImage(goal);
                        }}
                      >
                        完成本次{formatHours(goal.targetHours)}小时目标
                      </button>
                    </div>
                  )}
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

      {showEditModal && editCheckpoint && (
        <CheckpointEditModal
          checkpoint={editCheckpoint}
          goal={goal}
          onClose={handleCloseEditModal}
          onSave={handleEditSave}
        />
      )}

      {showViewer && viewingCheckpointIndex !== null && (
        <CheckpointViewer
          goal={goal}
          initialIndex={viewingCheckpointIndex}
          onClose={() => {
            setShowViewer(false);
            setViewingCheckpointIndex(null);
          }}
          onViewImage={handleViewImage}
          onEdit={handleOpenEditModal}
          onDownload={handleDownloadCheckpoint}
        />
      )}

      {showDownloadModal && downloadImageUrl && (
        <CheckpointDownloadModal
          imageUrl={downloadImageUrl}
          onClose={handleCloseDownloadModal}
        />
      )}

      {showNineGridModal && nineGridImageUrl && (
        <NineGridModal
          imageUrl={nineGridImageUrl}
          goal={goal}
          onClose={() => {
            setShowNineGridModal(false);
            setNineGridImageUrl(null);
          }}
          onConfirm={handleCompleteConfirm}
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
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  onSelectShowcase?: (checkpoint: LongTermGoalCheckpoint) => void;
  onEditCompletionNote?: (checkpoint: LongTermGoalCheckpoint) => void;
  onAddMessage?: (checkpoint: LongTermGoalCheckpoint) => void;
  onViewImage?: (imageUrl: string) => void;
  onEdit?: (checkpoint: LongTermGoalCheckpoint) => void;
  onView?: () => void;
  onDownload?: (checkpoint: LongTermGoalCheckpoint, element: HTMLElement) => void;
};

function CheckpointCard({
  checkpoint,
  checkpointHours,
  spentMinutes,
  stageStartedAt,
  isCollapsed = false,
  onToggleCollapse,
  onSelectShowcase: _onSelectShowcase,
  onEditCompletionNote: _onEditCompletionNote,
  onAddMessage: _onAddMessage,
  // Removed unused: onViewImage
  onEdit,
  onView,
  onDownload,
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
    // 计算开始日期和完成日期
    const startDate = parseDate(stageStartedAt);
    const endDate = parseDate(checkpoint.reachedAt);
    
    // 格式化日期：25 --- 07
    const startDay = startDate ? String(startDate.getDate()).padStart(2, "0") : "--";
    const endDay = endDate ? String(endDate.getDate()).padStart(2, "0") : "--";
    
    // 获取年份和月份名称（小字）
    const startMonth = startDate ? startDate.toLocaleDateString("zh-CN", { month: "long" }) : "";
    const endMonth = endDate ? endDate.toLocaleDateString("zh-CN", { month: "long" }) : "";
    
    // 计算小时数
    const hours = formatHours(checkpoint.thresholdMinutes / 60);
    
    // 获取图片URL（如果有）
    const imageUrl = checkpoint.upload?.image ? replaceLocalhostInUrl(checkpoint.upload.image) : null;
    
    return (
      <div 
        className={`checkpoint-ticket ${isCollapsed ? 'checkpoint-ticket--collapsed' : ''}`}
        onClick={(e) => {
          // 如果点击的是编辑按钮或下载按钮，不处理
          if ((e.target as HTMLElement).closest('.checkpoint-ticket__edit-btn')) {
            return;
          }
          
          // 如果点击的是折叠按钮
          if ((e.target as HTMLElement).closest('.checkpoint-ticket__collapse-btn')) {
            e.stopPropagation();
            // 折叠状态下点击折叠按钮：展开
            // 展开状态下点击折叠按钮：折叠
            onToggleCollapse?.();
            return;
          }
          
          // 折叠状态下：点击任何地方都展开
          if (isCollapsed) {
            onToggleCollapse?.();
            return;
          }
          
          // 展开状态下：点击卡片打开观看模式
          onView?.();
        }}
        style={{ cursor: 'pointer' }}
      >
        <div className="checkpoint-ticket__container">
          {/* 折叠按钮 */}
          <button
            type="button"
            className="checkpoint-ticket__collapse-btn"
            onClick={(e) => {
              e.stopPropagation();
              // 折叠状态下点击：展开
              // 展开状态下点击：折叠
              onToggleCollapse?.();
            }}
            aria-label={isCollapsed ? "展开" : "折叠"}
          >
            <MaterialIcon name={isCollapsed ? "expand_more" : "expand_less"} />
          </button>
          
          {/* 折叠时的简化标题 */}
          {isCollapsed && (
            <div className="checkpoint-ticket__collapsed-header">
              <span className="checkpoint-ticket__collapsed-title">{hours} H</span>
            </div>
          )}
          
          {/* 顶部图片区域 */}
          <div className={`checkpoint-ticket__image-section ${isCollapsed ? 'checkpoint-ticket__image-section--hidden' : ''}`}>
            <div className="checkpoint-ticket__image-wrapper">
              {imageUrl ? (
                <img
                  src={imageUrl}
                  alt={checkpoint.upload?.title || "创作记录"}
                  className="checkpoint-ticket__image"
                />
              ) : (
                <div className="checkpoint-ticket__image-placeholder">
                  <MaterialIcon name="image" />
                </div>
              )}
            </div>
            
            {/* 日期区域 - 紧贴在图片下方 */}
            <div className="checkpoint-ticket__dates">
              <div className="checkpoint-ticket__date-left">
                <span className="checkpoint-ticket__date-day">{startDay}</span>
                {startMonth && (
                  <span className="checkpoint-ticket__date-month">{startMonth}</span>
                )}
              </div>
              <div className="checkpoint-ticket__date-separator">
                <span className="checkpoint-ticket__date-duration">
                  历经 {formatDays(stageDurationDays)} 天
                </span>
              </div>
              <div className="checkpoint-ticket__date-right">
                <span className="checkpoint-ticket__date-day">{endDay}</span>
                {endMonth && (
                  <span className="checkpoint-ticket__date-month">{endMonth}</span>
                )}
              </div>
            </div>
          </div>
          
          {/* 内容区域 */}
          <div className="checkpoint-ticket__content">
            {!isCollapsed && (
              <>
                {/* 小时数标题 */}
                <div className="checkpoint-ticket__title-section">
                  <h1 className="checkpoint-ticket__title">{hours} H</h1>
                </div>
                
                {/* 点状分割线 */}
                <div className="checkpoint-ticket__divider" />
                
                {/* 底部内容 */}
                <div className="checkpoint-ticket__footer">
              {/* 左边：圆圈显示留言 */}
              <div className="checkpoint-ticket__note-section">
                <div className="checkpoint-ticket__note-circle">
                  {checkpoint.completionNote ? (
                    <p className="checkpoint-ticket__note-text">{checkpoint.completionNote}</p>
                  ) : (
                    <span className="checkpoint-ticket__note-placeholder">记录想说的话</span>
                  )}
                </div>
              </div>
              
              {/* 右边：编辑按钮和下载按钮 */}
              {(onEdit || onDownload) && (
                <div className="checkpoint-ticket__edit-section">
                  {onEdit && (
                    <button
                      type="button"
                      className="checkpoint-ticket__edit-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        onEdit(checkpoint);
                      }}
                      aria-label="编辑"
                    >
                      <MaterialIcon name="edit" />
                    </button>
                  )}
                  {onDownload && (
                    <button
                      type="button"
                      className="checkpoint-ticket__edit-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        const ticketElement = e.currentTarget.closest('.checkpoint-ticket__container') as HTMLElement;
                        if (ticketElement) {
                          onDownload(checkpoint, ticketElement);
                        }
                      }}
                      aria-label="下载"
                    >
                      <MaterialIcon name="download" />
                    </button>
                  )}
                </div>
              )}
            </div>
              </>
            )}
          </div>
        </div>
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

type CheckpointEditModalProps = {
  checkpoint: LongTermGoalCheckpoint;
  goal: LongTermGoal;
  onClose: () => void;
  onSave: (artworkId: number | null, message: string) => void;
};

function CheckpointEditModal({
  checkpoint,
  goal,
  onClose,
  onSave,
}: CheckpointEditModalProps) {
  const [allArtworks, setAllArtworks] = useState<Artwork[]>(() => loadStoredArtworks());
  const [selectedArtworkId, setSelectedArtworkId] = useState<number | null>(
    checkpoint.upload?.id ?? null
  );
  const [message, setMessage] = useState(checkpoint.completionNote || "");
  const MAX_LENGTH = 500;
  const remainingChars = MAX_LENGTH - message.length;

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

  const handleMessageChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    if (newValue.length <= MAX_LENGTH) {
      setMessage(newValue);
    } else if (newValue.length < message.length) {
      setMessage(newValue);
    }
  };

  const handleArtworkSelect = (artwork: Artwork) => {
    const numericId = artwork.id.replace(/^art-/, "");
    const id = Number.parseInt(numericId, 10);
    if (Number.isFinite(id) && id > 0) {
      setSelectedArtworkId(id);
    }
  };

  const handleSave = () => {
    onSave(selectedArtworkId, message);
  };


  return (
    <div className="checkpoint-edit-modal" onClick={onClose}>
      <div className="checkpoint-edit-modal__content" onClick={(e) => e.stopPropagation()}>
        <div className="checkpoint-edit-modal__header">
          <h3 className="checkpoint-edit-modal__title">编辑完成记录</h3>
          <button
            type="button"
            className="checkpoint-edit-modal__close"
            onClick={onClose}
            aria-label="关闭"
          >
            <MaterialIcon name="close" />
          </button>
        </div>

        <div className="checkpoint-edit-modal__body">
          {/* 图片选择部分 */}
          <div className="checkpoint-edit-modal__section">
            <h4 className="checkpoint-edit-modal__section-title">选择代表作</h4>
            {filteredArtworks.length === 0 ? (
              <div className="checkpoint-edit-modal__empty">
                <MaterialIcon name="image_not_supported" />
                <p>该时间段内没有上传的画作</p>
              </div>
            ) : (
              <div className="checkpoint-edit-modal__artwork-grid">
                {filteredArtworks.map((artwork) => {
                  const numericId = artwork.id.replace(/^art-/, "");
                  const id = Number.parseInt(numericId, 10);
                  const isSelected = Number.isFinite(id) && id > 0 && selectedArtworkId !== null && id === selectedArtworkId;
                  
                  return (
                    <button
                      key={artwork.id}
                      type="button"
                      className={`checkpoint-edit-modal__artwork-item ${isSelected ? "checkpoint-edit-modal__artwork-item--selected" : ""}`}
                      onClick={() => handleArtworkSelect(artwork)}
                    >
                      <img
                        src={artwork.imageSrc}
                        alt={artwork.title}
                        className="checkpoint-edit-modal__artwork-image"
                      />
                      {isSelected && (
                        <div className="checkpoint-edit-modal__artwork-check">
                          <MaterialIcon name="check" />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* 留言编辑部分 */}
          <div className="checkpoint-edit-modal__section">
            <h4 className="checkpoint-edit-modal__section-title">留下想记录的话</h4>
            <textarea
              className="checkpoint-edit-modal__textarea"
              value={message}
              onChange={handleMessageChange}
              placeholder="对这张图的感受，这段时间的感悟，或是随便什么，想留给未来的自己记录的话…"
              rows={6}
              maxLength={MAX_LENGTH}
            />
            <div className="checkpoint-edit-modal__char-count">
              <span className={remainingChars < 0 ? "checkpoint-edit-modal__char-count--warning" : ""}>
                {message.length} / {MAX_LENGTH}
              </span>
            </div>
          </div>
        </div>

        <div className="checkpoint-edit-modal__footer">
          <button
            type="button"
            className="checkpoint-edit-modal__cancel"
            onClick={onClose}
          >
            取消
          </button>
          <button
            type="button"
            className="checkpoint-edit-modal__save"
            onClick={handleSave}
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
}

type CheckpointViewerProps = {
  goal: LongTermGoal;
  initialIndex: number;
  onClose: () => void;
  onViewImage?: (imageUrl: string) => void;
  onEdit?: (checkpoint: LongTermGoalCheckpoint) => void;
  onDownload?: (checkpoint: LongTermGoalCheckpoint, element: HTMLElement) => void;
};

function CheckpointViewer({
  goal,
  initialIndex,
  onClose,
  // Removed unused: onViewImage
  onEdit: _onEdit,
  onDownload,
}: CheckpointViewerProps) {
  const completedCheckpoints = useMemo(() => {
    return (goal.checkpoints ?? []).filter(cp => cp.status === "completed");
  }, [goal.checkpoints]);
  
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [isAnimating, setIsAnimating] = useState(false);
  const [_swipeDirection, setSwipeDirection] = useState<'left' | 'right' | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const startXRef = useRef<{ x: number; timestamp: number } | null>(null);
  const currentXRef = useRef<number>(0);
  const offsetRef = useRef<number>(0);
  const isDraggingRef = useRef<boolean>(false);
  const slideWidthRef = useRef<number>(0);

  // 获取 slide 宽度（使用 window.innerWidth，因为每个 slide 是 100vw）
  const getSlideWidth = useCallback(() => {
    return window.innerWidth;
  }, []);

  const handlePointerDown = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    if (isAnimating) return;
    startXRef.current = { x: e.clientX, timestamp: Date.now() };
    currentXRef.current = e.clientX;
    offsetRef.current = 0;
    isDraggingRef.current = true;
    if (containerRef.current) {
      containerRef.current.style.transition = 'none';
    }
  }, [isAnimating]);

  const handlePointerMove = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current || startXRef.current === null || isAnimating) return;
    
    currentXRef.current = e.clientX;
    const deltaX = currentXRef.current - startXRef.current.x;
    offsetRef.current = deltaX;
    
    if (containerRef.current) {
      const slideWidth = getSlideWidth();
      // 添加阻力效果，让滑动更自然
      let resistance = 1;
      const maxDelta = slideWidth * 0.5; // 最大滑动距离为半个屏幕
      if (Math.abs(deltaX) > maxDelta) {
        resistance = maxDelta / Math.abs(deltaX);
      }
      
      const translateX = -currentIndex * slideWidth + deltaX * resistance;
      containerRef.current.style.transform = `translateX(${translateX}px)`;
      
      // 设置方向
      if (Math.abs(deltaX) > 5) {
        setSwipeDirection(deltaX > 0 ? 'right' : 'left');
      }
    }
  }, [currentIndex, isAnimating, getSlideWidth]);

  const handlePointerUp = useCallback(() => {
    if (!isDraggingRef.current || startXRef.current === null || isAnimating) return;
    
    const threshold = 0.15; // 降低阈值到15%，更容易触发切换
    const velocityThreshold = 0.5; // 速度阈值（像素/毫秒）
    const deltaX = offsetRef.current;
    const slideWidth = getSlideWidth();
    const swipePercentage = Math.abs(deltaX) / slideWidth;
    
    // 计算滑动速度
    const timeDelta = Date.now() - startXRef.current.timestamp;
    const velocity = Math.abs(deltaX) / Math.max(timeDelta, 50);
    const hasVelocity = velocity > velocityThreshold;
    
    let targetIndex = currentIndex;
    
    // 如果滑动距离超过阈值，或者有足够的速度，就切换
    if (swipePercentage > threshold || hasVelocity) {
      if (deltaX > 0 && currentIndex > 0) {
        // 向右滑动，显示上一张
        targetIndex = currentIndex - 1;
      } else if (deltaX < 0 && currentIndex < completedCheckpoints.length - 1) {
        // 向左滑动，显示下一张
        targetIndex = currentIndex + 1;
      }
    }
    
    setIsAnimating(true);
    setCurrentIndex(targetIndex);
    
    if (containerRef.current) {
      // 使用更平滑的缓动函数
      containerRef.current.style.transition = 'transform 0.25s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
      const translateX = -targetIndex * slideWidth;
      containerRef.current.style.transform = `translateX(${translateX}px)`;
    }
    
    setTimeout(() => {
      setIsAnimating(false);
      isDraggingRef.current = false;
      startXRef.current = null;
      setSwipeDirection(null);
    }, 250);
  }, [currentIndex, completedCheckpoints.length, isAnimating, getSlideWidth]);

  const handlePointerCancel = useCallback(() => {
    if (containerRef.current && !isAnimating) {
      containerRef.current.style.transition = 'transform 0.25s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
      const slideWidth = getSlideWidth();
      const translateX = -currentIndex * slideWidth;
      containerRef.current.style.transform = `translateX(${translateX}px)`;
    }
    isDraggingRef.current = false;
    startXRef.current = null;
    setSwipeDirection(null);
  }, [currentIndex, isAnimating, getSlideWidth]);

  // 更新容器位置
  useEffect(() => {
    if (containerRef.current && !isDraggingRef.current) {
      const slideWidth = getSlideWidth();
      slideWidthRef.current = slideWidth;
      const translateX = -currentIndex * slideWidth;
      containerRef.current.style.transition = 'transform 0.25s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
      containerRef.current.style.transform = `translateX(${translateX}px)`;
    }
  }, [currentIndex, getSlideWidth]);

  // 初始化时设置位置（避免初始动画）
  useEffect(() => {
    if (containerRef.current) {
      const slideWidth = getSlideWidth();
      slideWidthRef.current = slideWidth;
      const translateX = -initialIndex * slideWidth;
      containerRef.current.style.transition = 'none';
      containerRef.current.style.transform = `translateX(${translateX}px)`;
      // 下一帧恢复 transition
      requestAnimationFrame(() => {
        if (containerRef.current) {
          containerRef.current.style.transition = 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
        }
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 监听窗口大小变化
  useEffect(() => {
    const handleResize = () => {
      if (containerRef.current && !isDraggingRef.current) {
        const slideWidth = getSlideWidth();
        slideWidthRef.current = slideWidth;
        const translateX = -currentIndex * slideWidth;
        containerRef.current.style.transition = 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
        containerRef.current.style.transform = `translateX(${translateX}px)`;
      }
    };
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [currentIndex, getSlideWidth, isDraggingRef]);

  const currentCheckpoint = completedCheckpoints[currentIndex];
  if (!currentCheckpoint) return null;

  return (
    <div 
      className="checkpoint-viewer"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      {/* 半透明黑色遮罩 */}
      <div className="checkpoint-viewer__backdrop" />
      
      {/* 关闭按钮 */}
      <button
        type="button"
        className="checkpoint-viewer__close"
        onClick={onClose}
        aria-label="关闭"
      >
        <MaterialIcon name="close" />
      </button>

      {/* 卡片容器 */}
      <div
        ref={containerRef}
        className="checkpoint-viewer__container"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
      >
        {completedCheckpoints.map((checkpoint, index) => {
          const startDate = parseDate(
            index > 0
              ? (goal.checkpoints ?? []).find(cp => cp.index === checkpoint.index - 1)?.reachedAt ?? goal.startedAt
              : goal.startedAt
          );
          const endDate = parseDate(checkpoint.reachedAt);
          const startDay = startDate ? String(startDate.getDate()).padStart(2, "0") : "--";
          const endDay = endDate ? String(endDate.getDate()).padStart(2, "0") : "--";
          const startMonth = startDate ? startDate.toLocaleDateString("zh-CN", { month: "long" }) : "";
          const endMonth = endDate ? endDate.toLocaleDateString("zh-CN", { month: "long" }) : "";
          const hours = formatHours(checkpoint.thresholdMinutes / 60);
          const imageUrl = checkpoint.upload?.image ? replaceLocalhostInUrl(checkpoint.upload.image) : null;
          const stageDurationDays = calculateDurationDays(
            index > 0
              ? (goal.checkpoints ?? []).find(cp => cp.index === checkpoint.index - 1)?.reachedAt ?? goal.startedAt
              : goal.startedAt,
            checkpoint.reachedAt
          );
          const isActive = index === currentIndex;

          return (
            <div
              key={checkpoint.index}
              className={`checkpoint-viewer__slide ${isActive ? 'checkpoint-viewer__slide--active' : ''}`}
            >
              <div className="checkpoint-ticket">
                <div className="checkpoint-ticket__container">
                  <div className="checkpoint-ticket__image-section">
                    <div className="checkpoint-ticket__image-wrapper">
                      {imageUrl ? (
                        <img
                          src={imageUrl}
                          alt={checkpoint.upload?.title || "创作记录"}
                          className="checkpoint-ticket__image"
                          onClick={(e) => {
                            // 阻止事件冒泡
                            e.stopPropagation();
                          }}
                        />
                      ) : (
                        <div className="checkpoint-ticket__image-placeholder">
                          <MaterialIcon name="image" />
                        </div>
                      )}
                    </div>
                    
                    <div className="checkpoint-ticket__dates">
                      <div className="checkpoint-ticket__date-left">
                        <span className="checkpoint-ticket__date-day">{startDay}</span>
                        {startMonth && (
                          <span className="checkpoint-ticket__date-month">{startMonth}</span>
                        )}
                      </div>
                      <div className="checkpoint-ticket__date-separator">
                        <span className="checkpoint-ticket__date-duration">
                          历经 {formatDays(stageDurationDays)} 天
                        </span>
                      </div>
                      <div className="checkpoint-ticket__date-right">
                        <span className="checkpoint-ticket__date-day">{endDay}</span>
                        {endMonth && (
                          <span className="checkpoint-ticket__date-month">{endMonth}</span>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  <div className="checkpoint-ticket__content">
                    <div className="checkpoint-ticket__title-section">
                      <h1 className="checkpoint-ticket__title">{hours} H</h1>
                    </div>
                    
                    <div className="checkpoint-ticket__divider" />
                    
                    <div className="checkpoint-ticket__footer">
                      <div className="checkpoint-ticket__note-section">
                        <div className="checkpoint-ticket__note-circle">
                          {checkpoint.completionNote ? (
                            <p className="checkpoint-ticket__note-text">{checkpoint.completionNote}</p>
                          ) : (
                            <span className="checkpoint-ticket__note-placeholder">记录想说的话</span>
                          )}
                        </div>
                      </div>
                      
                      {onDownload && (
                        <div className="checkpoint-ticket__edit-section">
                          <button
                            type="button"
                            className="checkpoint-ticket__edit-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              const ticketElement = e.currentTarget.closest('.checkpoint-ticket__container') as HTMLElement;
                              if (ticketElement) {
                                onDownload(checkpoint, ticketElement);
                              }
                            }}
                            aria-label="下载"
                          >
                            <MaterialIcon name="download" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* 指示器 */}
      {completedCheckpoints.length > 1 && (
        <div className="checkpoint-viewer__indicators">
          {completedCheckpoints.map((_, index) => (
            <button
              key={index}
              type="button"
              className={`checkpoint-viewer__indicator ${index === currentIndex ? 'checkpoint-viewer__indicator--active' : ''}`}
              onClick={() => {
                if (!isAnimating) {
                  setCurrentIndex(index);
                }
              }}
              aria-label={`跳转到第 ${index + 1} 张卡片`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

type CheckpointDownloadModalProps = {
  imageUrl: string;
  onClose: () => void;
};

function CheckpointDownloadModal({ imageUrl, onClose }: CheckpointDownloadModalProps) {
  return (
    <div className="checkpoint-download-modal" onClick={onClose}>
      <div className="checkpoint-download-modal__backdrop" />
      <button
        type="button"
        className="checkpoint-download-modal__close"
        onClick={onClose}
        aria-label="关闭"
      >
        <MaterialIcon name="close" />
      </button>
      <div className="checkpoint-download-modal__content" onClick={(e) => e.stopPropagation()}>
        <img
          src={imageUrl}
          alt="检查点卡片"
          className="checkpoint-download-modal__image"
          style={{ userSelect: 'none' }}
        />
        <p className="checkpoint-download-modal__hint">长按图片保存</p>
      </div>
    </div>
  );
}

type NineGridModalProps = {
  imageUrl: string;
  onClose: () => void;
  onConfirm: () => void;
};

type NineGridModalPropsWithGoal = {
  imageUrl: string;
  goal: LongTermGoal;
  onClose: () => void;
  onConfirm: () => void;
};

function NineGridModal({ imageUrl, goal, onClose, onConfirm }: NineGridModalPropsWithGoal) {
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    setIsAnimating(true);
  }, []);

  // 计算天数
  const startDate = goal.startedAt ? new Date(goal.startedAt) : null;
  const endDate = goal.checkpoints && goal.checkpoints.length > 0
    ? goal.checkpoints[goal.checkpoints.length - 1]?.reachedAt
      ? new Date(goal.checkpoints[goal.checkpoints.length - 1].reachedAt)
      : new Date()
    : new Date();
  const days = startDate ? Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) : 0;
  const hours = formatHours(goal.targetHours);

  return (
    <div className="nine-grid-modal" onClick={onClose}>
      <div className="nine-grid-modal__backdrop" />
      <div 
        className={`nine-grid-modal__content ${isAnimating ? 'nine-grid-modal__content--animated' : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="nine-grid-modal__header">
          <h3 className="nine-grid-modal__title">完成本次目标</h3>
          <button
            type="button"
            className="nine-grid-modal__close"
            onClick={onClose}
            aria-label="关闭"
          >
            <MaterialIcon name="close" />
          </button>
        </div>
        <div className="nine-grid-modal__body">
          <div className="nine-grid-modal__image-wrapper">
            <img
              src={imageUrl}
              alt="9图合成"
              className="nine-grid-modal__image"
            />
          </div>
          <p className="nine-grid-modal__hint">这是你{days}天以来的{hours}小时创作历程</p>
        </div>
        <div className="nine-grid-modal__footer">
          <button
            type="button"
            className="nine-grid-modal__cancel"
            onClick={onClose}
          >
            取消
          </button>
          <button
            type="button"
            className="nine-grid-modal__confirm"
            onClick={onConfirm}
          >
            确认完成
          </button>
        </div>
      </div>
    </div>
  );
}

export default LongTermGoalDetails;
