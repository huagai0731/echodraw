import { useState } from "react";

import TopNav from "@/components/TopNav";

import "./MentalStateAssessment.css";

type MentalStateAssessmentProps = {
  onBack: () => void;
};

function MentalStateAssessment({ onBack }: MentalStateAssessmentProps) {
  const [selectedValue, setSelectedValue] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState(1);
  const totalSteps = 6;

  const handleRadioChange = (value: string) => {
    setSelectedValue(value);
  };

  const handleNext = () => {
    if (currentStep < totalSteps) {
      setCurrentStep(currentStep + 1);
      setSelectedValue(null);
    }
  };

  const handlePrev = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
      setSelectedValue(null);
    }
  };

  const circleColors = [
    { color: "#87D7D8", bgColor: "rgba(135, 215, 216, 0.1)", shadowColor: "rgba(135, 215, 216, 0.5)", size: "4rem", innerSize: "0.75rem" },
    { color: "#91D9CF", bgColor: "rgba(145, 217, 207, 0.1)", shadowColor: "rgba(145, 217, 207, 0.5)", size: "3.5rem", innerSize: "0.625rem" },
    { color: "#98DBC6", bgColor: "rgba(152, 219, 198, 0.1)", shadowColor: "rgba(152, 219, 198, 0.5)", size: "3rem", innerSize: "0.5rem" },
    { color: "#A1DDC0", bgColor: "rgba(161, 221, 192, 0.1)", shadowColor: "rgba(161, 221, 192, 0.5)", size: "3.5rem", innerSize: "0.625rem" },
    { color: "#ADDEBA", bgColor: "rgba(173, 222, 186, 0.1)", shadowColor: "rgba(173, 222, 186, 0.5)", size: "4rem", innerSize: "0.75rem" },
  ];

  return (
    <div className="mental-state-assessment">
      <div className="mental-state-assessment__background">
        <div className="mental-state-assessment__glow mental-state-assessment__glow--primary" />
        <div className="mental-state-assessment__glow mental-state-assessment__glow--secondary" />
        <div className="mental-state-assessment__glow mental-state-assessment__glow--tertiary" />
        <div className="mental-state-assessment__glow mental-state-assessment__glow--line" />
      </div>

      <TopNav
        className="top-nav--fixed top-nav--flush"
        leadingAction={{
          icon: "arrow_back",
          label: "返回",
          onClick: onBack,
        }}
        title="心境评估"
      />

      <div className="mental-state-assessment__content">
        <div className="mental-state-assessment__progress-container">
          <div className="mental-state-assessment__progress-bar">
            {Array.from({ length: totalSteps }).map((_, index) => {
              const stepNumber = index + 1;
              const isCompleted = stepNumber <= currentStep;
              return (
                <div
                  key={stepNumber}
                  className={`mental-state-assessment__progress-segment ${
                    isCompleted ? "mental-state-assessment__progress-segment--active" : ""
                  }`}
                />
              );
            })}
          </div>
        </div>

        <div className="mental-state-assessment__main">
          <p className="mental-state-assessment__question">
            你准备开始今天的绘画，
            <br />
            却不知道先画什么：
          </p>

          <div className="mental-state-assessment__radio-group">
            {circleColors.map((circle, index) => {
              const value = `option-${index + 1}`;
              const isSelected = selectedValue === value;
              const labels = ["非常同意", "比较同意", "中立", "比较不同意", "非常不同意"];
              return (
                <label
                  key={value}
                  className={`mental-state-assessment__radio-label ${isSelected ? "mental-state-assessment__radio-label--selected" : ""}`}
                  style={{ "--circle-color": circle.color } as React.CSSProperties}
                >
                  <input
                    type="radio"
                    name="assessment-radio"
                    value={value}
                    checked={isSelected}
                    onChange={() => handleRadioChange(value)}
                    className="mental-state-assessment__radio-input"
                  />
                  <div
                    className="mental-state-assessment__radio-circle-outer"
                    style={
                      isSelected
                        ? {
                            width: circle.size,
                            height: circle.size,
                            borderColor: circle.color,
                            backgroundColor: circle.bgColor,
                            boxShadow: `0 0 15px ${circle.shadowColor}`,
                          }
                        : {
                            width: circle.size,
                            height: circle.size,
                          }
                    }
                  >
                    <div
                      className="mental-state-assessment__radio-circle-inner"
                      style={
                        isSelected
                          ? {
                              width: circle.innerSize,
                              height: circle.innerSize,
                              transform: "scale(1)",
                              backgroundColor: circle.color,
                            }
                          : {
                              width: circle.innerSize,
                              height: circle.innerSize,
                            }
                      }
                    />
                  </div>
                  <span className="mental-state-assessment__label-text">
                    {labels[index]}
                  </span>
                </label>
              );
            })}
          </div>
        </div>

        <div className="mental-state-assessment__actions">
          <button
            type="button"
            className="mental-state-assessment__button mental-state-assessment__button--secondary"
            onClick={handlePrev}
            disabled={currentStep === 1}
          >
            上一题
          </button>
          <button
            type="button"
            className="mental-state-assessment__button mental-state-assessment__button--primary"
            onClick={handleNext}
            disabled={currentStep === totalSteps || !selectedValue}
          >
            下一题
          </button>
        </div>
      </div>
    </div>
  );
}

export default MentalStateAssessment;

