import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import type { CSSProperties } from "react";

import MaterialIcon from "@/components/MaterialIcon";
import {
  fetchLongTermCopyGuides,
  upsertLongTermGoal,
  type LongTermGoal,
  type LongTermCopyGuide,
} from "@/services/api";

import "./LongTermGoalSetup.css";

type LongTermGoalSetupMode = "create" | "edit-full" | "edit-meta";

type LongTermGoalSetupProps = {
  onClose: () => void;
  onSaved?: (goal: LongTermGoal) => void;
  initialGoal?: LongTermGoal | null;
  mode?: LongTermGoalSetupMode;
};

type DigitColumnProps = {
  value: number;
  onChange?: (next: number) => void;
  size?: "large" | "medium";
  "aria-label": string;
  readOnly?: boolean;
};

const DIGIT_VALUES = Array.from({ length: 10 }, (_, index) => index);
const DIGIT_HEIGHT = {
  large: 96,
  medium: 64,
} as const;
const MIN_TOTAL_HOURS = 50;
const MAX_TOTAL_HOURS = 9999;
const MAX_CHECKPOINTS = 50;

function LongTermGoalSetup({
  onClose,
  onSaved,
  initialGoal = null,
  mode,
}: LongTermGoalSetupProps) {
  const resolvedMode: LongTermGoalSetupMode =
    mode ?? (initialGoal ? "edit-full" : "create");
  const allowStructureEdit = resolvedMode !== "edit-meta";
  const allowReset = resolvedMode === "edit-full";

  const initialTotalHours = clampTotalHours(initialGoal?.targetHours ?? 120);
  const initialCheckpointCount = clampCheckpointCount(initialGoal?.checkpointCount ?? 12, initialTotalHours);

  const [totalHours, setTotalHours] = useState(initialTotalHours);
  const [checkpointCount, setCheckpointCount] = useState(initialCheckpointCount);
  const [title, setTitle] = useState(() => initialGoal?.title ?? "");
  const [description, setDescription] = useState(() => initialGoal?.description ?? "");
  const [resetProgress, setResetProgress] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [copyGuides, setCopyGuides] = useState<LongTermCopyGuide[]>([]);
  const [copyLoading, setCopyLoading] = useState(false);

  const totalDigits = useMemo(() => toDigits(totalHours, 4), [totalHours]);
  const checkpointDigits = useMemo(() => toDigits(checkpointCount, 2), [checkpointCount]);
  const perCheckpointHours = useMemo(() => {
    if (checkpointCount <= 0) {
      return totalHours;
    }
    return Math.max(1, Math.round(totalHours / checkpointCount));
  }, [checkpointCount, totalHours]);
  const perCheckpointDigits = useMemo(
    () => toDigits(perCheckpointHours, 3),
    [perCheckpointHours],
  );
  const minCheckpoints = useMemo(() => {
    const MAX_HOURS_PER_CHECKPOINT = 999;
    // 最小检查点数量：基于"每个检查点最多999小时"的限制
    // 如果总时长50小时，每个检查点最多999小时，那么最少需要ceil(50/999)=1个检查点
    return Math.ceil(totalHours / MAX_HOURS_PER_CHECKPOINT);
  }, [totalHours]);
  const activeCopyGuide = useMemo(() => {
    if (!copyGuides.length) {
      return null;
    }
    const matched = copyGuides.find((guide) => {
      if (totalHours < guide.minHours) {
        return false;
      }
      if (guide.maxHours == null) {
        return true;
      }
      return totalHours <= guide.maxHours;
    });
    if (matched) {
      return matched;
    }
    let fallback: LongTermCopyGuide | null = null;
    for (const guide of copyGuides) {
      if (totalHours >= guide.minHours) {
        fallback = guide;
      } else {
        break;
      }
    }
    return fallback;
  }, [copyGuides, totalHours]);

  useEffect(() => {
    if (!initialGoal) {
      setResetProgress(false);
      return;
    }
    setTitle(initialGoal.title);
    setDescription(initialGoal.description ?? "");
    const nextTotal = clampTotalHours(initialGoal.targetHours);
    setTotalHours(nextTotal);
    setCheckpointCount(clampCheckpointCount(initialGoal.checkpointCount, nextTotal));
    setResetProgress(false);
  }, [initialGoal]);

  useEffect(() => {
    let cancelled = false;
    const loadCopies = async () => {
      try {
        setCopyLoading(true);
        const guides = await fetchLongTermCopyGuides();
        if (cancelled) {
          return;
        }
        const sorted = guides
          .filter((guide) => guide.isActive !== false)
          .sort((a, b) => {
            if (a.minHours !== b.minHours) {
              return a.minHours - b.minHours;
            }
            const aMax = a.maxHours ?? Number.POSITIVE_INFINITY;
            const bMax = b.maxHours ?? Number.POSITIVE_INFINITY;
            return aMax - bMax;
          });
        setCopyGuides(sorted);
      } catch (error) {
        console.warn("Failed to fetch long-term copy guides", error);
        if (!cancelled) {
          setCopyGuides([]);
        }
      } finally {
        if (!cancelled) {
          setCopyLoading(false);
        }
      }
    };
    loadCopies();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleChangeTotalDigit = (index: number) => (next: number) => {
    if (!allowStructureEdit) {
      return;
    }
    setTotalHours((prev) => {
      const updated = clampTotalHours(setDigit(prev, 4, index, next));
      setCheckpointCount((prevCount) => clampCheckpointCount(prevCount, updated));
      return updated;
    });
  };

  const handleChangeCheckpointDigit = (index: number) => (next: number) => {
    if (!allowStructureEdit) {
      return;
    }
    setCheckpointCount((prev) => clampCheckpointCount(setDigit(prev, 2, index, next), totalHours));
  };

  const handleSubmit = async () => {
    setErrorMessage(null);
    setIsSaving(true);

    const effectiveTitle = title.trim() || `${totalHours} 小时计划`;
    const effectiveDescription = description.trim();

    const targetHours = allowStructureEdit
      ? totalHours
      : clampTotalHours(initialGoal?.targetHours ?? totalHours);
    const checkpoints = allowStructureEdit
      ? checkpointCount
      : clampCheckpointCount(initialGoal?.checkpointCount ?? checkpointCount, targetHours);

    try {
      const goal = await upsertLongTermGoal({
        title: effectiveTitle,
        description: effectiveDescription,
        targetHours,
        checkpointCount: checkpoints,
        resetProgress: allowReset ? resetProgress : false,
      });
      if (onSaved) {
        onSaved(goal);
      } else {
        onClose();
      }
    } catch (error) {
      console.warn("Failed to save long-term goal", error);
      setErrorMessage("保存长期目标失败，请稍后再试。");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="long-term-setup">
      <div className="long-term-setup__background">
        <div className="long-term-setup__glow long-term-setup__glow--mint" />
        <div className="long-term-setup__glow long-term-setup__glow--brown" />
      </div>

      <div className="long-term-setup__shell">
        <header className="long-term-setup__header">
          <button
            type="button"
            className="long-term-setup__icon-button"
            onClick={onClose}
            aria-label="返回目标列表"
          >
            <MaterialIcon name="arrow_back" />
          </button>
          <h1 className="long-term-setup__title">
            {resolvedMode === "create" ? "设置长期目标" : "调整长期目标"}
          </h1>
          <span className="long-term-setup__header-placeholder" />
        </header>
        {resolvedMode === "edit-meta" ? (
          <p className="long-term-setup__subtitle">更新计划名称与简介</p>
        ) : (
          <div className="long-term-setup__subtitle-text">
            <p>长期计划存在的目的，是希望你在漫长的创作旅途里，保留方向感。</p>
            <p>不是为了追求速度，不是为了堆量，只是帮你把零散的时刻串成完整的一条线。</p>
            <p>只要慢慢上传、慢慢记录，最终会看到一条和时间一起延伸的轨迹。</p>
            <p>一万小时定律看起来太遥不可及，那么就选择任何你喜欢的数字，或者对你有意义的数字作为总时长。</p>
            <p>让我们从这里开始吧。</p>
          </div>
        )}

        <main className="long-term-setup__main">
          <section className="long-term-setup__section">
            <h2 className="long-term-setup__section-title">计划名称</h2>
            <input
              className="long-term-setup__input"
              type="text"
              value={title}
              onChange={(event) => setTitle(event.target.value.slice(0, 160))}
              placeholder="为自己的计划新建画布"
              maxLength={160}
            />
            <h2 className="long-term-setup__section-title" style={{ marginTop: "1.5rem" }}>计划简介</h2>
            <textarea
              className="long-term-setup__textarea"
              value={description}
              onChange={(event) => setDescription(event.target.value.slice(0, 600))}
              placeholder="给接下来一段时间的自己一个指北。可以是激励自己的话，或是自己的梦想，抑或只是提醒自己永远不要放弃画画。当然，你也可以在这里留下空白。"
              rows={3}
              maxLength={600}
            />
          </section>

          {allowStructureEdit ? (
            <>
              <section className="long-term-setup__section">
                <h2 className="long-term-setup__section-title">总时长</h2>
                <div className="long-term-setup__digit-row">
                  {totalDigits.map((digit, index) => (
                    <DigitColumn
                      key={`total-${index}`}
                      value={digit}
                      size="large"
                      onChange={handleChangeTotalDigit(index)}
                      aria-label={`总时长第 ${index + 1} 位数字`}
                    />
                  ))}
                  <span className="long-term-setup__unit">小时</span>
                </div>
                <p className="long-term-setup__hint">数值范围：50 - 9999 小时</p>
                {copyLoading ? (
                  <p className="long-term-setup__hint">正在加载建议文案...</p>
                ) : activeCopyGuide ? (
                  <p className="long-term-setup__hint">{activeCopyGuide.message}</p>
                ) : null}
              </section>

              <section className="long-term-setup__card">
                <div className="long-term-setup__card-row">
                  <p>分为</p>
                  <div className="long-term-setup__digit-group">
                    {checkpointDigits.map((digit, index) => (
                      <DigitColumn
                        key={`checkpoint-${index}`}
                        value={digit}
                        size="medium"
                        onChange={handleChangeCheckpointDigit(index)}
                        aria-label={`检查点数量第 ${index + 1} 位数字`}
                      />
                    ))}
                  </div>
                  <p>个检查点</p>
                </div>
                {minCheckpoints > 1 && (
                  <p className="long-term-setup__hint" style={{ marginTop: "-0.5rem", textAlign: "center" }}>
                    每个检查点最多 999 小时，当前总时长最少需要 {minCheckpoints} 个检查点
                  </p>
                )}

                <div className="long-term-setup__card-row">
                  <p>每个检查点</p>
                  <div className="long-term-setup__digit-group">
                    {perCheckpointDigits.map((digit, index) => (
                      <DigitColumn
                        key={`per-checkpoint-${index}`}
                        value={digit}
                        size="medium"
                        aria-label={`每个检查点耗时第 ${index + 1} 位数字`}
                        readOnly
                      />
                    ))}
                  </div>
                  <p>小时</p>
                </div>
              </section>
            </>
          ) : null}

          {allowReset && initialGoal ? (
            <label className="long-term-setup__checkbox">
              <input
                type="checkbox"
                checked={resetProgress}
                onChange={(event) => setResetProgress(event.target.checked)}
              />
              <span>
                重新计算进度
                <small>（修改目标时建议勾选，可从当前时间重新统计时长）</small>
              </span>
            </label>
          ) : null}

          {errorMessage ? <p className="long-term-setup__error">{errorMessage}</p> : null}
        </main>

        <footer className="long-term-setup__footer">
          <button
            type="button"
            className="long-term-setup__primary"
            onClick={handleSubmit}
            disabled={isSaving}
            aria-busy={isSaving ? "true" : undefined}
          >
            {isSaving
              ? "保存中..."
              : resolvedMode === "create"
              ? "确认计划"
              : resolvedMode === "edit-meta"
              ? "保存信息"
              : "保存计划"}
          </button>
        </footer>
      </div>
    </div>
  );
}

function DigitColumn({
  value,
  onChange,
  size = "large",
  "aria-label": ariaLabel,
  readOnly = false,
}: DigitColumnProps) {
  const height = DIGIT_HEIGHT[size];
  const scrollRef = useRef<HTMLDivElement>(null);
  const isSyncingRef = useRef(false);
  const syncTimeoutRef = useRef<number | null>(null);
  const scrollTimeoutRef = useRef<number | null>(null);
  const [isPointerActive, setIsPointerActive] = useState(false);

  const style = useMemo(() => {
    return {
      "--digit-height": `${height}px`,
    } as CSSProperties;
  }, [height]);

  useEffect(() => {
    return () => {
      if (syncTimeoutRef.current) {
        window.clearTimeout(syncTimeoutRef.current);
      }
      if (scrollTimeoutRef.current) {
        window.clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, []);

  const alignToValue = useCallback(
    (behavior: ScrollBehavior = "smooth") => {
      if (!scrollRef.current) {
        return;
      }
      const target = value * height;
      isSyncingRef.current = true;
      scrollRef.current.scrollTo({ top: target, behavior });
      if (syncTimeoutRef.current) {
        window.clearTimeout(syncTimeoutRef.current);
      }
      syncTimeoutRef.current = window.setTimeout(() => {
        isSyncingRef.current = false;
      }, behavior === "auto" ? 0 : 180);
    },
    [height, value],
  );

  useEffect(() => {
    alignToValue("auto");
  }, [alignToValue]);

  useEffect(() => {
    // 只有在不是同步状态时才对齐，避免循环更新
    if (!isSyncingRef.current) {
      alignToValue();
    }
  }, [alignToValue, value]);

  const handleScroll = useCallback(() => {
    if (!scrollRef.current || isSyncingRef.current) {
      return;
    }

    const { scrollTop } = scrollRef.current;
    if (scrollTop < 0) {
      scrollRef.current.scrollTop = 0;
      return;
    }

    const maxTop = height * (DIGIT_VALUES.length - 1);
    if (scrollTop > maxTop) {
      scrollRef.current.scrollTop = maxTop;
      return;
    }

    if (!onChange || readOnly) {
      return;
    }

    // 清除之前的延迟更新
    if (scrollTimeoutRef.current) {
      window.clearTimeout(scrollTimeoutRef.current);
    }

    // 延迟更新值，避免频繁触发导致循环
    scrollTimeoutRef.current = window.setTimeout(() => {
      if (!scrollRef.current || isSyncingRef.current) {
        return;
      }
      const currentScrollTop = scrollRef.current.scrollTop;
      const raw = currentScrollTop / height;
      const next = Math.min(Math.max(Math.round(raw), 0), 9);
      if (next !== value) {
        isSyncingRef.current = true;
        onChange(next);
        // 短暂延迟后重置同步标志，确保对齐操作可以执行
        window.setTimeout(() => {
          isSyncingRef.current = false;
        }, 100);
      }
    }, 100);
  }, [height, onChange, readOnly, value]);

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!onChange || readOnly) {
      event.preventDefault();
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      onChange((value + 9) % 10);
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      onChange((value + 1) % 10);
    }
  };

  const handlePointerDown = useCallback(() => {
    if (!readOnly) {
      setIsPointerActive(true);
    }
  }, [readOnly]);

  const handlePointerRelease = useCallback(() => {
    setIsPointerActive(false);
    alignToValue();
  }, [alignToValue]);

  return (
    <div
      className={`long-term-setup__digit-column long-term-setup__digit-column--${size}${
        readOnly ? " long-term-setup__digit-column--readonly" : ""
      }${isPointerActive ? " long-term-setup__digit-column--pointer" : ""}`}
    >
      <div className="long-term-setup__digit-chrome" />
      <div
        className="long-term-setup__digit-scroll"
        style={style}
        ref={scrollRef}
        tabIndex={readOnly ? -1 : 0}
        onScroll={handleScroll}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerRelease}
        onPointerCancel={handlePointerRelease}
        onPointerLeave={handlePointerRelease}
        onBlur={() => alignToValue()}
        aria-label={ariaLabel}
        role="spinbutton"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={9}
        aria-readonly={readOnly || undefined}
        onKeyDown={handleKeyDown}
      >
        <div className="long-term-setup__digit-overlay" />
        <div className="long-term-setup__digit-list">
          {DIGIT_VALUES.map((digit) => (
            <span
              key={digit}
              className={
                digit === value
                  ? "long-term-setup__digit-value long-term-setup__digit-value--active"
                  : "long-term-setup__digit-value"
              }
            >
              {digit}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function toDigits(value: number, length: number) {
  return value
    .toString()
    .padStart(length, "0")
    .slice(-length)
    .split("")
    .map((character) => Number(character));
}

function setDigit(value: number, length: number, index: number, digit: number) {
  const digits = toDigits(value, length);
  digits[index] = digit;
  return Number(digits.join(""));
}

function clampTotalHours(value: number) {
  if (!Number.isFinite(value)) {
    return MIN_TOTAL_HOURS;
  }
  return Math.min(Math.max(Math.round(value), MIN_TOTAL_HOURS), MAX_TOTAL_HOURS);
}

function clampCheckpointCount(value: number, totalHours: number) {
  if (!Number.isFinite(value)) {
    return 1;
  }
  const normalizedTotal = Number.isFinite(totalHours) ? Math.max(1, Math.round(totalHours)) : MAX_CHECKPOINTS;
  
  // 每个检查点最多999小时，最少5小时
  const MAX_HOURS_PER_CHECKPOINT = 999;
  const MIN_HOURS_PER_CHECKPOINT = 5;
  
  // 最小检查点数量：基于"每个检查点最多999小时"的限制
  // 如果总时长50小时，每个检查点最多999小时，那么最少需要ceil(50/999)=1个检查点
  const minCheckpoints = Math.ceil(normalizedTotal / MAX_HOURS_PER_CHECKPOINT);
  
  // 最大检查点数量：基于"每个检查点最少5小时"的限制
  // 如果总时长50小时，每个检查点最少5小时，那么最多可以有floor(50/5)=10个检查点
  // 同时不能超过系统设置的最大检查点数量(90)
  const maxAllowed = Math.min(MAX_CHECKPOINTS, Math.floor(normalizedTotal / MIN_HOURS_PER_CHECKPOINT));
  
  // 确保检查点数量在最小值和最大值之间
  return Math.min(Math.max(Math.round(value), minCheckpoints), maxAllowed);
}

export default LongTermGoalSetup;
