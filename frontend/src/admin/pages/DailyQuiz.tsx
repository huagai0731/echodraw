import { useEffect, useState } from "react";
import { isAxiosError } from "axios";

import MaterialIcon from "@/components/MaterialIcon";
import {
  createDailyQuiz,
  deleteDailyQuiz,
  getDailyQuiz,
  listDailyQuizzes,
  updateDailyQuiz,
} from "@/admin/api";
import type { AdminDailyQuiz } from "@/admin/api";

import "../styles/DailyQuiz.css";

type OptionDraft = {
  option_type: "text" | "image";
  text: string;
  image: File | null;
  imagePreview: string | null;
  display_order: number;
};

type QuizDraft = {
  date: string;
  question_text: string;
  option_count: number;
  options: OptionDraft[];
  display_order: number;
};

const QUIZ_EMPTY: QuizDraft = {
  date: new Date().toISOString().split("T")[0],
  question_text: "",
  option_count: 2,
  options: [
    { option_type: "text", text: "", image: null, imagePreview: null, display_order: 100 },
    { option_type: "text", text: "", image: null, imagePreview: null, display_order: 110 },
  ],
  display_order: 100,
};

function DailyQuizPage() {
  const [quizzes, setQuizzes] = useState<AdminDailyQuiz[]>([]);
  const [draft, setDraft] = useState<QuizDraft>(QUIZ_EMPTY);
  const [editingId, setEditingId] = useState<number | "new" | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const data = await listDailyQuizzes();
        setQuizzes(data);
      } catch (err) {
        handleError(err, "加载每日小测失败，请稍后再试。");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  const handleError = (err: unknown, fallback: string) => {
    if (isAxiosError(err)) {
      const detail = err.response?.data?.detail;
      setError(typeof detail === "string" && detail.length > 0 ? detail : fallback);
    } else if (err instanceof Error) {
      setError(err.message || fallback);
    } else {
      setError(fallback);
    }
  };

  const resetDraft = () => {
    setDraft(QUIZ_EMPTY);
    setEditingId(null);
    setSaving(false);
    setError(null);
  };

  const handleSave = async () => {
    if (saving || editingId === null) {
      return;
    }

    const trimmedQuestionText = draft.question_text.trim();

    if (!draft.date) {
      setError("请选择日期。");
      return;
    }
    if (!trimmedQuestionText) {
      setError("请填写题目。");
      return;
    }
    if (draft.options.length < 2) {
      setError("至少需要 2 个选项。");
      return;
    }
    if (draft.options.length > 5) {
      setError("最多只能有 5 个选项。");
      return;
    }

    // 验证所有选项
    for (let i = 0; i < draft.options.length; i++) {
      const option = draft.options[i];
      if (option.option_type === "text" && !option.text.trim()) {
        setError(`第 ${i + 1} 个选项：文字选项需要填写文本。`);
        return;
      }
      if (option.option_type === "image" && !option.image && !option.imagePreview) {
        setError(`第 ${i + 1} 个选项：图片选项需要上传图片。`);
        return;
      }
    }

    setSaving(true);
    setError(null);

    // 构建options_data
    const options_data = draft.options.map((opt, idx) => ({
      option_type: opt.option_type,
      text: opt.option_type === "text" ? opt.text.trim() : "",
      image: opt.option_type === "image" ? opt.image : null,
      display_order: 100 + idx * 10,
    }));

    const payload = {
      date: draft.date,
      question_text: trimmedQuestionText,
      display_order: draft.display_order,
      options_data,
    };

    try {
      if (editingId === "new") {
        const created = await createDailyQuiz(payload);
        setQuizzes((prev) => [created, ...prev]);
      } else {
        const updated = await updateDailyQuiz(editingId, payload);
        setQuizzes((prev) => prev.map((item) => (item.id === editingId ? updated : item)));
      }
      resetDraft();
    } catch (err) {
      handleError(err, "保存每日小测失败。");
    } finally {
      setSaving(false);
    }
  };

  const startCreate = () => {
    if (editingId !== null) return;
    setDraft(QUIZ_EMPTY);
    setEditingId("new");
  };

  const handleEdit = async (quiz: AdminDailyQuiz) => {
    if (editingId !== null) return;

    try {
      // 获取完整的小测数据
      const fullQuiz = await getDailyQuiz(quiz.id);

      // 构建options数据
      const options: OptionDraft[] = fullQuiz.options.map((opt) => ({
        option_type: opt.option_type,
        text: opt.text || "",
        image: null,
        imagePreview: opt.image_url || null,
        display_order: opt.display_order,
      }));

      setDraft({
        date: fullQuiz.date,
        question_text: fullQuiz.question_text,
        option_count: options.length,
        options,
        display_order: fullQuiz.display_order,
      });
      setEditingId(quiz.id);
    } catch (err) {
      handleError(err, "加载每日小测详情失败。");
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm("确定要删除这个每日小测吗？此操作不可恢复。")) {
      return;
    }

    try {
      await deleteDailyQuiz(id);
      setQuizzes((prev) => prev.filter((item) => item.id !== id));
      if (editingId === id) {
        resetDraft();
      }
    } catch (err) {
      handleError(err, "删除每日小测失败。");
    }
  };

  const updateOptionCount = (count: number) => {
    if (count < 2 || count > 5) return;

    const currentCount = draft.options.length;

    if (count > currentCount) {
      // 增加选项
      const newOptions = [...draft.options];
      for (let i = currentCount; i < count; i++) {
        newOptions.push({
          option_type: "text",
          text: "",
          image: null,
          imagePreview: null,
          display_order: 100 + i * 10,
        });
      }
      setDraft({ ...draft, option_count: count, options: newOptions });
    } else if (count < currentCount) {
      // 减少选项
      setDraft({
        ...draft,
        option_count: count,
        options: draft.options.slice(0, count),
      });
    }
  };

  const updateOption = (index: number, updates: Partial<OptionDraft>) => {
    const newOptions = [...draft.options];
    newOptions[index] = { ...newOptions[index], ...updates };
    setDraft({ ...draft, options: newOptions });
  };

  const handleImageChange = (index: number, file: File | null) => {
    if (!file) {
      updateOption(index, { image: null, imagePreview: null });
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      updateOption(index, {
        image: file,
        imagePreview: e.target?.result as string,
      });
    };
    reader.readAsDataURL(file);
  };

  const removeOption = (index: number) => {
    if (draft.options.length <= 2) {
      setError("至少需要 2 个选项。");
      return;
    }
    setDraft({
      ...draft,
      option_count: draft.options.length - 1,
      options: draft.options.filter((_, i) => i !== index),
    });
  };

  if (loading) {
    return (
      <div className="daily-quiz-page">
        <div className="daily-quiz-page__loading">加载中...</div>
      </div>
    );
  }

  return (
    <div className="daily-quiz-page">
      <div className="daily-quiz-page__header">
        <h1 className="daily-quiz-page__title">每日小测</h1>
        <button
          type="button"
          className="daily-quiz-page__create-button"
          onClick={startCreate}
          disabled={editingId !== null}
        >
          <MaterialIcon name="add" />
          新建小测
        </button>
      </div>

      {error && (
        <div className="daily-quiz-page__error">
          <MaterialIcon name="error" />
          {error}
        </div>
      )}

      {editingId !== null && (
        <div className="daily-quiz-page__form">
          <h2 className="daily-quiz-page__form-title">
            {editingId === "new" ? "新建每日小测" : "编辑每日小测"}
          </h2>

          <div className="daily-quiz-page__form-section">
            <h3 className="daily-quiz-page__form-section-title">基本信息</h3>

            <div className="daily-quiz-page__form-row">
              <label className="daily-quiz-page__form-label">
                日期 <span className="daily-quiz-page__form-required">*</span>
              </label>
              <input
                type="date"
                className="daily-quiz-page__form-input"
                value={draft.date}
                onChange={(e) => setDraft({ ...draft, date: e.target.value })}
              />
            </div>

            <div className="daily-quiz-page__form-row">
              <label className="daily-quiz-page__form-label">
                题目 <span className="daily-quiz-page__form-required">*</span>
              </label>
              <textarea
                className="daily-quiz-page__form-textarea"
                value={draft.question_text}
                onChange={(e) => setDraft({ ...draft, question_text: e.target.value })}
                placeholder="例如: 今天你想画什么？"
                rows={3}
              />
            </div>

            <div className="daily-quiz-page__form-row">
              <label className="daily-quiz-page__form-label">排序权重</label>
              <input
                type="number"
                className="daily-quiz-page__form-input"
                value={draft.display_order}
                onChange={(e) =>
                  setDraft({ ...draft, display_order: Number(e.target.value) || 100 })
                }
                placeholder="100"
              />
            </div>
          </div>

          <div className="daily-quiz-page__form-section">
            <div className="daily-quiz-page__form-section-header">
              <h3 className="daily-quiz-page__form-section-title">选项</h3>
              <div className="daily-quiz-page__form-row">
                <label className="daily-quiz-page__form-label">选项数量</label>
                <select
                  className="daily-quiz-page__form-input"
                  value={draft.option_count}
                  onChange={(e) => updateOptionCount(Number(e.target.value))}
                >
                  <option value={2}>2 个选项</option>
                  <option value={3}>3 个选项</option>
                  <option value={4}>4 个选项</option>
                  <option value={5}>5 个选项</option>
                </select>
              </div>
            </div>

            {draft.options.map((option, oIndex) => (
              <div key={oIndex} className="daily-quiz-page__option-card">
                <div className="daily-quiz-page__option-header">
                  <h4 className="daily-quiz-page__option-title">选项 {oIndex + 1}</h4>
                  {draft.options.length > 2 && (
                    <button
                      type="button"
                      className="daily-quiz-page__option-remove"
                      onClick={() => removeOption(oIndex)}
                    >
                      <MaterialIcon name="delete" />
                      删除
                    </button>
                  )}
                </div>

                <div className="daily-quiz-page__form-row">
                  <label className="daily-quiz-page__form-label">选项类型</label>
                  <select
                    className="daily-quiz-page__form-input"
                    value={option.option_type}
                    onChange={(e) =>
                      updateOption(oIndex, {
                        option_type: e.target.value as "text" | "image",
                        text: "",
                        image: null,
                        imagePreview: null,
                      })
                    }
                  >
                    <option value="text">文字</option>
                    <option value="image">图片</option>
                  </select>
                </div>

                {option.option_type === "text" ? (
                  <div className="daily-quiz-page__form-row">
                    <label className="daily-quiz-page__form-label">
                      选项文本 <span className="daily-quiz-page__form-required">*</span>
                    </label>
                    <input
                      type="text"
                      className="daily-quiz-page__form-input"
                      value={option.text}
                      onChange={(e) => updateOption(oIndex, { text: e.target.value })}
                      placeholder="例如: 风景画"
                    />
                  </div>
                ) : (
                  <div className="daily-quiz-page__form-row">
                    <label className="daily-quiz-page__form-label">
                      选项图片 <span className="daily-quiz-page__form-required">*</span>
                    </label>
                    <input
                      type="file"
                      accept="image/*"
                      className="daily-quiz-page__form-input"
                      onChange={(e) => {
                        const file = e.target.files?.[0] || null;
                        handleImageChange(oIndex, file);
                      }}
                    />
                    {option.imagePreview && (
                      <div className="daily-quiz-page__image-preview">
                        <img src={option.imagePreview} alt="预览" />
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="daily-quiz-page__form-actions">
            <button
              type="button"
              className="daily-quiz-page__form-button daily-quiz-page__form-button--primary"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? "保存中..." : "保存"}
            </button>
            <button
              type="button"
              className="daily-quiz-page__form-button"
              onClick={resetDraft}
              disabled={saving}
            >
              取消
            </button>
          </div>
        </div>
      )}

      <div className="daily-quiz-page__list">
        {quizzes.length === 0 ? (
          <div className="daily-quiz-page__empty">暂无每日小测</div>
        ) : (
          quizzes.map((quiz) => (
            <div key={quiz.id} className="daily-quiz-page__item">
              <div className="daily-quiz-page__item-content">
                <div className="daily-quiz-page__item-header">
                  <h3 className="daily-quiz-page__item-date">{quiz.date}</h3>
                </div>
                <p className="daily-quiz-page__item-question">{quiz.question_text}</p>
                <div className="daily-quiz-page__item-meta">
                  <span>选项数: {quiz.option_count}</span>
                  <span>排序: {quiz.display_order}</span>
                </div>
              </div>
              <div className="daily-quiz-page__item-actions">
                <button
                  type="button"
                  className="daily-quiz-page__item-button"
                  onClick={() => handleEdit(quiz)}
                  disabled={editingId !== null}
                >
                  <MaterialIcon name="edit" />
                  编辑
                </button>
                <button
                  type="button"
                  className="daily-quiz-page__item-button daily-quiz-page__item-button--danger"
                  onClick={() => handleDelete(quiz.id)}
                  disabled={editingId !== null}
                >
                  <MaterialIcon name="delete" />
                  删除
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default DailyQuizPage;

