import { useEffect, useState } from "react";
import { isAxiosError } from "axios";

import MaterialIcon from "@/components/MaterialIcon";
import {
  createTest,
  createTestDimension,
  deleteTest,
  getTest,
  listTests,
  updateTest,
} from "@/admin/api";
import type { AdminTest } from "@/admin/api";

import "../styles/TestManagement.css";

type QuestionDraft = {
  question_text: string;
  // 类型1使用
  dimension_index?: number; // 使用维度在draft.dimensions数组中的索引
  endpoint_code?: string;
  score_config?: Record<string, number>; // {"-2": 2, "-1": 1, "0": 0, "1": 1, "2": 2}
  // 类型2使用
  option_count?: number;
  options?: Array<{
    text: string;
    dimension_scores?: Record<string, number>; // 每个选项给不同维度加分的配置
  }>;
};

type DimensionDraft = {
  code: string;
  name: string;
  endpoint_a_code: string;
  endpoint_a_name: string;
  endpoint_b_code: string;
  endpoint_b_name: string;
  description: string;
  display_order: number;
  id?: number; // 如果是已存在的维度，有id
};

type TestDraft = {
  slug: string;
  name: string;
  description: string;
  test_type: "type_1" | "type_2";
  dimensions: DimensionDraft[]; // 改为直接存储维度信息
  display_order: number;
  questions: QuestionDraft[];
};

const TEST_EMPTY: TestDraft = {
  slug: "",
  name: "",
  description: "",
  test_type: "type_1",
  dimensions: [],
  display_order: 100,
  questions: [],
};

