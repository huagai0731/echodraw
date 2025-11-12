import clsx from "clsx";

type MaterialIconProps = {
  name: string;
  filled?: boolean;
  className?: string;
  "aria-hidden"?: boolean;
};

function MaterialIcon({ name, filled, className, "aria-hidden": ariaHidden = true }: MaterialIconProps) {
  return (
    <span
      className={clsx("material-symbols-outlined", filled && "filled", className)}
      aria-hidden={ariaHidden}
    >
      {name}
    </span>
  );
}

export default MaterialIcon;



