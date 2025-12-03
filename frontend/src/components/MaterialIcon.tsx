import { memo } from "react";
import clsx from "clsx";

type MaterialIconProps = {
  name: string;
  filled?: boolean;
  className?: string;
  style?: React.CSSProperties;
  "aria-hidden"?: boolean;
};

function MaterialIcon({ name, filled, className, style, "aria-hidden": ariaHidden = true }: MaterialIconProps) {
  return (
    <span
      className={clsx("material-symbols-outlined", filled && "filled", className)}
      style={style}
      aria-hidden={ariaHidden}
    >
      {name}
    </span>
  );
}

// 使用 React.memo 优化，避免不必要的重渲染
export default memo(MaterialIcon);



