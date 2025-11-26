import { useEffect, useState } from "react";
import { isAxiosError } from "axios";

import TopNav from "@/components/TopNav";
import { fetchUserTestDetail, submitTestAnswer, type UserTestDetail, type UserTestQuestion } from "@/services/api";

import "./TestTaking.css";

type TestTakingProps = {
  testId: number;
  onBack: () => void;
  onComplete: (resultId: number) => void;
};

function TestTaking({ testId, onBack, onComplete }: TestTakingProps) {
  const [test, setTest] = useState<UserTestDetail | null>(null);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string | number>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadTest = async () => {
      try {
        setLoading(true);
        setError(null);
        const testData = await fetchUserTestDetail(testId);
        setTest(testData);
      } catch (err) {
        console.error("[TestTaking] Failed to load test:", err);
        if (isAxiosError(err)) {
          setError("加载测试失败，请稍后重试");
        } else {
          setError("加载测试失败");
        }
      } finally {
        setLoading(false);
      }
    };

    loadTest();
  }, [testId]);

  const currentQuestion = test?.questions[currentQuestionIndex];
  const totalQuestions = test?.questions.length || 0;
  const progress = totalQuestions > 0 ? ((currentQuestionIndex + 1) / totalQuestions) * 100 : 0;

  const handleAnswer = (value: string | number) => {
    if (!currentQuestion) return;
    
    setAnswers((prev) => ({
      ...prev,
      [String(currentQuestion.id)]: value,
    }));
  };

  const handleNext = () => {
    if (currentQuestionIndex < totalQuestions - 1) {
      setCurrentQuestionIndex(currentQuestionIndex + 1);
    }
  };

  const handlePrev = () => {
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex(currentQuestionIndex - 1);
    }
  };

  const handleSubmit = async () => {
    if (!test) return;
    
    // 检查是否所有题目都已回答
    // 注意：答案可能是0（中立），所以不能直接用!answers[key]判断
    const unansweredQuestions = test.questions.filter(
      (q) => answers[String(q.id)] === undefined || answers[String(q.id)] === null || answers[String(q.id)] === ""
    );
    
    if (unansweredQuestions.length > 0) {
      // 显示未答题的题号
      const unansweredNumbers = unansweredQuestions
        .map((q) => {
          const questionIndex = test.questions.findIndex((tq) => tq.id === q.id);
          return questionIndex + 1; // 题号从1开始
        })
        .sort((a, b) => a - b);
      
      const questionNumbersText = unansweredNumbers.join("、");
      setError(`以下题目未完成，请完成后再提交：第 ${questionNumbersText} 题`);
      return;
    }

    try {
      setSubmitting(true);
      setError(null);
      
      const result = await submitTestAnswer({
        test_id: test.id,
        answers,
      });
      
      onComplete(result.id);
    } catch (err) {
      console.error("[TestTaking] Failed to submit test:", err);
      if (isAxiosError(err)) {
        const detail = err.response?.data?.detail;
        setError(typeof detail === "string" ? detail : "提交失败，请稍后重试");
      } else {
        setError("提交失败");
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="test-taking">
        <TopNav
          className="top-nav--fixed top-nav--flush"
          leadingAction={{
            icon: "arrow_back",
            label: "返回",
            onClick: onBack,
          }}
          title="测试中"
        />
        <div className="test-taking__loading">加载中...</div>
      </div>
    );
  }

  if (error && !test) {
    return (
      <div className="test-taking">
        <TopNav
          className="top-nav--fixed top-nav--flush"
          leadingAction={{
            icon: "arrow_back",
            label: "返回",
            onClick: onBack,
          }}
          title="测试中"
        />
        <div className="test-taking__error">{error}</div>
      </div>
    );
  }

  if (!test || !currentQuestion) {
    return null;
  }

  const currentAnswer = answers[String(currentQuestion.id)];
  const isLastQuestion = currentQuestionIndex === totalQuestions - 1;
  // 注意：答案可能是0（中立），所以需要明确检查undefined和null
  const canProceed = currentAnswer !== undefined && currentAnswer !== null && currentAnswer !== "";

  return (
    <div className="test-taking">
      <TopNav
        className="top-nav--fixed top-nav--flush"
        leadingAction={{
          icon: "arrow_back",
          label: "返回",
          onClick: onBack,
        }}
        title={test.name}
      />

      <div className="test-taking__content">
        <div className="test-taking__progress">
          <div className="test-taking__progress-bar">
            <div
              className="test-taking__progress-fill"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="test-taking__progress-text">
            {currentQuestionIndex + 1} / {totalQuestions}
          </div>
        </div>

        <div className="test-taking__question">
          <p className="test-taking__question-text">{currentQuestion.question_text}</p>

          {test.test_type === "type_1" ? (
            <Type1Question
              question={currentQuestion}
              value={currentAnswer as number | undefined}
              onChange={handleAnswer}
            />
          ) : (
            <Type2Question
              question={currentQuestion}
              value={currentAnswer as string | undefined}
              onChange={handleAnswer}
            />
          )}
        </div>

        {error && <div className="test-taking__error-message">{error}</div>}

        <div className="test-taking__actions">
          <button
            type="button"
            className="test-taking__button test-taking__button--secondary"
            onClick={handlePrev}
            disabled={currentQuestionIndex === 0}
          >
            上一题
          </button>
          {isLastQuestion ? (
            <button
              type="button"
              className="test-taking__button test-taking__button--primary"
              onClick={handleSubmit}
              disabled={!canProceed || submitting}
            >
              {submitting ? "提交中..." : "提交测试"}
            </button>
          ) : (
            <button
              type="button"
              className="test-taking__button test-taking__button--primary"
              onClick={handleNext}
              disabled={!canProceed}
            >
              下一题
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

type Type1QuestionProps = {
  question: UserTestQuestion;
  value: number | undefined;
  onChange: (value: number) => void;
};

function Type1Question({ question, value, onChange }: Type1QuestionProps) {
  const options = [
    { label: "非常同意", score: -2 },
    { label: "比较同意", score: -1 },
    { label: "中立", score: 0 },
    { label: "比较不同意", score: 1 },
    { label: "非常不同意", score: 2 },
  ];

  const circleColors = [
    { color: "#87D7D8", bgColor: "rgba(135, 215, 216, 0.1)", shadowColor: "rgba(135, 215, 216, 0.5)", size: "4rem", innerSize: "0.75rem" },
    { color: "#91D9CF", bgColor: "rgba(145, 217, 207, 0.1)", shadowColor: "rgba(145, 217, 207, 0.5)", size: "3.5rem", innerSize: "0.625rem" },
    { color: "#98DBC6", bgColor: "rgba(152, 219, 198, 0.1)", shadowColor: "rgba(152, 219, 198, 0.5)", size: "3rem", innerSize: "0.5rem" },
    { color: "#A1DDC0", bgColor: "rgba(161, 221, 192, 0.1)", shadowColor: "rgba(161, 221, 192, 0.5)", size: "3.5rem", innerSize: "0.625rem" },
    { color: "#ADDEBA", bgColor: "rgba(173, 222, 186, 0.1)", shadowColor: "rgba(173, 222, 186, 0.5)", size: "4rem", innerSize: "0.75rem" },
  ];

  return (
    <div className="test-taking__radio-group">
      {options.map((option, index) => {
        const isSelected = value === option.score;
        const circle = circleColors[index];
        return (
          <label
            key={option.score}
            className={`test-taking__radio-label ${isSelected ? "test-taking__radio-label--selected" : ""}`}
            style={{ "--circle-color": circle.color } as React.CSSProperties}
          >
            <input
              type="radio"
              name={`question-${question.id}`}
              value={option.score}
              checked={isSelected}
              onChange={() => onChange(option.score)}
              className="test-taking__radio-input"
            />
            <div
              className="test-taking__radio-circle-outer"
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
                className="test-taking__radio-circle-inner"
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
            <span className="test-taking__label-text">{option.label}</span>
          </label>
        );
      })}
    </div>
  );
}

type Type2QuestionProps = {
  question: UserTestQuestion;
  value: string | undefined;
  onChange: (value: string) => void;
};

function Type2Question({ question, value, onChange }: Type2QuestionProps) {
  return (
    <div className="test-taking__options">
      {question.option_texts.map((optionText) => {
        const isSelected = value === String(optionText.id);
        return (
          <label
            key={optionText.id}
            className={`test-taking__option ${isSelected ? "test-taking__option--selected" : ""}`}
          >
            <input
              type="radio"
              name={`question-${question.id}`}
              value={String(optionText.id)}
              checked={isSelected}
              onChange={() => onChange(String(optionText.id))}
              className="test-taking__option-input"
            />
            <span className="test-taking__option-text">{optionText.text}</span>
          </label>
        );
      })}
    </div>
  );
}

export default TestTaking;

