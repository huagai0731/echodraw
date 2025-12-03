import GalleryFilterModal from "@/components/GalleryFilterModal";
import type { GalleryFilters, GalleryFilterStats } from "@/utils/urlQueryState";

type FilterPanelProps = {
  open: boolean;
  filters: GalleryFilters;
  stats: GalleryFilterStats;
  onFiltersChange: (filters: GalleryFilters | ((prev: GalleryFilters) => GalleryFilters)) => void;
  onClose: () => void;
  onReset: () => void;
  onApply: () => void;
};

export function FilterPanel({
  open,
  filters,
  stats,
  onFiltersChange,
  onClose,
  onReset,
  onApply,
}: FilterPanelProps) {
  return (
    <GalleryFilterModal
      open={open}
      filters={filters}
      stats={stats}
      onChange={onFiltersChange}
      onClose={onClose}
      onReset={onReset}
      onApply={onApply}
    />
  );
}

