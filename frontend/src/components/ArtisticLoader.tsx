import "./ArtisticLoader.css";

type ArtisticLoaderProps = {
  size?: "small" | "medium" | "large";
  text?: string;
  className?: string;
};

export function ArtisticLoader({ 
  size = "medium", 
  text = "加载中...",
  className = "" 
}: ArtisticLoaderProps) {
  const sizeMap = {
    small: { svg: 40, r1: 16, r2: 10, r3: 2 },
    medium: { svg: 60, r1: 24, r2: 15, r3: 3 },
    large: { svg: 80, r1: 32, r2: 20, r3: 4 },
  };

  const dimensions = sizeMap[size];
  const center = dimensions.svg / 2;

  return (
    <div className={`artistic-loader artistic-loader--${size} ${className}`}>
      <svg 
        width={dimensions.svg} 
        height={dimensions.svg} 
        viewBox={`0 0 ${dimensions.svg} ${dimensions.svg}`}
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id={`loaderGradient-${size}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#98dbc6" stopOpacity="1">
              <animate attributeName="stop-opacity" values="0.3;1;0.3" dur="2s" repeatCount="indefinite" />
            </stop>
            <stop offset="50%" stopColor="#c5e1e2" stopOpacity="0.6">
              <animate attributeName="stop-opacity" values="0.6;1;0.6" dur="2s" begin="0.3s" repeatCount="indefinite" />
            </stop>
            <stop offset="100%" stopColor="#98dbc6" stopOpacity="0.8">
              <animate attributeName="stop-opacity" values="0.8;0.3;0.8" dur="2s" begin="0.6s" repeatCount="indefinite" />
            </stop>
          </linearGradient>
        </defs>
        {/* 外圈 */}
        <circle
          cx={center}
          cy={center}
          r={dimensions.r1}
          fill="none"
          stroke={`url(#loaderGradient-${size})`}
          strokeWidth="2"
          strokeLinecap="round"
          opacity="0.6"
        >
          <animate
            attributeName="stroke-dasharray"
            values="0 200;100 200;200 200;200 0"
            dur="2s"
            repeatCount="indefinite"
          />
          <animateTransform
            attributeName="transform"
            type="rotate"
            values={`0 ${center} ${center};360 ${center} ${center}`}
            dur="3s"
            repeatCount="indefinite"
          />
        </circle>
        {/* 内圈 */}
        <circle
          cx={center}
          cy={center}
          r={dimensions.r2}
          fill="none"
          stroke={`url(#loaderGradient-${size})`}
          strokeWidth="2"
          strokeLinecap="round"
          opacity="0.8"
        >
          <animate
            attributeName="stroke-dasharray"
            values="200 0;100 200;0 200;200 0"
            dur="2s"
            begin="1s"
            repeatCount="indefinite"
          />
          <animateTransform
            attributeName="transform"
            type="rotate"
            values={`360 ${center} ${center};0 ${center} ${center}`}
            dur="2.5s"
            repeatCount="indefinite"
          />
        </circle>
        {/* 中心点 */}
        <circle
          cx={center}
          cy={center}
          r={dimensions.r3}
          fill="#98dbc6"
          opacity="0.9"
        >
          <animate
            attributeName="r"
            values={`${dimensions.r3 * 0.75};${dimensions.r3 * 1.5};${dimensions.r3 * 0.75}`}
            dur="1.5s"
            repeatCount="indefinite"
          />
          <animate
            attributeName="opacity"
            values="0.5;1;0.5"
            dur="1.5s"
            repeatCount="indefinite"
          />
        </circle>
      </svg>
      {text && (
        <p className="artistic-loader__text">{text}</p>
      )}
    </div>
  );
}

