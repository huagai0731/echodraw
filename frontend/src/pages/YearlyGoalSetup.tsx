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
import YearlyPhaseImageSelector from "@/components/YearlyPhaseImageSelector";
import {
  fetchYearlyGoalPresets,
  upsertLongTermGoal,
  updateCheckpoint,
  type LongTermGoal,
  type YearlyGoalPreset,
  type YearlyPhase,
} from "@/services/api";
import { calculateYearlyPhases } from "@/utils/dateUtils";
import { loadStoredArtworks } from "@/services/artworkStorage";
import type { Artwork } from "@/types/artwork";

import "./YearlyGoalSetup.css";

type YearlyGoalSetupProps = {
  onClose: () => void;
  onSaved?: (goal: LongTermGoal) => void;
  initialGoal?: LongTermGoal | null;
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
const MIN_DAYS_PER_PHASE = 7;
const MAX_DAYS_PER_PHASE = 21;
const STORAGE_KEY = "echo-yearly-goal-draft";

type DraftData = {
  step: number;
  daysPerPhase: number;
  title: string;
  description: string;
  phases: Array<{
    index: number;
    goal: string;
    artworkId: number | null;
    note: string;
  }>;
};

function YearlyGoalSetup({
  onClose,
  onSaved,
  initialGoal = null,
}: YearlyGoalSetupProps) {
  const [step, setStep] = useState(1);
  const [daysPerPhase, setDaysPerPhase] = useState(() => {
    if (initialGoal?.daysPerPhase) {
      return Math.max(MIN_DAYS_PER_PHASE, Math.min(MAX_DAYS_PER_PHASE, initialGoal.daysPerPhase));
    }
    // 尝试从暂存数据加载
    const draft = loadDraft();
    return draft?.daysPerPhase ?? 10;
  });
  const [title, setTitle] = useState(() => {
    if (initialGoal?.title) return initialGoal.title;
    const draft = loadDraft();
    return draft?.title ?? "";
  });
  const [description, setDescription] = useState(() => {
    if (initialGoal?.description) return initialGoal.description;
    const draft = loadDraft();
    return draft?.description ?? "";
  });
  const [phases, setPhases] = useState<Array<{
    index: number;
    goal: string;
    artworkId: number | null;
    note: string;
  }>>(() => {
    if (initialGoal?.phases) {
      return initialGoal.phases.map((p) => ({
        index: p.index,
        goal: p.goal ?? "",
        artworkId: p.artworkId,
        note: p.note ?? "",
      }));
    }
    const draft = loadDraft();
    if (draft?.phases) return draft.phases;
    return [];
  });
  const [presets, setPresets] = useState<YearlyGoalPreset[]>([]);
  const [isLoadingPresets, setIsLoadingPresets] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showImageSelector, setShowImageSelector] = useState(false);
  const [selectedPhaseIndex, setSelectedPhaseIndex] = useState<number | null>(null);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [showPresetMenu, setShowPresetMenu] = useState<number | null>(null);
  const hasUnsavedChanges = useRef(false);

  // 计算阶段数据
  const calculatedPhases = useMemo(() => {
    if (daysPerPhase < MIN_DAYS_PER_PHASE || daysPerPhase > MAX_DAYS_PER_PHASE) {
      return [];
    }
    return calculateYearlyPhases(daysPerPhase);
  }, [daysPerPhase]);

  // 初始化阶段数据
  useEffect(() => {
    if (calculatedPhases.length > 0) {
      setPhases((prevPhases) => {
        // 如果阶段数量变化，重新初始化
        if (prevPhases.length !== calculatedPhases.length) {
          return calculatedPhases.map((p) => {
            const existing = prevPhases.find((ep) => ep.index === p.index);
            return existing ?? {
              index: p.index,
              goal: "",
              artworkId: null,
              note: "",
            };
          });
        }
        // 确保所有阶段都存在
        const phaseMap = new Map(prevPhases.map((p) => [p.index, p]));
        return calculatedPhases.map((p) => {
          return phaseMap.get(p.index) ?? {
            index: p.index,
            goal: "",
            artworkId: null,
            note: "",
          };
        });
      });
    }
  }, [calculatedPhases]);

  // 加载预设内容
  useEffect(() => {
    let cancelled = false;
    const loadPresets = async () => {
      try {
        setIsLoadingPresets(true);
        const data = await fetchYearlyGoalPresets();
        if (!cancelled) {
          setPresets(data.sort((a, b) => a.displayOrder - b.displayOrder));
        }
      } catch (error) {
        console.warn("Failed to fetch yearly goal presets", error);
        if (!cancelled) {
          setPresets([]);
        }
      } finally {
        if (!cancelled) {
          setIsLoadingPresets(false);
        }
      }
    };
    loadPresets();
    return () => {
      cancelled = true;
    };
  }, []);

  // 保存暂存数据
  const saveDraft = useCallback(() => {
    try {
      const draft: DraftData = {
        step,
        daysPerPhase,
        title,
        description,
        phases,
      };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
      hasUnsavedChanges.current = false;
    } catch (error) {
      console.warn("Failed to save draft", error);
    }
  }, [step, daysPerPhase, title, description, phases]);

  // 监听数据变化，标记有未保存的更改
  useEffect(() => {
    hasUnsavedChanges.current = true;
  }, [step, daysPerPhase, title, description, phases]);

  // 处理返回按钮
  const handleBack = useCallback(() => {
    if (step > 1) {
      setStep(step - 1);
      return;
    }
    // 第一步时，检查是否有未保存的更改
    if (hasUnsavedChanges.current) {
      setShowExitConfirm(true);
    } else {
      onClose();
    }
  }, [step, onClose]);

  // 处理关闭确认
  const handleExitConfirm = useCallback((save: boolean) => {
    if (save) {
      saveDraft();
    } else {
      clearDraft();
    }
    setShowExitConfirm(false);
    onClose();
  }, [saveDraft, onClose]);

  const daysPerPhaseDigits = useMemo(() => toDigits(daysPerPhase, 2), [daysPerPhase]);

  const handleChangeDaysPerPhaseDigit = (index: number) => (next: number) => {
    setDaysPerPhase((prev) => {
      const updated = clampDaysPerPhase(setDigit(prev, 2, index, next));
      // 如果阶段天数变化，需要重新初始化阶段数据
      return updated;
    });
  };

  const handleNext = () => {
    if (step === 1) {
      // 验证阶段天数
      if (daysPerPhase < MIN_DAYS_PER_PHASE || daysPerPhase > MAX_DAYS_PER_PHASE) {
        setErrorMessage(`阶段天数必须在 ${MIN_DAYS_PER_PHASE} 到 ${MAX_DAYS_PER_PHASE} 天之间`);
        return;
      }
      setStep(2);
    } else if (step === 2) {
      setStep(3);
    }
  };


  const handlePhaseGoalChange = (phaseIndex: number, value: string) => {
    if (value.length > 50) {
      setErrorMessage("阶段目标不能超过50字");
      return;
    }
    setPhases((prev) => {
      const updated = [...prev];
      const phase = updated.find((p) => p.index === phaseIndex);
      if (phase) {
        phase.goal = value.slice(0, 50);
      }
      return updated;
    });
    setErrorMessage(null);
  };

  const handleSelectImage = (phaseIndex: number) => {
    setSelectedPhaseIndex(phaseIndex);
    setShowImageSelector(true);
  };

  const handleImageSelected = (artworkId: number) => {
    if (selectedPhaseIndex !== null) {
      setPhases((prev) => {
        const updated = [...prev];
        const phase = updated.find((p) => p.index === selectedPhaseIndex);
        if (phase) {
          phase.artworkId = artworkId;
        }
        return updated;
      });
    }
    setShowImageSelector(false);
    setSelectedPhaseIndex(null);
  };

  const handleSubmit = async () => {
    setErrorMessage(null);
    setIsSaving(true);

    try {
      // 先创建/更新目标
      const goal = await upsertLongTermGoal({
        goalType: "yearly",
        title: title.trim() || "全年计划",
        description: description.trim(),
        daysPerPhase,
      });

      // 更新每个阶段的数据
      for (const phase of phases) {
        await updateCheckpoint({
          goalId: goal.id,
          goalType: "yearly",
          phaseIndex: phase.index,
          goal: phase.goal,
          uploadId: phase.artworkId,
          note: phase.note,
        });
      }

      // 清除暂存数据
      clearDraft();

      if (onSaved) {
        onSaved(goal);
      } else {
        onClose();
      }
    } catch (error) {
      console.warn("Failed to save yearly goal", error);
      setErrorMessage("保存全年计划失败，请稍后再试。");
    } finally {
      setIsSaving(false);
    }
  };

  const selectedPhase = selectedPhaseIndex !== null
    ? calculatedPhases.find((p) => p.index === selectedPhaseIndex)
    : null;

  return (
    <div className="yearly-goal-setup">
      <div className="yearly-goal-setup__background">
        <div className="yearly-goal-setup__glow yearly-goal-setup__glow--mint" />
        <div className="yearly-goal-setup__glow yearly-goal-setup__glow--brown" />
      </div>

      <div className="yearly-goal-setup__shell">
        <header className="yearly-goal-setup__header">
          <button
            type="button"
            className="yearly-goal-setup__icon-button"
            onClick={handleBack}
            aria-label="返回"
          >
            <MaterialIcon name="arrow_back" />
          </button>
          <h1 className="yearly-goal-setup__title">
            {initialGoal ? "编辑全年计划" : "创建全年计划"}
          </h1>
          <span className="yearly-goal-setup__header-placeholder" />
        </header>

        <div className="yearly-goal-setup__step-indicator">
          <div className={`yearly-goal-setup__step ${step >= 1 ? "yearly-goal-setup__step--active" : ""}`}>
            <span className="yearly-goal-setup__step-number">1</span>
            <span className="yearly-goal-setup__step-label">阶段天数</span>
          </div>
          <div className={`yearly-goal-setup__step ${step >= 2 ? "yearly-goal-setup__step--active" : ""}`}>
            <span className="yearly-goal-setup__step-number">2</span>
            <span className="yearly-goal-setup__step-label">基本信息</span>
          </div>
          <div className={`yearly-goal-setup__step ${step >= 3 ? "yearly-goal-setup__step--active" : ""}`}>
            <span className="yearly-goal-setup__step-number">3</span>
            <span className="yearly-goal-setup__step-label">阶段目标</span>
          </div>
        </div>

        <main className="yearly-goal-setup__main">
          {step === 1 && (
            <section className="yearly-goal-setup__section">
              <h2 className="yearly-goal-setup__section-title">每个阶段的天数</h2>
              <p className="yearly-goal-setup__section-hint">
                全年计划将按照你设置的天数划分为多个阶段，365天会取余，余数将被忽略。
              </p>
              <div className="yearly-goal-setup__digit-row">
                {daysPerPhaseDigits.map((digit, index) => (
                  <DigitColumn
                    key={`days-${index}`}
                    value={digit}
                    size="large"
                    onChange={handleChangeDaysPerPhaseDigit(index)}
                    aria-label={`阶段天数第 ${index + 1} 位数字`}
                  />
                ))}
                <span className="yearly-goal-setup__unit">天</span>
              </div>
              <p className="yearly-goal-setup__hint">
                数值范围：{MIN_DAYS_PER_PHASE} - {MAX_DAYS_PER_PHASE} 天
              </p>
              {calculatedPhases.length > 0 && (
                <p className="yearly-goal-setup__hint">
                  将分为 {calculatedPhases.length} 个阶段
                </p>
              )}
            </section>
          )}

          {step === 2 && (
            <section className="yearly-goal-setup__section">
              <h2 className="yearly-goal-setup__section-title">计划名称</h2>
              <input
                className="yearly-goal-setup__input"
                type="text"
                value={title}
                onChange={(event) => setTitle(event.target.value.slice(0, 160))}
                placeholder="为自己的计划新建画布"
                maxLength={160}
              />
              <h2 className="yearly-goal-setup__section-title" style={{ marginTop: "1.5rem" }}>
                计划简介
              </h2>
              <textarea
                className="yearly-goal-setup__textarea"
                value={description}
                onChange={(event) => setDescription(event.target.value.slice(0, 600))}
                placeholder="给接下来一年的自己一个指北。可以是激励自己的话，或是自己的梦想，抑或只是提醒自己永远不要放弃画画。"
                rows={3}
                maxLength={600}
              />
            </section>
          )}

          {step === 3 && (
            <section className="yearly-goal-setup__section">
              <h2 className="yearly-goal-setup__section-title">设置各阶段目标</h2>
              <p className="yearly-goal-setup__section-hint">
                为每个阶段设置目标（最多50字），可以选择上传该阶段日期范围内的画集图片。
              </p>
              <div className="yearly-goal-setup__phases">
                {phases.map((phase) => {
                  const calculatedPhase = calculatedPhases.find((p) => p.index === phase.index);
                  if (!calculatedPhase) return null;
                  
                  const artworks = loadStoredArtworks();
                  const selectedArtwork = phase.artworkId
                    ? artworks.find((a) => {
                        const numericId = a.id.replace(/^art-/, "");
                        return Number.parseInt(numericId, 10) === phase.artworkId;
                      })
                    : null;

                  return (
                    <div key={phase.index} className="yearly-goal-setup__phase">
                      <div className="yearly-goal-setup__phase-header">
                        <h3 className="yearly-goal-setup__phase-title">
                          阶段 {phase.index}：{calculatedPhase.startDate} 至 {calculatedPhase.endDate}
                        </h3>
                      </div>
                      <div className="yearly-goal-setup__phase-content">
                        <div className="yearly-goal-setup__phase-goal-section">
                          <div className="yearly-goal-setup__phase-goal-header">
                            <label className="yearly-goal-setup__phase-label">阶段目标</label>
                            {!isLoadingPresets && presets.length > 0 && (
                              <div className="yearly-goal-setup__preset-selector">
                                <button
                                  type="button"
                                  className="yearly-goal-setup__preset-button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setShowPresetMenu(showPresetMenu === phase.index ? null : phase.index);
                                  }}
                                >
                                  <MaterialIcon name="add" />
                                </button>
                                {showPresetMenu === phase.index && (
                                  <div className="yearly-goal-setup__preset-menu">
                                    {presets.map((preset) => (
                                      <button
                                        key={preset.id}
                                        type="button"
                                        onClick={() => {
                                          if (window.confirm("使用预设内容将替换当前内容，确定要继续吗？")) {
                                            handlePhaseGoalChange(phase.index, preset.content);
                                          }
                                          setShowPresetMenu(null);
                                        }}
                                      >
                                        {preset.content}
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                          <textarea
                            className="yearly-goal-setup__phase-goal-input"
                            value={phase.goal}
                            onChange={(event) => handlePhaseGoalChange(phase.index, event.target.value)}
                            placeholder="输入阶段目标（最多50字）"
                            maxLength={50}
                            rows={2}
                          />
                          <div className="yearly-goal-setup__phase-goal-count">
                            {phase.goal.length}/50
                          </div>
                        </div>
                        <div className="yearly-goal-setup__phase-image-section">
                          <label className="yearly-goal-setup__phase-label">阶段图片</label>
                          {selectedArtwork ? (
                            <div className="yearly-goal-setup__phase-image-preview">
                              <img
                                src={selectedArtwork.imageSrc}
                                alt={selectedArtwork.title}
                                className="yearly-goal-setup__phase-image"
                              />
                              <button
                                type="button"
                                className="yearly-goal-setup__phase-image-remove"
                                onClick={() => {
                                  setPhases((prev) => {
                                    const updated = [...prev];
                                    const p = updated.find((ep) => ep.index === phase.index);
                                    if (p) {
                                      p.artworkId = null;
                                    }
                                    return updated;
                                  });
                                }}
                              >
                                <MaterialIcon name="close" />
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              className="yearly-goal-setup__phase-image-add"
                              onClick={() => handleSelectImage(phase.index)}
                            >
                              <MaterialIcon name="add_photo_alternate" />
                              <span>选择图片</span>
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {errorMessage && (
            <p className="yearly-goal-setup__error">{errorMessage}</p>
          )}
        </main>

        <footer className="yearly-goal-setup__footer">
          {step < 3 ? (
            <button
              type="button"
              className="yearly-goal-setup__primary"
              onClick={handleNext}
            >
              下一步
            </button>
          ) : (
            <button
              type="button"
              className="yearly-goal-setup__primary"
              onClick={handleSubmit}
              disabled={isSaving}
              aria-busy={isSaving ? "true" : undefined}
            >
              {isSaving ? "保存中..." : "确认计划"}
            </button>
          )}
        </footer>
      </div>

      {showImageSelector && selectedPhase && (
        <YearlyPhaseImageSelector
          startDate={selectedPhase.startDate}
          endDate={selectedPhase.endDate}
          onSelect={handleImageSelected}
          onClose={() => {
            setShowImageSelector(false);
            setSelectedPhaseIndex(null);
          }}
        />
      )}

      {/* 点击外部关闭预设菜单 */}
      {showPresetMenu !== null && (
        <div
          className="yearly-goal-setup__preset-menu-overlay"
          onClick={() => setShowPresetMenu(null)}
        />
      )}

      {showExitConfirm && (
        <div className="yearly-goal-setup__exit-confirm-overlay" onClick={() => setShowExitConfirm(false)}>
          <div className="yearly-goal-setup__exit-confirm" onClick={(e) => e.stopPropagation()}>
            <h3>确认退出</h3>
            <p>您有未保存的更改，是否要暂存当前进度？</p>
            <div className="yearly-goal-setup__exit-confirm-buttons">
              <button
                type="button"
                className="yearly-goal-setup__exit-confirm-button"
                onClick={() => handleExitConfirm(false)}
              >
                不暂存
              </button>
              <button
                type="button"
                className="yearly-goal-setup__exit-confirm-button yearly-goal-setup__exit-confirm-button--primary"
                onClick={() => handleExitConfirm(true)}
              >
                暂存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// DigitColumn组件（复用LongTermGoalSetup的实现）
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

    if (scrollTimeoutRef.current) {
      window.clearTimeout(scrollTimeoutRef.current);
    }

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
      className={`yearly-goal-setup__digit-column yearly-goal-setup__digit-column--${size}${
        readOnly ? " yearly-goal-setup__digit-column--readonly" : ""
      }${isPointerActive ? " yearly-goal-setup__digit-column--pointer" : ""}`}
    >
      <div className="yearly-goal-setup__digit-chrome" />
      <div
        className="yearly-goal-setup__digit-scroll"
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
        <div className="yearly-goal-setup__digit-overlay" />
        <div className="yearly-goal-setup__digit-list">
          {DIGIT_VALUES.map((digit) => (
            <span
              key={digit}
              className={
                digit === value
                  ? "yearly-goal-setup__digit-value yearly-goal-setup__digit-value--active"
                  : "yearly-goal-setup__digit-value"
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

function clampDaysPerPhase(value: number) {
  if (!Number.isFinite(value)) {
    return MIN_DAYS_PER_PHASE;
  }
  return Math.min(Math.max(Math.round(value), MIN_DAYS_PER_PHASE), MAX_DAYS_PER_PHASE);
}

function loadDraft(): DraftData | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }
    return JSON.parse(raw) as DraftData;
  } catch (error) {
    console.warn("Failed to load draft", error);
    return null;
  }
}

function clearDraft() {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.warn("Failed to clear draft", error);
  }
}

export default YearlyGoalSetup;

