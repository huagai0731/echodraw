import MaterialIcon from "@/components/MaterialIcon";
import type { TagOption } from "@/services/tagPreferences";

type TagManagerProps = {
  tagOptions: TagOption[];
  selectedTags: (string | number)[];
  isLoading: boolean;
  onToggleTag: (id: string | number) => void;
  onAddTag: () => void;
};

export function TagManager({
  tagOptions,
  selectedTags,
  isLoading,
  onToggleTag,
  onAddTag,
}: TagManagerProps) {
  if (isLoading) {
    return (
      <section className="upload-section">
        <h2>标签</h2>
        <div className="upload-tags">
          <span style={{ color: "rgba(239, 234, 231, 0.5)" }}>加载中...</span>
        </div>
      </section>
    );
  }

  return (
    <section className="upload-section">
      <h2>标签</h2>
      <div className="upload-tags">
        {tagOptions.map((tag) => (
          <button
            type="button"
            key={tag.id}
            className={
              selectedTags.includes(tag.id)
                ? "upload-tag upload-tag--active"
                : "upload-tag"
            }
            onClick={() => onToggleTag(tag.id)}
          >
            {tag.name}
          </button>
        ))}
        <button
          type="button"
          className="upload-tag upload-tag--add"
          onClick={onAddTag}
        >
          <MaterialIcon name="add" />
          添加标签
        </button>
      </div>
    </section>
  );
}

