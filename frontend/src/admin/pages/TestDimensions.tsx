import { useEffect, useState } from "react";
import { isAxiosError } from "axios";

import MaterialIcon from "@/components/MaterialIcon";
import {
  createTestDimension,
  deleteTestDimension,
  listTestDimensions,
  updateTestDimension,
} from "@/admin/api";
import type { AdminTestDimension } from "@/admin/api";

import "../styles/TestDimensions.css";

const DIMENSION_EMPTY = {
  code: "",
  name: "",
  endpoint_a_code: "",
  endpoint_a_name: "",
  endpoint_b_code: "",
  endpoint_b_name: "",
  description: "",
  display_order: "100",
};

function TestDimensionsPage() {
  const [dimensions, setDimensions] = useState<AdminTestDimension[]>([]);
  const [draft, setDraft] = useState(DIMENSION_EMPTY);
  const [editingId, setEditingId] = useState<number | "new" | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const data = await listTestDimensions();
        setDimensions(data);
      } catch (err) {
        handleError(err, "加载测试维度失败，请稍后再试。");
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
    setDraft(DIMENSION_EMPTY);
    setEditingId(null);
    setSaving(false);
    setError(null);
  };

  const handleSave = async () => {
    if (saving || editingId === null) {
      return;
    }

    const trimmedCode = draft.code.trim();
    const trimmedName = draft.name.trim();
    const trimmedEndpointACode = draft.endpoint_a_code.trim();
    const trimmedEndpointAName = draft.endpoint_a_name.trim();
    const trimmedEndpointBCode = draft.endpoint_b_code.trim();
    const trimmedEndpointBName = draft.endpoint_b_name.trim();
    const displayOrder = Number(draft.display_order) || 100;

    if (!trimmedCode) {
      setError("请填写维度标识 code。");
      return;
    }
    if (!trimmedName) {
      setError("请填写维度名称。");
      return;
    }
    if (!trimmedEndpointACode) {
      setError("请填写端点A的标识。");
      return;
    }
    if (!trimmedEndpointAName) {
      setError("请填写端点A的名称。");
      return;
    }
    if (!trimmedEndpointBCode) {
      setError("请填写端点B的标识。");
      return;
    }
    if (!trimmedEndpointBName) {
      setError("请填写端点B的名称。");
      return;
    }

    setSaving(true);
    setError(null);

    const payload = {
      code: trimmedCode,
      name: trimmedName,
      endpoint_a_code: trimmedEndpointACode,
      endpoint_a_name: trimmedEndpointAName,
      endpoint_b_code: trimmedEndpointBCode,
      endpoint_b_name: trimmedEndpointBName,
      description: draft.description.trim(),
      display_order: displayOrder,
    };

    try {
      if (editingId === "new") {
        const created = await createTestDimension(payload);
        setDimensions((prev) => [created, ...prev]);
      } else {
        const updated = await updateTestDimension(editingId, payload);
        setDimensions((prev) => prev.map((item) => (item.id === editingId ? updated : item)));
      }
      resetDraft();
    } catch (err) {
      handleError(err, "保存测试维度失败。");
    } finally {
      setSaving(false);
    }
  };

  const startCreate = () => {
    if (editingId !== null) return;
    setDraft(DIMENSION_EMPTY);
    setEditingId("new");
  };

  const handleEdit = (dimension: AdminTestDimension) => {
    if (editingId !== null) return;
    setDraft({
      code: dimension.code,
      name: dimension.name,
      endpoint_a_code: dimension.endpoint_a_code,
      endpoint_a_name: dimension.endpoint_a_name,
      endpoint_b_code: dimension.endpoint_b_code,
      endpoint_b_name: dimension.endpoint_b_name,
      description: dimension.description ?? "",
      display_order: String(dimension.display_order),
    });
    setEditingId(dimension.id);
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm("确定要删除这个测试维度吗？此操作不可恢复。")) {
      return;
    }

    try {
      await deleteTestDimension(id);
      setDimensions((prev) => prev.filter((item) => item.id !== id));
    } catch (err) {
      handleError(err, "删除测试维度失败。");
    }
  };

  const sortedDimensions = [...dimensions].sort((a, b) => {
    if (a.display_order !== b.display_order) {
      return a.display_order - b.display_order;
    }
    return a.code.localeCompare(b.code);
  });

  if (loading) {
    return (
      <div className="test-dimensions-page">
        <div className="test-dimensions-page__loading">加载中...</div>
      </div>
    );
  }

  return (
    <div className="test-dimensions-page">
      <div className="test-dimensions-page__header">
        <h1 className="test-dimensions-page__title">测试维度管理</h1>
        <button
          type="button"
          className="test-dimensions-page__create-button"
          onClick={startCreate}
          disabled={editingId !== null}
        >
          <MaterialIcon name="add" />
          新建维度
        </button>
      </div>

      {error && (
        <div className="test-dimensions-page__error">
          <MaterialIcon name="error" />
          {error}
        </div>
      )}

      {editingId !== null && (
        <div className="test-dimensions-page__form">
          <h2 className="test-dimensions-page__form-title">
            {editingId === "new" ? "新建测试维度" : "编辑测试维度"}
          </h2>

          <div className="test-dimensions-page__form-row">
            <label className="test-dimensions-page__form-label">
              维度标识 (code) <span className="test-dimensions-page__form-required">*</span>
            </label>
            <input
              type="text"
              className="test-dimensions-page__form-input"
              value={draft.code}
              onChange={(e) => setDraft({ ...draft, code: e.target.value })}
              placeholder="例如: creative_style"
            />
          </div>

          <div className="test-dimensions-page__form-row">
            <label className="test-dimensions-page__form-label">
              维度名称 <span className="test-dimensions-page__form-required">*</span>
            </label>
            <input
              type="text"
              className="test-dimensions-page__form-input"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              placeholder="例如: 创作风格"
            />
          </div>

          <div className="test-dimensions-page__form-section">
            <h3 className="test-dimensions-page__form-section-title">端点A</h3>
            <div className="test-dimensions-page__form-row">
              <label className="test-dimensions-page__form-label">
                端点A标识 <span className="test-dimensions-page__form-required">*</span>
              </label>
              <input
                type="text"
                className="test-dimensions-page__form-input"
                value={draft.endpoint_a_code}
                onChange={(e) => setDraft({ ...draft, endpoint_a_code: e.target.value })}
                placeholder="例如: o"
              />
            </div>
            <div className="test-dimensions-page__form-row">
              <label className="test-dimensions-page__form-label">
                端点A名称 <span className="test-dimensions-page__form-required">*</span>
              </label>
              <input
                type="text"
                className="test-dimensions-page__form-input"
                value={draft.endpoint_a_name}
                onChange={(e) => setDraft({ ...draft, endpoint_a_name: e.target.value })}
                placeholder="例如: 有序创作"
              />
            </div>
          </div>

          <div className="test-dimensions-page__form-section">
            <h3 className="test-dimensions-page__form-section-title">端点B</h3>
            <div className="test-dimensions-page__form-row">
              <label className="test-dimensions-page__form-label">
                端点B标识 <span className="test-dimensions-page__form-required">*</span>
              </label>
              <input
                type="text"
                className="test-dimensions-page__form-input"
                value={draft.endpoint_b_code}
                onChange={(e) => setDraft({ ...draft, endpoint_b_code: e.target.value })}
                placeholder="例如: M"
              />
            </div>
            <div className="test-dimensions-page__form-row">
              <label className="test-dimensions-page__form-label">
                端点B名称 <span className="test-dimensions-page__form-required">*</span>
              </label>
              <input
                type="text"
                className="test-dimensions-page__form-input"
                value={draft.endpoint_b_name}
                onChange={(e) => setDraft({ ...draft, endpoint_b_name: e.target.value })}
                placeholder="例如: 自由创作"
              />
            </div>
          </div>

          <div className="test-dimensions-page__form-row">
            <label className="test-dimensions-page__form-label">维度描述</label>
            <textarea
              className="test-dimensions-page__form-textarea"
              value={draft.description}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              placeholder="可选：描述该维度评估的内容"
              rows={3}
            />
          </div>

          <div className="test-dimensions-page__form-row">
            <label className="test-dimensions-page__form-label">排序权重</label>
            <input
              type="number"
              className="test-dimensions-page__form-input"
              value={draft.display_order}
              onChange={(e) => setDraft({ ...draft, display_order: e.target.value })}
              placeholder="100"
            />
          </div>

          <div className="test-dimensions-page__form-actions">
            <button
              type="button"
              className="test-dimensions-page__form-button test-dimensions-page__form-button--primary"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? "保存中..." : "保存"}
            </button>
            <button
              type="button"
              className="test-dimensions-page__form-button"
              onClick={resetDraft}
              disabled={saving}
            >
              取消
            </button>
          </div>
        </div>
      )}

      <div className="test-dimensions-page__list">
        {sortedDimensions.length === 0 ? (
          <div className="test-dimensions-page__empty">暂无测试维度</div>
        ) : (
          sortedDimensions.map((dimension) => (
            <div key={dimension.id} className="test-dimensions-page__item">
              <div className="test-dimensions-page__item-content">
                <div className="test-dimensions-page__item-header">
                  <h3 className="test-dimensions-page__item-name">{dimension.name}</h3>
                  <span className="test-dimensions-page__item-code">({dimension.code})</span>
                </div>
                <div className="test-dimensions-page__item-endpoints">
                  <span className="test-dimensions-page__item-endpoint">
                    {dimension.endpoint_a_code}: {dimension.endpoint_a_name}
                  </span>
                  <span className="test-dimensions-page__item-separator">↔</span>
                  <span className="test-dimensions-page__item-endpoint">
                    {dimension.endpoint_b_code}: {dimension.endpoint_b_name}
                  </span>
                </div>
                {dimension.description && (
                  <p className="test-dimensions-page__item-description">{dimension.description}</p>
                )}
                <div className="test-dimensions-page__item-meta">
                  <span>排序: {dimension.display_order}</span>
                </div>
              </div>
              <div className="test-dimensions-page__item-actions">
                <button
                  type="button"
                  className="test-dimensions-page__item-button"
                  onClick={() => handleEdit(dimension)}
                  disabled={editingId !== null}
                >
                  <MaterialIcon name="edit" />
                  编辑
                </button>
                <button
                  type="button"
                  className="test-dimensions-page__item-button test-dimensions-page__item-button--danger"
                  onClick={() => handleDelete(dimension.id)}
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

export default TestDimensionsPage;











