import "./LoadingSkeleton.css";

type LoadingSkeletonProps = {
  lines?: number;
  className?: string;
};

export default function LoadingSkeleton({ lines = 3, className }: LoadingSkeletonProps) {
  return (
    <div className={`loading-skeleton ${className || ""}`}>
      {Array.from({ length: lines }).map((_, index) => (
        <div
          key={index}
          className="loading-skeleton__line"
          style={{
            width: index === 0 ? "80%" : index === 1 ? "100%" : "60%",
          }}
        />
      ))}
    </div>
  );
}

