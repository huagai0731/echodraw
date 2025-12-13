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
import "./ThreeMonthsRoundSetup.css";

type ThreeMonthsRoundSetupProps = {
  onClose: () => void;
  onConfirm: (rounds: number) => void;
  initialRounds?: number;
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
const MIN_ROUNDS = 2;
const MAX_ROUNDS = 60;

function ThreeMonthsRoundSetup({ onClose, onConfirm, initialRounds }: ThreeMonthsRoundSetupProps) {
  const [step, setStep] = useState(1);
  const [rounds, setRounds] = useState(initialRounds ?? 12);
  const [isConfirming, setIsConfirming] = useState(false);

  // 当initialRounds变化时，更新rounds
  useEffect(() => {
    if (initialRounds !== undefined) {
      setRounds(initialRounds);
    }
  }, [initialRounds]);

  const handleNext = () => {
    if (step === 1) {
      setStep(2);
    }
  };

  const handleBack = () => {
    if (step > 1) {
      setStep(step - 1);
    } else {
      onClose();
    }
  };

  const roundsDigits = useMemo(() => toDigits(rounds, 2), [rounds]);

  const handleChangeRoundDigit = (index: number) => (next: number) => {
    setRounds((prev) => clampRounds(setDigit(prev, 2, index, next)));
  };

  const handleConfirm = () => {
    setIsConfirming(true);
    onConfirm(rounds);
  };

  return (
    <div className="three-months-round-setup">
      <div className="three-months-round-setup__background">
        <div className="three-months-round-setup__glow three-months-round-setup__glow--mint" />
        <div className="three-months-round-setup__glow three-months-round-setup__glow--brown" />
      </div>

      <div className="three-months-round-setup__shell">
        <header className="three-months-round-setup__header">
          <button
            type="button"
            className="three-months-round-setup__icon-button"
            onClick={handleBack}
            aria-label="返回"
          >
            <MaterialIcon name="arrow_back" />
          </button>
          <h1 className="three-months-round-setup__title">3个月学习法</h1>
          <span className="three-months-round-setup__header-placeholder" />
        </header>

        <div className="three-months-round-setup__step-indicator">
          <span
            className={
              step >= 1
                ? "three-months-round-setup__step three-months-round-setup__step--active"
                : "three-months-round-setup__step"
            }
          />
          <span
            className={
              step >= 2
                ? "three-months-round-setup__step three-months-round-setup__step--active"
                : "three-months-round-setup__step"
            }
          />
        </div>

        <main className="three-months-round-setup__main">
          {step === 1 ? (
            <section className="three-months-round-setup__section">
              <div className="three-months-round-setup__intro-content">
                <div className="three-months-round-setup__icon-wrapper">
                  <MaterialIcon name="loop" />
                </div>
                <h2 className="three-months-round-setup__section-title">斋藤直葵老师的三个月学习法</h2>
                <div className="three-months-round-setup__intro-text">
                  <p>
                    斋藤直葵老师提出的三个月学习法，是一种系统性的绘画练习方法。
                    通过持续三个月的循环练习，帮助画师建立稳定的创作节奏和进步轨迹。
                  </p>
                  <p>
                    这个方法强调的不是速度，而是持续性和系统性。
                    每天坚持练习，三个月后你会看到明显的进步。
                  </p>
                </div>
                <div className="three-months-round-setup__icon-wrapper" style={{ marginTop: "2rem" }}>
                  <MaterialIcon name="autorenew" />
                </div>
                <h2 className="three-months-round-setup__section-title">戴明环理论（PDCA）</h2>
                <div className="three-months-round-setup__intro-text">
                  <p>
                    3个月学习法基于戴明环（PDCA循环）理论：
                  </p>
                  <ul className="three-months-round-setup__list">
                    <li>
                      <strong>PLAN（计划）</strong>：制定练习计划，明确要练习的内容和目标
                    </li>
                    <li>
                      <strong>DO（执行）</strong>：按照计划进行练习，完成作品
                    </li>
                    <li>
                      <strong>CHECK（检查）</strong>：对比计划与实际，找出差异和问题
                    </li>
                    <li>
                      <strong>ACTION（改进）</strong>：总结经验教训，改进下一轮练习
                    </li>
                  </ul>
                  <p>
                    通过不断循环这四个步骤，你的绘画技能会在三个月内得到系统性的提升。
                  </p>
                </div>
              </div>
            </section>
          ) : (
            <section className="three-months-round-setup__section">
              <h2 className="three-months-round-setup__section-title">期望完成轮数</h2>
              <p className="three-months-round-setup__section-hint">
                在3个月内，你希望完成多少轮PDCA循环练习？
              </p>
              <div className="three-months-round-setup__digit-row">
                {roundsDigits.map((digit, index) => (
                  <DigitColumn
                    key={`rounds-${index}`}
                    value={digit}
                    size="large"
                    onChange={handleChangeRoundDigit(index)}
                    aria-label={`轮数第 ${index + 1} 位数字`}
                  />
                ))}
                <span className="three-months-round-setup__unit">轮</span>
              </div>
              <p className="three-months-round-setup__hint">数值范围：{MIN_ROUNDS} - {MAX_ROUNDS} 轮</p>
            </section>
          )}
        </main>

        <footer className="three-months-round-setup__footer">
          {step === 1 ? (
            <button
              type="button"
              className="three-months-round-setup__primary"
              onClick={handleNext}
            >
              下一步
            </button>
          ) : (
            <button
              type="button"
              className="three-months-round-setup__primary"
              onClick={handleConfirm}
              disabled={isConfirming}
              aria-busy={isConfirming ? "true" : undefined}
            >
              {isConfirming ? "确认中..." : "确认"}
            </button>
          )}
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
      // digit-list有padding-top = height * 0.5，所以需要加上这个padding
      const paddingTop = height * 0.5;
      const target = value * height + paddingTop;
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

    // digit-list有padding-top = height * 0.5，最大scrollTop需要考虑padding
    const paddingTop = height * 0.5;
    const maxTop = height * (DIGIT_VALUES.length - 1) + paddingTop;
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
      // digit-list有padding-top = height * 0.5，需要减去这个padding
      const paddingTop = height * 0.5;
      const raw = (currentScrollTop - paddingTop) / height;
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
      className={`three-months-round-setup__digit-column three-months-round-setup__digit-column--${size}${
        readOnly ? " three-months-round-setup__digit-column--readonly" : ""
      }${isPointerActive ? " three-months-round-setup__digit-column--pointer" : ""}`}
    >
      <div className="three-months-round-setup__digit-chrome" />
      <div
        className="three-months-round-setup__digit-scroll"
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
        <div className="three-months-round-setup__digit-overlay" />
        <div className="three-months-round-setup__digit-list">
          {DIGIT_VALUES.map((digit) => (
            <span
              key={digit}
              className={
                digit === value
                  ? "three-months-round-setup__digit-value three-months-round-setup__digit-value--active"
                  : "three-months-round-setup__digit-value"
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

function clampRounds(value: number) {
  if (!Number.isFinite(value)) {
    return MIN_ROUNDS;
  }
  return Math.min(Math.max(Math.round(value), MIN_ROUNDS), MAX_ROUNDS);
}

export default ThreeMonthsRoundSetup;

