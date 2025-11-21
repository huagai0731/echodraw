type ArtworkInfoEditorProps = {
  title: string;
  description: string;
  onTitleChange: (title: string) => void;
  onDescriptionChange: (description: string) => void;
};

export function ArtworkInfoEditor({
  title,
  description,
  onTitleChange,
  onDescriptionChange,
}: ArtworkInfoEditorProps) {
  return (
    <section className="upload-section">
      <label className="upload-field">
        <span>标题</span>
        <input
          type="text"
          placeholder=""
          maxLength={20}
          value={title}
          onChange={(event) => onTitleChange(event.target.value)}
        />
      </label>
      <label className="upload-field">
        <span>留下的话</span>
        <textarea
          placeholder="写下简介、创作笔记，或者偶然的感受和心得…"
          rows={3}
          value={description}
          onChange={(event) => onDescriptionChange(event.target.value)}
        />
      </label>
    </section>
  );
}

