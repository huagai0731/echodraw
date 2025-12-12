import { useState } from "react";
import MaterialIcon from "@/components/MaterialIcon";
import type { LongTermGoal } from "@/services/api";
import "./LongTermGoalTypeSelector.css";

type LongTermGoalType = "10000-hours" | "3-months" | "yearly";

type LongTermGoalTypeSelectorProps = {
  onClose: () => void;
  onSelect: (type: LongTermGoalType) => void;
  existingGoals: LongTermGoal[];
};

const GOAL_TYPES: Array<{
  id: LongTermGoalType;
  title: string;
  description: string;
  icon: string;
}> = [
  {
    id: "10000-hours",
    title: "一万小时定律",
    description: "通过累计画作小时数来达成长期目标",
    icon: "schedule",
  },
  {
    id: "3-months",
    title: "3个月学习法",
    description: "使用戴明环理论进行系统性练习",
    icon: "loop",
  },
  {
    id: "yearly",
    title: "全年计划",
    description: "制定年度创作计划与目标",
    icon: "calendar_month",
  },
];

function LongTermGoalTypeSelector({
  onClose,
  onSelect,
  existingGoals,
}: LongTermGoalTypeSelectorProps) {
  const existingTypes = new Set(
    existingGoals.map((goal) => goal.goalType).filter(Boolean)
  );

  return (
    <div className="long-term-type-selector">
      <div className="long-term-type-selector__background">
        <div className="long-term-type-selector__glow long-term-type-selector__glow--mint" />
        <div className="long-term-type-selector__glow long-term-type-selector__glow--brown" />
      </div>

      <div className="long-term-type-selector__shell">
        <header className="long-term-type-selector__header">
          <button
            type="button"
            className="long-term-type-selector__icon-button"
            onClick={onClose}
            aria-label="返回"
          >
            <MaterialIcon name="arrow_back" />
          </button>
          <h1 className="long-term-type-selector__title">选择长期目标类型</h1>
          <span className="long-term-type-selector__header-placeholder" />
        </header>

        <main className="long-term-type-selector__main">
          <div className="long-term-type-selector__grid">
            {GOAL_TYPES.map((type) => {
              const isDisabled = existingTypes.has(type.id);
              return (
                <button
                  key={type.id}
                  type="button"
                  className={`long-term-type-selector__card ${
                    isDisabled ? "long-term-type-selector__card--disabled" : ""
                  }`}
                  onClick={() => {
                    if (!isDisabled) {
                      onSelect(type.id);
                    }
                  }}
                  disabled={isDisabled}
                  aria-label={type.title}
                >
                  <div className="long-term-type-selector__card-icon">
                    <MaterialIcon name={type.icon} />
                  </div>
                  <h2 className="long-term-type-selector__card-title">
                    {type.title}
                  </h2>
                  <p className="long-term-type-selector__card-description">
                    {type.description}
                  </p>
                  {isDisabled && (
                    <div className="long-term-type-selector__card-badge">
                      已有进行中的目标
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </main>
      </div>
    </div>
  );
}

export default LongTermGoalTypeSelector;

