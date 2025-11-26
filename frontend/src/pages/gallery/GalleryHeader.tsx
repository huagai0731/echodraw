import TopNav from "@/components/TopNav";
import type { TagFilterMode } from "@/utils/urlQueryState";

type GalleryHeaderProps = {
  showInfo: boolean;
  onToggleInfo: () => void;
  onOpenFilter: () => void;
  activeFilters: string[];
  tagMode: TagFilterMode;
};

export function GalleryHeader({
  showInfo,
  onToggleInfo,
  onOpenFilter,
  activeFilters,
  tagMode,
}: GalleryHeaderProps) {
  const subtitle = activeFilters.length > 0 
    ? `筛选：${activeFilters.join(" ")} (${tagMode === "all" ? "全部满足" : "满足任意一个"})`
    : "My Works";

  return (
    <TopNav
      title="画集"
      subtitle={subtitle}
      className="top-nav--fixed top-nav--flush"
      leadingAction={{
        icon: showInfo ? "visibility" : "visibility_off",
        label: showInfo ? "隐藏作品信息" : "显示作品信息",
        onClick: onToggleInfo,
      }}
      trailingActions={[
        {
          icon: "tune",
          label: "筛选作品",
          onClick: onOpenFilter,
        },
      ]}
    />
  );
}

