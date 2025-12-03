import { useCallback, useMemo } from "react";

export function useDuration(
  hours: number,
  minutes: number,
  onChange: (hours: number, minutes: number) => void
) {
  const totalMinutes = useMemo(() => hours * 60 + minutes, [hours, minutes]);

  const formattedDuration = useMemo(() => {
    return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;
  }, [hours, minutes]);

  const setHours = useCallback(
    (newHours: number) => {
      onChange(newHours, minutes);
    },
    [minutes, onChange]
  );

  const setMinutes = useCallback(
    (newMinutes: number) => {
      onChange(hours, newMinutes);
    },
    [hours, onChange]
  );

  const setTotalMinutes = useCallback(
    (total: number) => {
      const newHours = Math.floor(total / 60);
      const newMinutes = total % 60;
      onChange(newHours, newMinutes);
    },
    [onChange]
  );

  return {
    totalMinutes,
    formattedDuration,
    setHours,
    setMinutes,
    setTotalMinutes,
  };
}

