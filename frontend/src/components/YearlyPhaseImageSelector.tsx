import { parseISODateInShanghai } from "@/utils/dateUtils";
import ArtworkSelector from "@/components/ArtworkSelector";

type YearlyPhaseImageSelectorProps = {
  startDate: string; // ISO日期字符串 YYYY-MM-DD
  endDate: string; // ISO日期字符串 YYYY-MM-DD
  onSelect: (artworkId: number) => void;
  onClose: () => void;
};

/**
 * 全年计划阶段图片选择器
 * 基于ArtworkSelector，使用ISO日期字符串作为输入
 */
function YearlyPhaseImageSelector({
  startDate,
  endDate,
  onSelect,
  onClose,
}: YearlyPhaseImageSelectorProps) {
  // 将ISO日期字符串转换为Date对象
  const startDateObj = parseISODateInShanghai(startDate);
  const endDateObj = parseISODateInShanghai(endDate);

  if (!startDateObj || !endDateObj) {
    console.error("[YearlyPhaseImageSelector] Invalid date format:", { startDate, endDate });
    return null;
  }

  return (
    <ArtworkSelector
      startDate={startDateObj}
      endDate={endDateObj}
      onSelect={onSelect}
      onClose={onClose}
    />
  );
}

export default YearlyPhaseImageSelector;