function TestManagementPage() {
  const [tests, setTests] = useState<AdminTest[]>([]);
  const [draft, setDraft] = useState<TestDraft>(TEST_EMPTY);
  const [editingId, setEditingId] = useState<number | "new" | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const testsData = await listTests();
        setTests(testsData);
        // Dimensions are loaded from test data, no need for separate state
      } catch (err) {
        handleError(err, "加载测试数据失败，请稍后再试。");
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
    setDraft(TEST_EMPTY);
    setEditingId(null);
    setSaving(false);
    setError(null);
  };

  const handleSave = async () => {
    if (saving || editingId === null) {
      return;
    }

    const trimmedSlug = draft.slug.trim();
    const trimmedName = draft.name.trim();

    if (!trimmedSlug) {
      setError("请填写测试标识 slug。");
      return;
    }
    if (!trimmedName) {
      setError("请填写测试名称。");
      return;
    }
    if (draft.dimensions.length === 0) {
      setError("请至少添加一个测试维度。");
      return;
    }
    
    // 验证所有维度
    for (let i = 0; i < draft.dimensions.length; i++) {
      const dim = draft.dimensions[i];
      if (!dim.code.trim()) {
        setError(`第 ${i + 1} 个维度：请填写维度标识 code。`);
        return;
      }
      if (!dim.name.trim()) {
        setError(`第 ${i + 1} 个维度：请填写维度名称。`);
        return;
      }
      if (!dim.endpoint_a_code.trim()) {
        setError(`第 ${i + 1} 个维度：请填写端点A标识。`);
        return;
      }
      if (!dim.endpoint_a_name.trim()) {
        setError(`第 ${i + 1} 个维度：请填写端点A名称。`);
        return;
      }
      if (!dim.endpoint_b_code.trim()) {
        setError(`第 ${i + 1} 个维度：请填写端点B标识。`);
        return;
      }
      if (!dim.endpoint_b_name.trim()) {
        setError(`第 ${i + 1} 个维度：请填写端点B名称。`);
        return;
      }
    }
    if (draft.questions.length === 0) {
      setError("请至少添加一道题目。");
      return;
    }

    // 验证所有题目
    for (let i = 0; i < draft.questions.length; i++) {
      const question = draft.questions[i];
      if (!question.question_text.trim()) {
        setError(`第 ${i + 1} 道题目：请填写题目名称。`);
        return;
      }
      
      if (draft.test_type === "type_1") {
        // 类型1验证
        if (question.dimension_index === undefined || question.dimension_index < 0) {
          setError(`第 ${i + 1} 道题目：请选择对应维度。`);
          return;
        }
        if (!question.endpoint_code) {
          setError(`第 ${i + 1} 道题目：请选择维度端点。`);
          return;
        }
      } else {
        // 类型2验证
        if (!question.options || question.options.length !== 4) {
          setError(`第 ${i + 1} 道题目：类型2需要固定4个选项。`);
          return;
        }
        for (let j = 0; j < question.options.length; j++) {
          const option = question.options[j];
          if (!option.text.trim()) {
            setError(`第 ${i + 1} 道题目，第 ${j + 1} 个选项：请填写选项文本。`);
            return;
          }
        }
      }
    }

    setSaving(true);
    setError(null);

    // 先创建或获取维度，并建立索引到ID的映射
    const dimensionIds: number[] = [];
    const dimensionIndexToId: Map<number, number> = new Map();
    
    for (let i = 0; i < draft.dimensions.length; i++) {
      const dimDraft = draft.dimensions[i];
      if (dimDraft.id) {
        // 已存在的维度，直接使用ID
        dimensionIds.push(dimDraft.id);
        dimensionIndexToId.set(i, dimDraft.id);
      } else {
        // 新建维度
        try {
          const created = await createTestDimension({
            code: dimDraft.code.trim(),
            name: dimDraft.name.trim(),
            endpoint_a_code: dimDraft.endpoint_a_code.trim(),
            endpoint_a_name: dimDraft.endpoint_a_name.trim(),
            endpoint_b_code: dimDraft.endpoint_b_code.trim(),
            endpoint_b_name: dimDraft.endpoint_b_name.trim(),
            description: dimDraft.description.trim(),
            display_order: dimDraft.display_order,
          });
          dimensionIds.push(created.id);
          dimensionIndexToId.set(i, created.id);
        } catch (err) {
          handleError(err, `创建维度 "${dimDraft.name}" 失败。`);
          setSaving(false);
          return;
        }
      }
    }

    // 构建questions_data
    const questions_data = draft.questions.map((q, idx) => {
      if (draft.test_type === "type_1") {
        // 类型1：题目 + 维度 + 5个分值
        const dimIndex = q.dimension_index ?? -1;
        let dimensionId: number | undefined = undefined;
        if (dimIndex >= 0 && dimIndex < draft.dimensions.length) {
          const dim = draft.dimensions[dimIndex];
          if (dim.id) {
            dimensionId = dim.id;
          } else {
            // 新建的维度，从映射中获取ID
            dimensionId = dimensionIndexToId.get(dimIndex);
          }
        }
        return {
          question_text: q.question_text.trim(),
          display_order: 100 + idx * 10,
          dimension_id: dimensionId,
          endpoint_code: q.endpoint_code || "",
          score_config: q.score_config || {},
        };
      } else {
        // 类型2：题目 + 选项
        return {
          question_text: q.question_text.trim(),
          display_order: 100 + idx * 10,
          options: (q.options || []).map((opt) => ({
            text: opt.text.trim(),
            dimension_scores: opt.dimension_scores || {},
          })),
        };
      }
    });

    const payload = {
      slug: trimmedSlug,
      name: trimmedName,
      description: draft.description.trim(),
      test_type: draft.test_type,
      dimension_ids: dimensionIds,
      display_order: draft.display_order,
      questions_data,
    };

    try {
      if (editingId === "new") {
        const created = await createTest(payload);
        setTests((prev) => [created, ...prev]);
      } else {
        const updated = await updateTest(editingId, payload);
        setTests((prev) => prev.map((item) => (item.id === editingId ? updated : item)));
      }
      resetDraft();
    } catch (err) {
      handleError(err, "保存测试失败。");
    } finally {
      setSaving(false);
    }
  };

  const startCreate = () => {
    if (editingId !== null) return;
    setDraft(TEST_EMPTY);
    setEditingId("new");
  };

  const handleEdit = async (test: AdminTest) => {
    if (editingId !== null) return;

    try {
      // 获取完整的测试数据（包含题目和选项）
      const fullTest = await getTest(test.id);
      
      // 将维度转换为Draft格式（需要在构建questions之前声明）
      const dimensionsDraft: DimensionDraft[] = fullTest.dimensions.map((d) => ({
        id: d.id,
        code: d.code,
        name: d.name,
        endpoint_a_code: d.endpoint_a_code,
        endpoint_a_name: d.endpoint_a_name,
        endpoint_b_code: d.endpoint_b_code,
        endpoint_b_name: d.endpoint_b_name,
        description: d.description || "",
        display_order: d.display_order,
      }));
      
      // 构建questions数据
      const questions: QuestionDraft[] = fullTest.questions.map((q) => {
        if (fullTest.test_type === "type_1") {
          // 类型1：题目 + 维度 + 分值配置
          // 找到题目对应的维度在dimensionsDraft中的索引
          const dimIndex = q.dimension_id 
            ? dimensionsDraft.findIndex((d) => d.id === q.dimension_id)
            : -1;
          return {
            question_text: q.question_text,
            dimension_index: dimIndex >= 0 ? dimIndex : undefined,
            endpoint_code: q.endpoint_code || "",
            score_config: q.score_config || {},
          };
        } else {
          // 类型2：从option_texts中提取选项
          const options: Array<{ text: string; dimension_scores?: Record<string, number> }> = [];
          q.option_texts.forEach((optionText) => {
            const dimension_scores: Record<string, number> = {};
            optionText.options?.forEach((opt) => {
              const score = opt.score_config?.selected || opt.score_config?.value || 0;
              if (score > 0) {
                dimension_scores[opt.endpoint_code] = score;
              }
            });
            options.push({
              text: optionText.text,
              dimension_scores,
            });
          });
          return {
            question_text: q.question_text,
            option_count: options.length,
            options,
          };
        }
      });

      setDraft({
        slug: fullTest.slug,
        name: fullTest.name,
        description: fullTest.description ?? "",
        test_type: fullTest.test_type || "type_1",
        dimensions: dimensionsDraft,
        display_order: fullTest.display_order,
        questions,
      });
      setEditingId(test.id);
    } catch (err) {
      handleError(err, "加载测试详情失败。");
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm("确定要删除这个测试吗？此操作不可恢复。")) {
      return;
    }

    try {
      await deleteTest(id);
      setTests((prev) => prev.filter((item) => item.id !== id));
      if (editingId === id) {
        resetDraft();
      }
    } catch (err) {
      handleError(err, "删除测试失败。");
    }
  };

  const addDimension = () => {
    setDraft({
      ...draft,
      dimensions: [
        ...draft.dimensions,
        {
          code: "",
          name: "",
          endpoint_a_code: "",
          endpoint_a_name: "",
          endpoint_b_code: "",
          endpoint_b_name: "",
          description: "",
          display_order: 100 + draft.dimensions.length * 10,
        },
      ],
    });
  };

  const updateDimension = (index: number, updates: Partial<DimensionDraft>) => {
    const newDimensions = [...draft.dimensions];
    newDimensions[index] = { ...newDimensions[index], ...updates };
    setDraft({ ...draft, dimensions: newDimensions });
  };

  const removeDimension = (index: number) => {
    setDraft({
      ...draft,
      dimensions: draft.dimensions.filter((_, i) => i !== index),
      // 同时移除题目中对已删除维度的引用，并调整索引
      questions: draft.questions.map((q) => {
        if (draft.test_type === "type_1") {
          if (q.dimension_index === index) {
            // 删除的维度，清空引用
            return {
              ...q,
              dimension_index: undefined,
              endpoint_code: "",
            };
          } else if (q.dimension_index !== undefined && q.dimension_index > index) {
            // 索引需要减1
            return {
              ...q,
              dimension_index: q.dimension_index - 1,
            };
          }
        }
        return q;
      }),
    });
  };

  const addQuestion = () => {
    if (draft.test_type === "type_1") {
      // 类型1：默认选择第一个维度
      const firstDimensionIndex = draft.dimensions.length > 0 ? 0 : undefined;
      const firstDimension = firstDimensionIndex !== undefined ? draft.dimensions[firstDimensionIndex] : null;
      setDraft({
        ...draft,
        questions: [
          ...draft.questions,
          {
            question_text: "",
            dimension_index: firstDimensionIndex,
            endpoint_code: firstDimension?.endpoint_a_code || "",
            score_config: { "-2": 0, "-1": 0, "0": 0, "1": 0, "2": 0 },
          },
        ],
      });
    } else {
      setDraft({
        ...draft,
        questions: [
          ...draft.questions,
          {
            question_text: "",
            option_count: 4,
            options: Array.from({ length: 4 }, () => ({
              text: "",
              dimension_scores: {},
            })),
          },
        ],
      });
    }
  };

  const updateQuestion = (index: number, updates: Partial<QuestionDraft>) => {
    const newQuestions = [...draft.questions];
    newQuestions[index] = { ...newQuestions[index], ...updates };
    setDraft({ ...draft, questions: newQuestions });
  };

  const updateQuestionOptionCount = (questionIndex: number, count: number) => {
    if (draft.test_type === "type_1") return; // 类型1不需要这个功能
    
    if (count !== 4) return; // 类型2固定4个选项
    
    const question = draft.questions[questionIndex];
    const currentCount = question.options?.length || 0;
    
    if (count > currentCount) {
      // 增加选项
      const newOptions = [...(question.options || [])];
      for (let i = currentCount; i < count; i++) {
        newOptions.push({
          text: "",
          dimension_scores: {},
        });
      }
      updateQuestion(questionIndex, {
        option_count: count,
        options: newOptions,
      });
    } else if (count < currentCount) {
      // 减少选项
      updateQuestion(questionIndex, {
        option_count: count,
        options: question.options?.slice(0, count) || [],
      });
    }
  };

  const updateQuestionOption = (
    questionIndex: number,
    optionIndex: number,
    updates: Partial<{ text: string; score: number; dimension_scores?: Record<string, number> }>,
  ) => {
    const newQuestions = [...draft.questions];
    const question = newQuestions[questionIndex];
    if (!question.options) {
      question.options = [];
    }
    const newOptions = [...question.options];
    newOptions[optionIndex] = { ...newOptions[optionIndex], ...updates };
    newQuestions[questionIndex] = {
      ...newQuestions[questionIndex],
      options: newOptions,
    };
    setDraft({ ...draft, questions: newQuestions });
  };

  const removeQuestion = (index: number) => {
    setDraft({
      ...draft,
      questions: draft.questions.filter((_, i) => i !== index),
    });
  };

  if (loading) {
    return (
      <div className="test-management-page">
        <div className="test-management-page__loading">加载中...</div>
      </div>
    );
  }

  return (
    <div className="test-management-page">
      <div className="test-management-page__header">
        <h1 className="test-management-page__title">测试管理</h1>
        <button
          type="button"
          className="test-management-page__create-button"
          onClick={startCreate}
          disabled={editingId !== null}
        >
          <MaterialIcon name="add" />
          新建测试
        </button>
      </div>

      {error && (
        <div className="test-management-page__error">
          <MaterialIcon name="error" />
          {error}
        </div>
      )}

      {editingId !== null && (
        <div className="test-management-page__form">
          <h2 className="test-management-page__form-title">
            {editingId === "new" ? "新建测试" : "编辑测试"}
          </h2>

          <div className="test-management-page__form-section">
            <h3 className="test-management-page__form-section-title">基本信息</h3>
            
            <div className="test-management-page__form-row">
              <label className="test-management-page__form-label">
                测试标识 (slug) <span className="test-management-page__form-required">*</span>
              </label>
              <input
                type="text"
                className="test-management-page__form-input"
                value={draft.slug}
                onChange={(e) => setDraft({ ...draft, slug: e.target.value })}
                placeholder="例如: mental_state_assessment"
              />
            </div>

            <div className="test-management-page__form-row">
              <label className="test-management-page__form-label">
                测试名称 <span className="test-management-page__form-required">*</span>
              </label>
              <input
                type="text"
                className="test-management-page__form-input"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="例如: 心境评估"
              />
            </div>

            <div className="test-management-page__form-row">
              <label className="test-management-page__form-label">测试描述</label>
              <textarea
                className="test-management-page__form-textarea"
                value={draft.description}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                placeholder="可选：描述测试的目的和内容"
                rows={3}
              />
            </div>

            <div className="test-management-page__form-row">
              <label className="test-management-page__form-label">
                测试类型 <span className="test-management-page__form-required">*</span>
              </label>
              <select
                className="test-management-page__form-input"
                value={draft.test_type}
                onChange={(e) => {
                  const newType = e.target.value as "type_1" | "type_2";
                  // 切换类型时，重置所有题目
                  const updatedQuestions = draft.questions.map((q) => {
                    if (newType === "type_1") {
                      // 转换为类型1格式
                      const firstDimIndex = draft.dimensions.length > 0 ? 0 : undefined;
                      const firstDim = firstDimIndex !== undefined ? draft.dimensions[firstDimIndex] : null;
                      return {
                        question_text: q.question_text,
                        dimension_index: firstDimIndex,
                        endpoint_code: firstDim?.endpoint_a_code || "",
                        score_config: { "-2": 0, "-1": 0, "0": 0, "1": 0, "2": 0 },
                      };
                    } else {
                      // 转换为类型2格式
                      return {
                        question_text: q.question_text,
                        option_count: 4,
                        options: Array.from({ length: 4 }, () => ({
                          text: "",
                          dimension_scores: {},
                        })),
                      };
                    }
                  });
                  setDraft({
                    ...draft,
                    test_type: newType,
                    questions: updatedQuestions,
                  });
                }}
              >
                <option value="type_1">类型1：5级选择（非常同意/比较同意/中立/比较不同意/非常不同意）</option>
                <option value="type_2">类型2：题目+4个选项（选择不同选项给不同维度加分）</option>
              </select>
            </div>

            <div className="test-management-page__form-section">
              <div className="test-management-page__form-section-header">
                <h3 className="test-management-page__form-section-title">
                  测试维度 <span className="test-management-page__form-required">*</span>
                </h3>
                <button
                  type="button"
                  className="test-management-page__form-button--small"
                  onClick={addDimension}
                >
                  <MaterialIcon name="add" />
                  添加维度
                </button>
              </div>

              {draft.dimensions.length === 0 ? (
                <div className="test-management-page__form-empty">
                  暂无维度，请点击"添加维度"按钮添加
                </div>
              ) : (
                draft.dimensions.map((dim, dimIndex) => (
                  <div key={dimIndex} className="test-management-page__dimension-card">
                    <div className="test-management-page__dimension-header">
                      <h4 className="test-management-page__dimension-title">
                        维度 {dimIndex + 1}
                      </h4>
                      <button
                        type="button"
                        className="test-management-page__dimension-remove"
                        onClick={() => removeDimension(dimIndex)}
                      >
                        <MaterialIcon name="delete" />
                        删除
                      </button>
                    </div>

                    <div className="test-management-page__form-row">
                      <label className="test-management-page__form-label">
                        维度标识 (code) <span className="test-management-page__form-required">*</span>
                      </label>
                      <input
                        type="text"
                        className="test-management-page__form-input"
                        value={dim.code}
                        onChange={(e) =>
                          updateDimension(dimIndex, { code: e.target.value })
                        }
                        placeholder="例如: creative_style"
                      />
                    </div>

                    <div className="test-management-page__form-row">
                      <label className="test-management-page__form-label">
                        维度名称 <span className="test-management-page__form-required">*</span>
                      </label>
                      <input
                        type="text"
                        className="test-management-page__form-input"
                        value={dim.name}
                        onChange={(e) =>
                          updateDimension(dimIndex, { name: e.target.value })
                        }
                        placeholder="例如: 创作风格"
                      />
                    </div>

                    <div className="test-management-page__form-row">
                      <label className="test-management-page__form-label">
                        端点A标识 <span className="test-management-page__form-required">*</span>
                      </label>
                      <input
                        type="text"
                        className="test-management-page__form-input"
                        value={dim.endpoint_a_code}
                        onChange={(e) =>
                          updateDimension(dimIndex, { endpoint_a_code: e.target.value })
                        }
                        placeholder="例如: o"
                      />
                    </div>

                    <div className="test-management-page__form-row">
                      <label className="test-management-page__form-label">
                        端点A名称 <span className="test-management-page__form-required">*</span>
                      </label>
                      <input
                        type="text"
                        className="test-management-page__form-input"
                        value={dim.endpoint_a_name}
                        onChange={(e) =>
                          updateDimension(dimIndex, { endpoint_a_name: e.target.value })
                        }
                        placeholder="例如: 有序创作"
                      />
                    </div>

                    <div className="test-management-page__form-row">
                      <label className="test-management-page__form-label">
                        端点B标识 <span className="test-management-page__form-required">*</span>
                      </label>
                      <input
                        type="text"
                        className="test-management-page__form-input"
                        value={dim.endpoint_b_code}
                        onChange={(e) =>
                          updateDimension(dimIndex, { endpoint_b_code: e.target.value })
                        }
                        placeholder="例如: M"
                      />
                    </div>

                    <div className="test-management-page__form-row">
                      <label className="test-management-page__form-label">
                        端点B名称 <span className="test-management-page__form-required">*</span>
                      </label>
                      <input
                        type="text"
                        className="test-management-page__form-input"
                        value={dim.endpoint_b_name}
                        onChange={(e) =>
                          updateDimension(dimIndex, { endpoint_b_name: e.target.value })
                        }
                        placeholder="例如: 自由创作"
                      />
                    </div>

                    <div className="test-management-page__form-row">
                      <label className="test-management-page__form-label">维度描述</label>
                      <textarea
                        className="test-management-page__form-textarea"
                        value={dim.description}
                        onChange={(e) =>
                          updateDimension(dimIndex, { description: e.target.value })
                        }
                        placeholder="可选：描述该维度评估的内容"
                        rows={2}
                      />
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="test-management-page__form-row">
              <label className="test-management-page__form-label">排序权重</label>
              <input
                type="number"
                className="test-management-page__form-input"
                value={draft.display_order}
                onChange={(e) =>
                  setDraft({ ...draft, display_order: Number(e.target.value) || 100 })
                }
                placeholder="100"
              />
            </div>
          </div>

          <div className="test-management-page__form-section">
            <div className="test-management-page__form-section-header">
              <h3 className="test-management-page__form-section-title">测试题目</h3>
              <button
                type="button"
                className="test-management-page__form-button--small"
                onClick={addQuestion}
              >
                <MaterialIcon name="add" />
                添加题目
              </button>
            </div>

            {draft.questions.length === 0 ? (
              <div className="test-management-page__form-empty">
                暂无题目，请点击"添加题目"按钮添加
              </div>
            ) : (
              draft.questions.map((question, qIndex) => (
                <div key={qIndex} className="test-management-page__question-card">
                  <div className="test-management-page__question-header">
                    <h4 className="test-management-page__question-title">
                      题目 {qIndex + 1}
                    </h4>
                    <button
                      type="button"
                      className="test-management-page__question-remove"
                      onClick={() => removeQuestion(qIndex)}
                    >
                      <MaterialIcon name="delete" />
                      删除
                    </button>
                  </div>

                  <div className="test-management-page__form-row">
                    <label className="test-management-page__form-label">
                      题目名称 <span className="test-management-page__form-required">*</span>
                    </label>
                    <input
                      type="text"
                      className="test-management-page__form-input"
                      value={question.question_text}
                      onChange={(e) =>
                        updateQuestion(qIndex, { question_text: e.target.value })
                      }
                      placeholder="例如: 你准备开始今天的绘画，却不知道先画什么："
                    />
                  </div>

                  {draft.test_type === "type_1" ? (
                    <>
                      <div className="test-management-page__form-row">
                        <label className="test-management-page__form-label">
                          对应维度 <span className="test-management-page__form-required">*</span>
                        </label>
                        {draft.dimensions.length === 0 ? (
                          <div className="test-management-page__form-hint" style={{ color: "#ff6b6b" }}>
                            ⚠️ 请先在"测试维度"中添加至少一个维度
                          </div>
                        ) : (
                          <select
                            className="test-management-page__form-input"
                            value={question.dimension_index !== undefined ? question.dimension_index : ""}
                            onChange={(e) => {
                              const dimIndex = e.target.value === "" ? undefined : Number(e.target.value);
                              const dim = dimIndex !== undefined && dimIndex >= 0 && dimIndex < draft.dimensions.length
                                ? draft.dimensions[dimIndex]
                                : null;
                              updateQuestion(qIndex, {
                                dimension_index: dimIndex,
                                endpoint_code: dim?.endpoint_a_code || "",
                              });
                            }}
                          >
                            <option value="">请选择维度</option>
                            {draft.dimensions.map((dim, dimIndex) => (
                              <option key={dimIndex} value={dimIndex}>
                                {dim.name} ({dim.endpoint_a_code} ↔ {dim.endpoint_b_code})
                              </option>
                            ))}
                          </select>
                        )}
                      </div>

                      {question.dimension_index !== undefined && question.dimension_index >= 0 && question.dimension_index < draft.dimensions.length && (() => {
                        const dim = draft.dimensions[question.dimension_index];
                        if (!dim) return null;
                        
                        return (
                          <div className="test-management-page__form-row">
                            <label className="test-management-page__form-label">
                              维度端点 <span className="test-management-page__form-required">*</span>
                            </label>
                            <select
                              className="test-management-page__form-input"
                              value={question.endpoint_code || ""}
                              onChange={(e) =>
                                updateQuestion(qIndex, { endpoint_code: e.target.value })
                              }
                            >
                              <option value={dim.endpoint_a_code}>
                                {dim.endpoint_a_code} ({dim.endpoint_a_name})
                              </option>
                              <option value={dim.endpoint_b_code}>
                                {dim.endpoint_b_code} ({dim.endpoint_b_name})
                              </option>
                            </select>
                          </div>
                        );
                      })()}

                      <div className="test-management-page__form-row">
                        <label className="test-management-page__form-label">
                          5个选择强度对应的分值 <span className="test-management-page__form-required">*</span>
                        </label>
                        <div className="test-management-page__score-config">
                          <div className="test-management-page__score-item">
                            <label>非常同意 (-2)</label>
                            <input
                              type="number"
                              className="test-management-page__form-input"
                              value={question.score_config?.["-2"] || 0}
                              onChange={(e) => {
                                const scoreConfig = { ...(question.score_config || {}) };
                                scoreConfig["-2"] = Number(e.target.value) || 0;
                                updateQuestion(qIndex, { score_config: scoreConfig });
                              }}
                            />
                          </div>
                          <div className="test-management-page__score-item">
                            <label>比较同意 (-1)</label>
                            <input
                              type="number"
                              className="test-management-page__form-input"
                              value={question.score_config?.["-1"] || 0}
                              onChange={(e) => {
                                const scoreConfig = { ...(question.score_config || {}) };
                                scoreConfig["-1"] = Number(e.target.value) || 0;
                                updateQuestion(qIndex, { score_config: scoreConfig });
                              }}
                            />
                          </div>
                          <div className="test-management-page__score-item">
                            <label>中立 (0)</label>
                            <input
                              type="number"
                              className="test-management-page__form-input"
                              value={question.score_config?.["0"] || 0}
                              onChange={(e) => {
                                const scoreConfig = { ...(question.score_config || {}) };
                                scoreConfig["0"] = Number(e.target.value) || 0;
                                updateQuestion(qIndex, { score_config: scoreConfig });
                              }}
                            />
                          </div>
                          <div className="test-management-page__score-item">
                            <label>比较不同意 (1)</label>
                            <input
                              type="number"
                              className="test-management-page__form-input"
                              value={question.score_config?.["1"] || 0}
                              onChange={(e) => {
                                const scoreConfig = { ...(question.score_config || {}) };
                                scoreConfig["1"] = Number(e.target.value) || 0;
                                updateQuestion(qIndex, { score_config: scoreConfig });
                              }}
                            />
                          </div>
                          <div className="test-management-page__score-item">
                            <label>非常不同意 (2)</label>
                            <input
                              type="number"
                              className="test-management-page__form-input"
                              value={question.score_config?.["2"] || 0}
                              onChange={(e) => {
                                const scoreConfig = { ...(question.score_config || {}) };
                                scoreConfig["2"] = Number(e.target.value) || 0;
                                updateQuestion(qIndex, { score_config: scoreConfig });
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="test-management-page__form-row">
                        <label className="test-management-page__form-label">
                          选项数量 <span className="test-management-page__form-required">*</span>
                        </label>
                        <select
                          className="test-management-page__form-input"
                          value={question.option_count || 4}
                          onChange={(e) =>
                            updateQuestionOptionCount(qIndex, Number(e.target.value))
                          }
                        >
                          <option value={4}>4 个选项（类型2固定）</option>
                        </select>
                      </div>

                      <div className="test-management-page__options-list">
                        {(question.options || []).map((option, oIndex) => (
                          <div key={oIndex} className="test-management-page__option-item">
                            <div className="test-management-page__form-row">
                              <label className="test-management-page__form-label">
                                选项 {oIndex + 1} 文本{" "}
                                <span className="test-management-page__form-required">*</span>
                              </label>
                              <input
                                type="text"
                                className="test-management-page__form-input"
                                value={option.text}
                                onChange={(e) =>
                                  updateQuestionOption(qIndex, oIndex, { text: e.target.value })
                                }
                                placeholder="例如: 会先翻之前的草稿或参考，找个入口"
                              />
                            </div>
                            <div className="test-management-page__form-row">
                              <label className="test-management-page__form-label">
                                选项 {oIndex + 1} 维度分值（选择该选项时给各维度加的分值）
                              </label>
                              <div className="test-management-page__dimension-scores">
                                {draft.dimensions.map((dim, dimIndex) => {
                                  const dimensionScores = option.dimension_scores || {};
                                  return (
                                    <div key={dimIndex} className="test-management-page__dimension-score-item">
                                      <label className="test-management-page__form-label">
                                        {dim.name} ({dim.endpoint_a_code} / {dim.endpoint_b_code})
                                      </label>
                                      <div className="test-management-page__dimension-score-inputs">
                                        <input
                                          type="number"
                                          className="test-management-page__form-input"
                                          placeholder={`${dim.endpoint_a_code}分值`}
                                          value={dimensionScores[dim.endpoint_a_code] || ""}
                                          onChange={(e) => {
                                            const newScores = {
                                              ...dimensionScores,
                                              [dim.endpoint_a_code]: Number(e.target.value) || 0,
                                            };
                                            if (newScores[dim.endpoint_a_code] === 0) {
                                              delete newScores[dim.endpoint_a_code];
                                            }
                                            updateQuestionOption(qIndex, oIndex, {
                                              dimension_scores: newScores,
                                            });
                                          }}
                                        />
                                        <input
                                          type="number"
                                          className="test-management-page__form-input"
                                          placeholder={`${dim.endpoint_b_code}分值`}
                                          value={dimensionScores[dim.endpoint_b_code] || ""}
                                          onChange={(e) => {
                                            const newScores = {
                                              ...dimensionScores,
                                              [dim.endpoint_b_code]: Number(e.target.value) || 0,
                                            };
                                            if (newScores[dim.endpoint_b_code] === 0) {
                                              delete newScores[dim.endpoint_b_code];
                                            }
                                            updateQuestionOption(qIndex, oIndex, {
                                              dimension_scores: newScores,
                                            });
                                          }}
                                        />
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              ))
            )}
          </div>

          <div className="test-management-page__form-actions">
            <button
              type="button"
              className="test-management-page__form-button test-management-page__form-button--primary"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? "保存中..." : "保存"}
            </button>
            <button
              type="button"
              className="test-management-page__form-button"
              onClick={resetDraft}
              disabled={saving}
            >
              取消
            </button>
          </div>
        </div>
      )}

      <div className="test-management-page__list">
        {tests.length === 0 ? (
          <div className="test-management-page__empty">暂无测试</div>
        ) : (
          tests.map((test) => (
            <div key={test.id} className="test-management-page__item">
              <div className="test-management-page__item-content">
                <div className="test-management-page__item-header">
                  <h3 className="test-management-page__item-name">{test.name}</h3>
                  <span className="test-management-page__item-slug">({test.slug})</span>
                </div>
                {test.description && (
                  <p className="test-management-page__item-description">{test.description}</p>
                )}
                <div className="test-management-page__item-meta">
                  <span>类型: {test.test_type === "type_1" ? "类型1（5级选择）" : "类型2（4个选项）"}</span>
                  <span>维度: {test.dimensions.map((d) => d.name).join(", ")}</span>
                  <span>题目数: {test.question_count}</span>
                  <span>排序: {test.display_order}</span>
                </div>
              </div>
              <div className="test-management-page__item-actions">
                <button
                  type="button"
                  className="test-management-page__item-button"
                  onClick={() => handleEdit(test)}
                  disabled={editingId !== null}
                >
                  <MaterialIcon name="edit" />
                  编辑
                </button>
                <button
                  type="button"
                  className="test-management-page__item-button test-management-page__item-button--danger"
                  onClick={() => handleDelete(test.id)}
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

export default TestManagementPage;

