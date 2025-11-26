import "./ColorTestResults.css";

type ColorTestResultsProps = {
  onBack: () => void;
  onNext?: () => void;
  testData?: {
    mainImageUrl: string;
    selectedOptionId: string;
    options: Array<{
      id: string;
      imageUrl: string;
      percentage: number;
    }>;
  };
};

function ColorTestResults({ onBack, onNext, testData }: ColorTestResultsProps) {
  // 默认数据，实际应该从 props 传入
  const defaultData = {
    mainImageUrl: "https://lh3.googleusercontent.com/aida-public/AB6AXuCSr98CILDG76AWcXUdSrZP26_ciLaUAo_d1NZh_dEmARlvMuFVDbuOgZ2Y5c4lYDuyokoj54d9ALdpWbnigbdB61heyC4NCakBoB6NbNUk42o53SsSpBr51b1-yOf1zIrm0Fk_VyY-eqQxdHIe9B9x7snn_0_e0ruN5-N8uzfHM3ZRCgWcd5aWl3W6qPfdGKV7vASq8O0NmJYSdsf_OuNk2byZvJav7fkykifNJNsyQv1R5PuiHbLVRAnCcUwZuh_7whqGQj_sh0lc",
    selectedOptionId: "A",
    options: [
      {
        id: "A",
        imageUrl: "https://lh3.googleusercontent.com/aida-public/AB6AXuD0DoaUkgPsttj1Z6lJPDJlpVU9BdOxDOZ4wTjun_PwIGxgy2xLMqtILR3hd_KKXRcFBzxc-ZEgZ2UtmSzxJwXDuDq1j2YKbbu-P051b9Kqhe9CS9oF3OLG9lPx1J7jgmbmFxPZA7piDQ2MHv7nbUrv2WRgutGW1zeMKZYP-KAC_DMlAnhW0kKU9asJKUsjF0ynTSRrsByXJjWBNfZ79xVUOC2UxMAzu8cA7GN2-GH2KxhpOnAojQyaJpTtvj43zfyYb8JD0ZmjgSXR",
        percentage: 35,
      },
      {
        id: "B",
        imageUrl: "https://lh3.googleusercontent.com/aida-public/AB6AXuCFtbWWw0qMdn8R3K6_5q1yitIqu-zoWATBsHspGyEbC7JK_z9kM0-BRgJ9ntsIFYefjpIAOcTiVixQPytUukN7IfffbNwLCyBWHm6DENxVWEMyg_iC8ljzCsuvbMJemrB2nVjJSoJvvrXJ4fBcnxLZk6SQfXPQ9jq6oV60pIa5u0KWehbvfAsd8GhqX_XEzJzlF_M7xQ3Z7Qds52tdEcr1VJjwS1mM5q8EL7nS7wEVd9gcpU9da2xVoi2mwcojsWloZLJ4IsNwsUUU",
        percentage: 25,
      },
      {
        id: "C",
        imageUrl: "https://lh3.googleusercontent.com/aida-public/AB6AXuBZNsP-XBqcE3IEBaJwtwK2hNXkN_F_Q1yltAjSzTjcjcS9taw3fpcehy_ggrgxRXLPk5s4nQdZgR8ZFCbRUsQMsR6EPw_VjqzDchDht7_aTZkLuI8Oz7pmpGnxinK4D9Ke8uG42uSwZVBVlFs7BfmlUZCm_4dcp7QvdMpLhc2qZJzC1OfZfrxJHswEOzswOBG2YXAkyyJiNKNVf6vcbl8Niy9BdZoea47wVtBkWAljHDgnwmfcODxlmOp4YtAjfG4RiSc51NCGj7MZ",
        percentage: 28,
      },
      {
        id: "D",
        imageUrl: "https://lh3.googleusercontent.com/aida-public/AB6AXuCUjP5x2oKshANq__3-9IUC2hHBhvdoxc94DPSLVwybj5-Kc_q9UcXuztU43BCetQoBsqWdV1dd2HihsRqjqWeDFlwMVUATwGZctBrZt2exB4w-82QB7DKa8lztioWR2FjvVlcg97LMKUwUTlMlcZKttjtIi_4GPFlgOTv3rz0s3Tlur1m-eAb9nX3-sE3Ty-l0XmHlAmBpTMh068SgZRWAYjcb7HVilzcsmbjL4_1xj0HdvVqZ0up6HYUIQINoQQ6xxRF-WXPkIvvJ",
        percentage: 12,
      },
    ],
  };

  const data = testData || defaultData;

  const handleNext = () => {
    if (onNext) {
      onNext();
    } else {
      onBack();
    }
  };

  return (
    <div className="color-test-results">
      <div
        className="color-test-results__background"
        style={{
          backgroundImage: `url('https://lh3.googleusercontent.com/aida-public/AB6AXuAPE3NCh-887b5m7dGrl2xrrawyef2-PMcqbv-Ppipm-3lfbAxVOeJlqTSkTRc9KISU3CHIU25ICj3480Dx8V68BnsSdGBpJsPcRq_bmIc7YSk4rTxJ5V67XOYpit9guMzboMHJucjvkZhvLrM34ZZmFBw8fPbPOG-1p0Xnvaw3tH8Z9Jyh141Z5hFVgTAihIJsV8EYIGjKLdZ2nl-AkvS5Papk3K8RwxThbt7wGRvI1arKfkPfgapIbiTtkCJoRkr0Tc4tw4NOV9RG')`,
        }}
      >
        <div className="color-test-results__background-overlay" />
      </div>

      <div className="color-test-results__glow" />

      <div className="color-test-results__container">
        <div className="color-test-results__handle">
          <div className="color-test-results__handle-bar" />
        </div>

        <div className="color-test-results__content">
          <div className="color-test-results__main-image">
            <div
              className="color-test-results__main-image-bg"
              style={{
                backgroundImage: `url('${data.mainImageUrl}')`,
              }}
            />
          </div>

          <div className="color-test-results__options">
            {data.options.map((option) => {
              const isSelected = option.id === data.selectedOptionId;

              return (
                <div
                  key={option.id}
                  className={`color-test-results__option ${isSelected ? "color-test-results__option--selected" : ""}`}
                >
                  <div className="color-test-results__option-content">
                    <div
                      className="color-test-results__option-image"
                      style={{
                        backgroundImage: `url('${option.imageUrl}')`,
                      }}
                    />
                    <div className="color-test-results__option-info">
                      <div className="color-test-results__option-header">
                        <p className="color-test-results__option-percentage">{option.percentage}%</p>
                      </div>
                      <div className="color-test-results__option-progress-bar">
                        <div
                          className="color-test-results__option-progress-fill"
                          style={{ width: `${option.percentage}%` }}
                        />
                      </div>
                      <p className="color-test-results__option-description">百分之多少的人选了</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="color-test-results__actions">
          <button type="button" className="color-test-results__next-button" onClick={handleNext}>
            下一题
          </button>
        </div>
      </div>
    </div>
  );
}

export default ColorTestResults;

