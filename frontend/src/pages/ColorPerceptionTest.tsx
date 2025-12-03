import { useState } from "react";

import TopNav from "@/components/TopNav";

import "./ColorPerceptionTest.css";

type ColorPerceptionTestProps = {
  onBack: () => void;
  onComplete?: (result: {
    selectedOptionId: string;
    mainImageUrl: string;
    options: Array<{
      id: string;
      imageUrl: string;
      percentage: number;
    }>;
  }) => void;
};

type ColorOption = {
  id: string;
  label: string;
  imageUrl: string;
  isCorrect?: boolean;
};

function ColorPerceptionTest({ onBack, onComplete }: ColorPerceptionTestProps) {
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [isSubmitted, setIsSubmitted] = useState(false);

  // 示例数据，实际应该从 API 获取
  const testData = {
    title: "每日色感测试",
    description: "从下方选项中选择与图片中标记区域最匹配的颜色",
    date: new Date().toLocaleDateString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }),
    mainImageUrl: "https://lh3.googleusercontent.com/aida-public/AB6AXuCCTFzhFPPkvqBmv-8vODjVHhFKbbnzRd6Qdzo4X2GUQtS1uZwk3ydGR2kNnlP0RWu9kv30EbeUr1WGPLDFQYsx5QfuuHziP3X-KBPTgtQENjb-Wiig3UQ7x3FlrGijssw1aeZjJoiWdVprdyssn8S3YQZpcBJGbWFP787SrFnUzvakpfj0yrIdjey5EkNJEyIMr6cNIdqbysBtljMl21Uh7NVcug9maPEARocfYt5HlLUJAJEjApdtGHHRclLSyHk03vsmfB6sdijV",
    markerPosition: { top: "35%", left: "45%" },
    options: [
      {
        id: "A",
        label: "A",
        imageUrl: "https://lh3.googleusercontent.com/aida-public/AB6AXuAnH534NougXPj0_qdELVsvz20mLeF2w4gYdjmfDaBqY_q-Nm25KpHhOMINeP4pTJMB7UQaG_-M5uTu1C4zLvEPQ68GpgHjyGqcW_GKGOC5JMK8DKqgfuPDmPKhPhyiKqo1lqi45Tfxg_UJy510TO1bFrJjOo1QglG7jsQCdO-7CLwYN5N46BV2LIqzDPjg6mXm-kSZmVqV8-PCBo6lzvbTZiZmAQy_IxHBq4lZPzOXSLMrpny1-xIvoaMptm5Yt4Cw08xojIV17Gy_",
        isCorrect: false,
      },
      {
        id: "B",
        label: "B",
        imageUrl: "https://lh3.googleusercontent.com/aida-public/AB6AXuC131DSmpcGM4FL7h66Fg6Wcf4PiboFuProK5AUZED32m3Jfz0N-bOmaFLrSyYTSx7ygeUdYtIg2dMyDMPs5VN1lhK8vqg2ysRBP2hf9-UDtFbZG81ZLIIT_IsWCuUnZtVdJfYh5tuLv_8kJ_tN7m4eu6i_Ru8CNUUs3lrHn6SFgvdMYkXlTx3uV0EWd5jxKb_1Kwxeyloo8X8Di9c-__sf26kgvmOZ9nBNHCxfuzg0dJrD2PkWbiivQ3oJYt_SYIFF92IpmO1_PuuK",
        isCorrect: true,
      },
      {
        id: "C",
        label: "C",
        imageUrl: "https://lh3.googleusercontent.com/aida-public/AB6AXuASJL-Vs2uflYMhrdTkaivS7tzp9x6urmg1Gx9Lb-YCULbEbFq5ncoMiSyNYHC6_oqXq1qV5gozEjUtrZjrZcakr7YFGW-lGXeCtBgH4qUTRlz3GyoYC1obcSY1AcekcslHRbuP2Q6WD7dMGaCbVmix2iaxeXez1FGQzuMG5DUrN3BpMe6_cg9YvRbV7GIzNiL8gebhvuICb_DmocmCiVLZb2H5SnMFQAwm-iF_6Zwn-9kdciG5h2juSGNhK_rI9B7Bas4KrDHfkqdI",
        isCorrect: false,
      },
      {
        id: "D",
        label: "D",
        imageUrl: "https://lh3.googleusercontent.com/aida-public/AB6AXuBJ5lkBmahZIXWaPWLWsa91HaxgDPaRKz3PQdZWgkaPc9R8P4CqaAKAObQ2nKmsRWN4ontOu0eq3abyGq50RFqgrRAhzfBeo0GISDw9fsBP7E7ifNykRi-eIL0FVrIe03iX_Zd2vDeiNA27YBGClKkpEIcnM1Ec9sflle4ILj2SJcM1wc-qq-YVDyJP4OzDJCuNTYSFKv3cAZDMbKY9j0ikZ7AL1pcJvDtFNIiu6rzacje_s2FsUVcm7vY4NFpE8u567T7tbeLY4kCV",
        isCorrect: false,
      },
    ] as ColorOption[],
  };

  const handleOptionClick = (optionId: string) => {
    if (isSubmitted) {
      return;
    }
    setSelectedOption(optionId);
  };

  const handleSubmit = () => {
    if (!selectedOption) {
      return;
    }
    setIsSubmitted(true);
    
    // 模拟统计数据（实际应该从后端获取）
    const resultData = {
      selectedOptionId: selectedOption,
      mainImageUrl: testData.mainImageUrl,
      options: [
        {
          id: "A",
          imageUrl: testData.options[0].imageUrl,
          percentage: 35,
        },
        {
          id: "B",
          imageUrl: testData.options[1].imageUrl,
          percentage: 25,
        },
        {
          id: "C",
          imageUrl: testData.options[2].imageUrl,
          percentage: 28,
        },
        {
          id: "D",
          imageUrl: testData.options[3].imageUrl,
          percentage: 12,
        },
      ],
    };

    // 延迟一下再跳转，让用户看到反馈
    setTimeout(() => {
      onComplete?.(resultData);
    }, 500);
  };

  return (
    <div className="color-perception-test">
      <div className="color-perception-test__background">
        <div className="color-perception-test__glow color-perception-test__glow--primary" />
        <div className="color-perception-test__glow color-perception-test__glow--secondary" />
        <div className="color-perception-test__glow color-perception-test__glow--tertiary" />
      </div>

      <TopNav
        className="top-nav--fixed top-nav--flush"
        leadingAction={{
          icon: "arrow_back",
          label: "返回",
          onClick: onBack,
        }}
        title="每日色感测试"
      />

      <div className="color-perception-test__content">
        <div className="color-perception-test__header">
          <h1 className="color-perception-test__title">{testData.title}</h1>
          <p className="color-perception-test__description">{testData.description}</p>
          <p className="color-perception-test__date">{testData.date}</p>
        </div>

        <div className="color-perception-test__main-section">
          <div className="color-perception-test__main-image-container">
            <div
              className="color-perception-test__main-image"
              style={{
                backgroundImage: `url('${testData.mainImageUrl}')`,
              }}
            />
            <div
              className="color-perception-test__marker"
              style={{
                top: testData.markerPosition.top,
                left: testData.markerPosition.left,
              }}
            />
          </div>

          <div className="color-perception-test__options">
            {testData.options.map((option) => {
              const isSelected = selectedOption === option.id;
              const showCorrect = isSubmitted && option.isCorrect;
              const showIncorrect = isSubmitted && isSelected && !option.isCorrect;

              return (
                <button
                  key={option.id}
                  type="button"
                  className={`color-perception-test__option ${isSelected ? "color-perception-test__option--selected" : ""} ${showCorrect ? "color-perception-test__option--correct" : ""} ${showIncorrect ? "color-perception-test__option--incorrect" : ""}`}
                  onClick={() => handleOptionClick(option.id)}
                  disabled={isSubmitted}
                >
                  <div
                    className="color-perception-test__option-image"
                    style={{
                      backgroundImage: `url('${option.imageUrl}')`,
                      backgroundPosition: "45% 35%",
                    }}
                  />
                  <span
                    className={`color-perception-test__option-label ${isSelected ? "color-perception-test__option-label--selected" : ""}`}
                  >
                    {option.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="color-perception-test__actions">
          <button
            type="button"
            className="color-perception-test__submit-button"
            onClick={handleSubmit}
            disabled={!selectedOption || isSubmitted}
          >
            {isSubmitted ? "已提交" : "提交答案"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ColorPerceptionTest;

