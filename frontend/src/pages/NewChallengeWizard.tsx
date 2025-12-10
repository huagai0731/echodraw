import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent as ReactFormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { isAxiosError } from "axios";

import MaterialIcon from "@/components/MaterialIcon";
import {
  createShortTermGoal,
  updateShortTermGoal,
  createUserTaskPreset,
  deleteUserTaskPreset,
  fetchShortTermTaskPresets,
  hasAuthToken,
  type ShortTermGoal,
  type ShortTermGoalDay,
  type ShortTermTaskPreset,
  type ShortTermTaskPresetBundle,
  type UserTaskPreset,
} from "@/services/api";

import "./NewChallengeWizard.css";

type StepKey = "duration" | "type" | "tasks" | "confirm";

type NewChallengeWizardProps = {
  onClose: () => void;
  onSaved: (goal: ShortTermGoal) => void;
  initialGoal?: ShortTermGoal | null;
  mode?: "create" | "edit";
  onNavigateToProfile?: () => void;
};

type PlanType = "same" | "different";

type TaskCategory = {
  id: string;
  name: string;
};

type TaskItem = {
  id: string;
  categoryId: string;
  title: string;
  subtitle: string;
  metadata: Record<string, unknown>;
  origin: "global" | "custom";
  presetId?: number | null;
};

type SelectedTask = {
  instanceId: string;
  sourceId: string;
  categoryId: string;
  title: string;
  subtitle: string;
  metadata?: Record<string, unknown>;
};

type CustomPresetState = {
  creating: boolean;
  deletingId: number | null;
  error: string | null;
};

const MY_CATEGORY_ID = "我的";

const DURATIONS = [7, 14, 21, 28];

// 计算容错天数（周期天数 + 2）
function getToleranceDays(cycleDays: number): number {
  return cycleDays + 2;
}

const PLAN_TYPES: Array<{
  id: PlanType;
  title: string;
  subtitle: string;
}> = [
  {
    id: "same",
    title: "每日相同任务",
    subtitle: "适合想培养固定习惯或者有明确练习目的的小画师，比如每天画同一种练习，让能力更稳定。",
  },
  {
    id: "different",
    title: "每日设置不同任务",
    subtitle: "适合想探索更多内容的小画师，无论是针对性训练，还是试着突破自己没画过的方向。",
  },
];

const FALLBACK_TASK_CATEGORIES: TaskCategory[] = [
  { id: MY_CATEGORY_ID, name: "我的" },
  { id: "sketch", name: "速写" },
  { id: "color", name: "色彩" },
  { id: "inspiration", name: "灵感" },
  { id: "study", name: "学习" },
];

const FALLBACK_TASK_LIBRARY: TaskItem[] = [
  {
    id: "sketch-dynamic",
    categoryId: "sketch",
    title: "人物动态",
    subtitle: "练习快速捕捉人体姿态",
    metadata: {},
    origin: "global",
  },
  {
    id: "sketch-gesture",
    categoryId: "sketch",
    title: "姿势速写",
    subtitle: "5 分钟快速姿势练习",
    metadata: {},
    origin: "global",
  },
  {
    id: "sketch-comp",
    categoryId: "sketch",
    title: "构图重构",
    subtitle: "重绘经典作品的构图框架",
    metadata: {},
    origin: "global",
  },
  {
    id: "color-complementary",
    categoryId: "color",
    title: "互补色研究",
    subtitle: "高饱和度颜色搭配实验",
    metadata: {},
    origin: "global",
  },
  {
    id: "color-light",
    categoryId: "color",
    title: "光影配色",
    subtitle: "模拟不同光源下的色温变化",
    metadata: {},
    origin: "global",
  },
  {
    id: "inspiration-board",
    categoryId: "inspiration",
    title: "灵感墙整理",
    subtitle: "收集 5 个钢笔画参考并点评",
    metadata: {},
    origin: "global",
  },
  {
    id: "inspiration-writing",
    categoryId: "inspiration",
    title: "创作意图记录",
    subtitle: "写下明日创作的 3 个关键词",
    metadata: {},
    origin: "global",
  },
  {
    id: "study-perspective",
    categoryId: "study",
    title: "场景透视",
    subtitle: "一点与两点透视法练习",
    metadata: {},
    origin: "global",
  },
  {
    id: "study-anatomy",
    categoryId: "study",
    title: "解剖结构",
    subtitle: "分析肩颈肌群的结构关系",
    metadata: {},
    origin: "global",
  },
];

const STEPS: StepKey[] = ["duration", "type", "tasks", "confirm"];
const DEFAULT_PLAN_NAME = "我的短期目标";

function NewChallengeWizard({ onClose, onSaved, initialGoal, mode = "create", onNavigateToProfile }: NewChallengeWizardProps) {
  const [stepIndex, setStepIndex] = useState(0);
  const [durationIndex, setDurationIndex] = useState(0);
  const [planType, setPlanType] = useState<PlanType>("same");
  const [planName, setPlanName] = useState(DEFAULT_PLAN_NAME);
  const [taskCategories, setTaskCategories] = useState<TaskCategory[]>(FALLBACK_TASK_CATEGORIES);
  const [customPresetState, setCustomPresetState] = useState<CustomPresetState>({
    creating: false,
    deletingId: null,
    error: null,
  });
  const [taskLibrary, setTaskLibrary] = useState<TaskItem[]>(FALLBACK_TASK_LIBRARY);
  const [_userPresets, setUserPresets] = useState<UserTaskPreset[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>(
    FALLBACK_TASK_CATEGORIES[0]?.id ?? "",
  );
  const [selectedDay, setSelectedDay] = useState(0);
  const [selectedTasks, setSelectedTasks] = useState<Record<number, SelectedTask[]>>({});
  const [hasCustomizedTasks, setHasCustomizedTasks] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showMissingTasksAlert, setShowMissingTasksAlert] = useState(false);
  const [missingTaskDays, setMissingTaskDays] = useState<number[]>([]);
  const [showLoginConfirm, setShowLoginConfirm] = useState(false);
  const taskInstanceCounter = useRef(0);
  const goalIdRef = useRef<number | null>(initialGoal?.id ?? null);

  const createSelectedTask = useCallback(
    (task: TaskItem, overrides?: Partial<Pick<SelectedTask, "title" | "subtitle">>) => {
      taskInstanceCounter.current += 1;
      return {
        instanceId: `task-${taskInstanceCounter.current}`,
        sourceId: task.id,
        categoryId: task.categoryId,
        title: overrides?.title ?? task.title,
        subtitle: overrides?.subtitle ?? task.subtitle,
        metadata: task.metadata,
      };
    },
    [],
  );

  const mapUserPresetToTaskItem = useCallback((preset: UserTaskPreset): TaskItem => {
    return {
      id: `custom-${preset.slug}`,
      categoryId: MY_CATEGORY_ID,
      title: preset.title,
      subtitle: preset.description,
      metadata: preset.metadata ?? {},
      origin: "custom",
      presetId: preset.id,
    };
  }, []);

  useEffect(() => {
    let mounted = true;

    const mapPresetToTaskItem = (preset: ShortTermTaskPreset): TaskItem => ({
      id: preset.code,
      categoryId: preset.category || MY_CATEGORY_ID,
      title: preset.title,
      subtitle: preset.description,
      metadata: preset.metadata ?? {},
      origin: preset.origin ?? "global",
      presetId: preset.presetId ?? null,
    });

    const ensureCategories = (
      bundle: ShortTermTaskPresetBundle,
      tasks: TaskItem[],
    ): TaskCategory[] => {
      const provided = bundle.categories ?? [];
      const normalizedProvided = provided
        .map((category) => ({
          id: category.id,
          name: category.name,
        }))
        .filter((category) => category.id && category.name);

      if (normalizedProvided.length === 0 && tasks.length === 0) {
        return FALLBACK_TASK_CATEGORIES;
      }

      const categoryMap = new Map<string, string>();
      normalizedProvided.forEach((category) => {
        categoryMap.set(category.id, category.name);
      });

      tasks.forEach((task) => {
        if (!task.categoryId) {
          return;
        }
        if (!categoryMap.has(task.categoryId)) {
          categoryMap.set(task.categoryId, task.categoryId);
        }
      });

      if (!categoryMap.has(MY_CATEGORY_ID)) {
        categoryMap.set(MY_CATEGORY_ID, MY_CATEGORY_ID);
      }

      const result = Array.from(categoryMap.entries()).map(([id, name]) => ({
        id,
        name,
      }));
      // 确保"我的"在第一位
      const myIndex = result.findIndex((cat) => cat.id === MY_CATEGORY_ID);
      if (myIndex > 0) {
        const myCategory = result.splice(myIndex, 1)[0];
        result.unshift(myCategory);
      }
      return result;
    };

    const loadPresets = async () => {
      try {
        const bundle = await fetchShortTermTaskPresets();
        if (!mounted) {
          return;
        }
        // 处理全局任务
        const globalTasks = bundle.tasks.length
          ? bundle.tasks.map(mapPresetToTaskItem)
          : FALLBACK_TASK_LIBRARY;
        
        // 处理用户自定义任务
        const userTasks = bundle.userPresets.map(mapUserPresetToTaskItem);
        
        // 保存用户预设列表
        setUserPresets(bundle.userPresets);
        
        // 合并所有任务
        const allTasks = [...globalTasks, ...userTasks];
        
        const categories = ensureCategories(bundle, allTasks);
        setTaskLibrary(allTasks);
        setTaskCategories(categories);
      } catch (error) {
        console.warn("[Echo] Failed to load short-term task presets from backend:", error);
        if (!mounted) {
          return;
        }
        setTaskLibrary(FALLBACK_TASK_LIBRARY);
        setTaskCategories(FALLBACK_TASK_CATEGORIES);
      }
    };

    void loadPresets();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (taskCategories.length === 0) {
      setSelectedCategory("");
      return;
    }
    setSelectedCategory((prev) =>
      prev && taskCategories.some((category) => category.id === prev)
        ? prev
        : taskCategories[0].id,
    );
  }, [taskCategories]);

  // 初始化编辑模式的数据
  useEffect(() => {
    if (mode === "edit" && initialGoal) {
      setPlanName(initialGoal.title);
      setPlanType(initialGoal.planType);
      const durationIdx = DURATIONS.indexOf(initialGoal.durationDays);
      if (durationIdx >= 0) {
        setDurationIndex(durationIdx);
      }
      
      // 转换schedule为selectedTasks格式
      const tasksMap: Record<number, SelectedTask[]> = {};
      initialGoal.schedule.forEach((day) => {
        const dayTasks = day.tasks.map((task) => createSelectedTask({
          id: task.taskId,
          categoryId: "custom",
          title: task.title,
          subtitle: task.subtitle,
          metadata: {},
          origin: "custom",
        }));
        tasksMap[day.dayIndex] = dayTasks;
      });
      setSelectedTasks(tasksMap);
      setHasCustomizedTasks(true);
    }
  }, [mode, initialGoal, createSelectedTask]);

  useEffect(() => {
    if (hasCustomizedTasks || taskLibrary.length === 0 || (mode === "edit" && initialGoal)) {
      return;
    }

    setSelectedTasks((prev) => {
      if (Object.keys(prev).length > 0) {
        return prev;
      }
      const defaults = taskLibrary.slice(0, 2).map((task) => createSelectedTask(task));
      if (defaults.length === 0) {
        return prev;
      }
      return {
        0: defaults,
      };
    });
  }, [createSelectedTask, hasCustomizedTasks, taskLibrary, mode, initialGoal]);

  const step = STEPS[stepIndex];
  const duration = DURATIONS[durationIndex];

  const mapTasksForApi = useCallback((tasks: SelectedTask[]) => {
    return tasks.map((task) => ({
      taskId: task.instanceId,
      title: task.title.trim() || task.sourceId,
      subtitle: task.subtitle,
    }));
  }, []);

  const buildSchedule = useCallback((): ShortTermGoalDay[] => {
    if (planType === "same") {
      return [
        {
          dayIndex: 0,
          tasks: mapTasksForApi(selectedTasks[0] ?? []),
        },
      ];
    }

    const schedule: ShortTermGoalDay[] = [];
    for (let index = 0; index < duration; index += 1) {
      const tasksForDay = selectedTasks[index] ?? [];
      if (tasksForDay.length === 0) {
        continue;
      }
      schedule.push({
        dayIndex: index,
        tasks: mapTasksForApi(tasksForDay),
      });
    }
    return schedule;
  }, [duration, mapTasksForApi, planType, selectedTasks]);

  const stepLabel = useMemo(() => {
    switch (step) {
      case "duration":
        return "选择目标时长";
      case "type":
        return "选择任务类型";
      case "tasks":
        return "设定每日任务";
      case "confirm":
        return "确认你的计划";
      default:
        return "";
    }
  }, [step]);

  const dayLabels = useMemo(() => {
    return Array.from({ length: duration }).map((_, index) => {
      const dayNumber = index + 1;
      // 第1、8、15、22天显示为 "Day1"、"Day8" 等，其他只显示数字
      if (dayNumber === 1 || dayNumber === 8 || dayNumber === 15 || dayNumber === 22) {
        return `Day${dayNumber}`;
      }
      return String(dayNumber);
    });
  }, [duration]);

  // 格式化未设置任务的天数标签
  const formatMissingDays = useCallback((days: number[]): string => {
    return days.map((dayNumber) => `Day${dayNumber}`).join("、");
  }, []);

  const availableTasks = useMemo(() => {
    if (selectedCategory === MY_CATEGORY_ID) {
      // "我的"栏目只显示用户自定义的任务
      return taskLibrary.filter((task) => task.origin === "custom");
    }
    const filtered = taskLibrary.filter((task) => task.categoryId === selectedCategory);
    if (filtered.length > 0) {
      return filtered;
    }
    return taskLibrary;
  }, [selectedCategory, taskLibrary]);

  const tasksForCurrentDay =
    planType === "same" ? selectedTasks[0] ?? [] : selectedTasks[selectedDay] ?? [];

  const handlePlanTypeChange = useCallback((value: PlanType) => {
    setPlanType(value);
    setSaveError(null);
    if (value === "same") {
      setSelectedDay(0);
      setSelectedTasks((prev) => {
        const combined: SelectedTask[] = [];
        Object.values(prev).forEach((tasks) => {
          tasks.forEach((task) => combined.push(task));
        });
        return {
          0: combined,
        };
      });
    }
  }, []);

  const handleAddTask = (task: TaskItem) => {
    const targetDay = planType === "same" ? 0 : selectedDay;
    setSelectedTasks((prev) => {
      const current = prev[targetDay] ?? [];
      const nextTask = createSelectedTask(task);
      return {
        ...prev,
        [targetDay]: [...current, nextTask],
      };
    });
    setHasCustomizedTasks(true);
  };

  const handleRemoveTask = (instanceId: string) => {
    let removed = false;
    setSelectedTasks((prev) => {
      const next: Record<number, SelectedTask[]> = {};
      Object.entries(prev).forEach(([key, list]) => {
        const dayIndex = Number(key);
        const source = list ?? [];
        const filtered = source.filter((item) => item.instanceId !== instanceId);
        if (filtered.length !== source.length) {
          removed = true;
          next[dayIndex] = filtered;
        } else {
          next[dayIndex] = source;
        }
      });
      return removed ? next : prev;
    });
    if (removed) {
      setHasCustomizedTasks(true);
    }
  };

  const handleDecrementTask = (sourceId: string) => {
    const targetDay = planType === "same" ? 0 : selectedDay;
    let removed = false;
    setSelectedTasks((prev) => {
      const current = prev[targetDay] ?? [];
      if (current.length === 0) {
        return prev;
      }
      let removeIndex = -1;
      for (let index = current.length - 1; index >= 0; index -= 1) {
        if (current[index].sourceId === sourceId) {
          removeIndex = index;
          break;
        }
      }
      if (removeIndex === -1) {
        return prev;
      }
      removed = true;
      const nextDayTasks = [...current.slice(0, removeIndex), ...current.slice(removeIndex + 1)];
      return {
        ...prev,
        [targetDay]: nextDayTasks,
      };
    });
    if (removed) {
      setHasCustomizedTasks(true);
    }
  };

  const handleUpdateTask = (instanceId: string, payload: { title: string; subtitle: string }) => {
    let updated = false;
    const normalizedTitle = payload.title.trim();
    const normalizedSubtitle = payload.subtitle.trim();
    setSelectedTasks((prev) => {
      const next: Record<number, SelectedTask[]> = {};
      Object.entries(prev).forEach(([key, list]) => {
        const dayIndex = Number(key);
        const source = list ?? [];
        const mapped = source.map((task) => {
          if (task.instanceId !== instanceId) {
            return task;
          }
          updated = true;
          return {
            ...task,
            title: normalizedTitle || task.title,
            subtitle: normalizedSubtitle,
          };
        });
        next[dayIndex] = mapped;
      });
      return updated ? next : prev;
    });
    if (updated) {
      setHasCustomizedTasks(true);
    }
  };

  const resetCustomPresetError = useCallback(() => {
    setCustomPresetState((prev) => (prev.error ? { ...prev, error: null } : prev));
  }, []);

  const handleCreateCustomPreset = useCallback(
    async (input: { title: string; description: string }) => {
      const title = input.title.trim();
      const description = input.description.trim();
      if (!title) {
        setCustomPresetState((prev) => ({ ...prev, error: "请填写任务名称" }));
        return false;
      }

      setCustomPresetState((prev) => ({ ...prev, creating: true, error: null }));
      try {
        const preset = await createUserTaskPreset({
          title,
          description,
          metadata: {},
        });
        // 更新用户预设列表
        setUserPresets((prev) => {
          const existingIndex = prev.findIndex((p) => p.id === preset.id);
          if (existingIndex !== -1) {
            const next = [...prev];
            next[existingIndex] = preset;
            return next;
          }
          return [...prev, preset];
        });
        // 更新任务库
        const taskItem = mapUserPresetToTaskItem(preset);
        setTaskLibrary((prev) => {
          const existingIndex = prev.findIndex((item) => item.id === taskItem.id);
          if (existingIndex !== -1) {
            const next = [...prev];
            next[existingIndex] = taskItem;
            return next;
          }
          return [...prev, taskItem];
        });
        setCustomPresetState((prev) => ({ ...prev, creating: false, error: null }));
        return true;
      } catch (error) {
        let message = "保存自定义任务失败，请稍后再试。";
        if (isAxiosError(error)) {
          const detail = error.response?.data?.detail;
          if (typeof detail === "string" && detail.trim()) {
            message = detail;
          }
        } else if (error instanceof Error && error.message) {
          message = error.message;
        }
        setCustomPresetState((prev) => ({ ...prev, creating: false, error: message }));
        return false;
      }
    },
    [mapUserPresetToTaskItem],
  );

  const handleDeleteCustomPreset = useCallback(
    async (presetId: number) => {
      setCustomPresetState((prev) => ({ ...prev, deletingId: presetId, error: null }));
      let removedTaskId: string | null = null;
      try {
        await deleteUserTaskPreset(presetId);
        // 从用户预设列表中移除
        setUserPresets((prev) => prev.filter((p) => p.id !== presetId));
        // 从任务库中移除
        setTaskLibrary((prev) => {
          const next: TaskItem[] = [];
          prev.forEach((item) => {
            if (item.presetId === presetId) {
              removedTaskId = item.id;
              return;
            }
            next.push(item);
          });
          return next;
        });
        if (removedTaskId) {
          const taskIdToRemove = removedTaskId;
          setSelectedTasks((prev) => {
            let changed = false;
            const next: Record<number, SelectedTask[]> = {};
            Object.entries(prev).forEach(([key, list]) => {
              const filtered = list.filter((task) => task.sourceId !== taskIdToRemove);
              next[Number(key)] = filtered;
              if (filtered.length !== list.length) {
                changed = true;
              }
            });
            return changed ? next : prev;
          });
        }
        setCustomPresetState((prev) => ({ ...prev, deletingId: null, error: null }));
        return true;
      } catch (error) {
        let message = "删除自定义任务失败，请稍后再试。";
        if (isAxiosError(error)) {
          const detail = error.response?.data?.detail;
          if (typeof detail === "string" && detail.trim()) {
            message = detail;
          }
        } else if (error instanceof Error && error.message) {
          message = error.message;
        }
        setCustomPresetState((prev) => ({ ...prev, deletingId: null, error: message }));
        return false;
      }
    },
    [setSelectedTasks],
  );

  const handleSave = useCallback(async () => {
    if (isSaving) {
      return;
    }

    // 检查登录状态
    if (!hasAuthToken()) {
      setShowLoginConfirm(true);
      return;
    }

    setIsSaving(true);
    setSaveError(null);

    const normalizedTitle = planName.trim() || DEFAULT_PLAN_NAME;
    const schedule = buildSchedule();

    try {
      let goal: ShortTermGoal;
      if (mode === "edit" && goalIdRef.current) {
        // 编辑模式：更新现有目标
        goal = await updateShortTermGoal(goalIdRef.current, {
          title: normalizedTitle,
          durationDays: duration,
          planType,
          schedule,
        });
      } else {
        // 创建模式：创建新目标
        goal = await createShortTermGoal({
          title: normalizedTitle,
          durationDays: duration,
          planType,
          schedule,
        });
      }
      onSaved(goal);
      onClose();
    } catch (error) {
      let message = "保存目标失败，请稍后再试。";
      
      if (error && typeof error === "object") {
        const maybeResponse = (error as { response?: { data?: unknown } }).response;
        if (maybeResponse && typeof maybeResponse === "object") {
          const data = (maybeResponse as { data?: unknown }).data;
          if (data && typeof data === "object") {
            const dataObj = data as Record<string, unknown>;
            const detail = dataObj.detail;
            
            if (typeof detail === "string" && detail.trim()) {
              message = detail;
            } else if (Array.isArray(detail) && detail.length > 0) {
              const first = detail.find((item) => typeof item === "string");
              if (typeof first === "string" && first.trim()) {
                message = first;
              }
            }
          }
        }
      }
      
      if (message === "保存目标失败，请稍后再试。" && error instanceof Error && error.message) {
        message = error.message;
      }
      setSaveError(message);
    } finally {
      setIsSaving(false);
    }
  }, [buildSchedule, duration, isSaving, onClose, onSaved, planName, planType]);

  const handleNext = () => {
    if (isSaving) {
      return;
    }
    
    // 如果是"每日设置不同任务"模式，且在任务设置步骤，检查是否有未设置任务的天数
    if (step === "tasks" && planType === "different") {
      const missingDays: number[] = [];
      for (let index = 0; index < duration; index += 1) {
        const tasksForDay = selectedTasks[index] ?? [];
        if (tasksForDay.length === 0) {
          missingDays.push(index + 1);
        }
      }
      
      if (missingDays.length > 0) {
        setMissingTaskDays(missingDays);
        setShowMissingTasksAlert(true);
        return;
      }
    }
    
    if (stepIndex === STEPS.length - 1) {
      void handleSave();
      return;
    }
    setSaveError(null);
    setStepIndex((prev) => Math.min(prev + 1, STEPS.length - 1));
  };

  const handlePrev = () => {
    if (isSaving) {
      return;
    }
    if (stepIndex === 0) {
      onClose();
      return;
    }
    setSaveError(null);
    setStepIndex((prev) => Math.max(prev - 1, 0));
  };

  return (
    <div className="wizard-screen">
      <div className="wizard-screen__background">
        <div className="wizard-screen__glow wizard-screen__glow--mint" />
        <div className="wizard-screen__glow wizard-screen__glow--brown" />
      </div>

      <div className="wizard-shell">
        <header className="wizard-header">
          <button type="button" className="wizard-header__button" onClick={handlePrev}>
            <MaterialIcon name="arrow_back" />
          </button>
          <div className="wizard-header__title">
            <h1>{mode === "edit" ? "编辑目标" : "建立你的新目标"}</h1>
            <p>{stepLabel}</p>
          </div>
          <button type="button" className="wizard-header__button" onClick={onClose}>
            <MaterialIcon name="close" />
          </button>
        </header>

        <div className="wizard-progress">
          {STEPS.map((key, index) => (
            <span
              key={key}
              className={
                index <= stepIndex
                  ? "wizard-progress__segment wizard-progress__segment--active"
                  : "wizard-progress__segment"
              }
            />
          ))}
        </div>

        <section
          className={
            step === "duration" ? "wizard-body wizard-body--static" : "wizard-body"
          }
        >
          {step === "duration" && (
            <DurationStep
        duration={duration}
              durationIndex={durationIndex}
              onChange={(index) => setDurationIndex(index)}
            />
          )}

          {step === "type" && (
            <TypeStep planType={planType} onChange={handlePlanTypeChange} />
          )}

          {step === "tasks" && (
            <TasksStep
              planType={planType}
              planName={planName}
              onChangePlanName={setPlanName}
              dayLabels={dayLabels}
              selectedDay={selectedDay}
              onSelectDay={setSelectedDay}
              categories={taskCategories}
              selectedCategory={selectedCategory}
              onSelectCategory={setSelectedCategory}
              availableTasks={availableTasks}
              selectedTasks={tasksForCurrentDay}
              allSelectedTasks={selectedTasks}
              onAddTask={handleAddTask}
              onRemoveTask={handleRemoveTask}
              onDecrementTask={handleDecrementTask}
              onUpdateTask={handleUpdateTask}
              customPresetState={customPresetState}
              onCreateCustomPreset={handleCreateCustomPreset}
              onDeleteCustomPreset={handleDeleteCustomPreset}
              onResetCustomPresetError={resetCustomPresetError}
              showDaySelector={planType !== "same"}
            />
          )}

          {step === "confirm" && (
            <ConfirmStep
              duration={duration}
              planName={planName}
              planType={planType}
              tasks={selectedTasks}
              dayLabels={dayLabels}
            />
          )}
        </section>

        {saveError ? <p className="wizard-error">{saveError}</p> : null}

        {showMissingTasksAlert && (
          <div className="wizard-alert-overlay" onClick={() => setShowMissingTasksAlert(false)}>
            <div className="wizard-alert" onClick={(e) => e.stopPropagation()}>
              <h3>还有天数未设置任务</h3>
              <p>
                {formatMissingDays(missingTaskDays)}没有设置任务。
              </p>
              <p>如果您是想设置为休息日的话，也请新增一个"休息"任务填充噢。</p>
              <button
                type="button"
                className="wizard-alert__button"
                onClick={() => setShowMissingTasksAlert(false)}
              >
                知道了
              </button>
            </div>
          </div>
        )}

        <footer className="wizard-footer">
          <button type="button" className="wizard-footer__secondary" onClick={handlePrev}>
            {stepIndex === 0 ? "退出" : "上一步"}
          </button>
          <button
            type="button"
            className="wizard-footer__primary"
            onClick={handleNext}
            disabled={isSaving}
          >
            {stepIndex === STEPS.length - 1 ? (isSaving ? "保存中..." : "保存目标") : "下一步"}
          </button>
        </footer>
      </div>

      {showLoginConfirm ? (
        <div className="artwork-delete-confirm-overlay" onClick={() => setShowLoginConfirm(false)}>
          <div className="artwork-delete-confirm-modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="artwork-delete-confirm-title">必须登录才能保存目标</h2>
            <div className="artwork-delete-confirm-content">
              <p className="artwork-delete-confirm-text">
                保存目标需要登录账号。
              </p>
              <p className="artwork-delete-confirm-text artwork-delete-confirm-text--highlight">
                请先登录后再保存目标
              </p>
            </div>
            <div className="artwork-delete-confirm-actions">
              <button
                type="button"
                className="artwork-delete-confirm-button artwork-delete-confirm-button--cancel"
                onClick={() => setShowLoginConfirm(false)}
              >
                取消
              </button>
              <button
                type="button"
                className="artwork-delete-confirm-button artwork-delete-confirm-button--confirm"
                onClick={() => {
                  setShowLoginConfirm(false);
                  if (onNavigateToProfile) {
                    onNavigateToProfile();
                  }
                }}
                style={{
                  background: "rgba(152, 219, 198, 0.2)",
                  color: "#98dbc6",
                  border: "1px solid rgba(152, 219, 198, 0.35)",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "rgba(152, 219, 198, 0.3)";
                  e.currentTarget.style.borderColor = "rgba(152, 219, 198, 0.5)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "rgba(152, 219, 198, 0.2)";
                  e.currentTarget.style.borderColor = "rgba(152, 219, 198, 0.35)";
                }}
              >
                前往登录
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

type DurationStepProps = {
  duration: number;
  durationIndex: number;
  onChange: (index: number) => void;
};

function DurationStep({ duration, durationIndex, onChange }: DurationStepProps) {
  const [showHint, setShowHint] = useState(false);
  const startXRef = useRef<number | null>(null);
  const deltaXRef = useRef(0);
  const isDraggingRef = useRef(false);
  const hasMovedRef = useRef(false);
  const animationFrameRef = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const applyTransform = useCallback((distance: number) => {
    if (!containerRef.current) {
      return;
    }
    containerRef.current.style.transform = `translateX(${distance}px)`;
  }, []);

  const resetTransform = useCallback(() => {
    if (!containerRef.current) {
      return;
    }
    containerRef.current.style.transition = "transform 200ms ease";
    containerRef.current.style.transform = "translateX(0)";
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    const handle = window.setTimeout(() => {
      if (containerRef.current) {
        containerRef.current.style.transition = "";
      }
      window.clearTimeout(handle);
    }, 210);
  }, []);

  const commitSwipe = useCallback(
    (direction: "prev" | "next") => {
      if (direction === "prev") {
        onChange(Math.max(durationIndex - 1, 0));
      } else {
        onChange(Math.min(durationIndex + 1, DURATIONS.length - 1));
      }
    },
    [durationIndex, onChange],
  );

  const handlePointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    startXRef.current = event.clientX;
    deltaXRef.current = 0;
    isDraggingRef.current = true;
    hasMovedRef.current = false;
    event.currentTarget.setPointerCapture(event.pointerId);
  }, []);

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!isDraggingRef.current || startXRef.current === null) {
        return;
      }
      const delta = event.clientX - startXRef.current;
      if (!hasMovedRef.current && Math.abs(delta) > 2) {
        hasMovedRef.current = true;
        event.preventDefault();
      }
      deltaXRef.current = delta;
      if (animationFrameRef.current !== null) {
        return;
      }
      animationFrameRef.current = requestAnimationFrame(() => {
        animationFrameRef.current = null;
        applyTransform(deltaXRef.current * 0.4);
      });
    },
    [applyTransform],
  );

  const handlePointerUp = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!isDraggingRef.current) {
        return;
      }
      isDraggingRef.current = false;
      if (startXRef.current === null) {
        resetTransform();
        return;
      }

      const delta = event.clientX - startXRef.current;
      const threshold = 60;
      resetTransform();

      if (!hasMovedRef.current || Math.abs(delta) < threshold) {
        hasMovedRef.current = false;
        return;
      }

      if (delta > 0 && durationIndex > 0) {
        commitSwipe("prev");
      } else if (delta < 0 && durationIndex < DURATIONS.length - 1) {
        commitSwipe("next");
      }
      hasMovedRef.current = false;
    },
    [commitSwipe, durationIndex, resetTransform],
  );

  useEffect(() => {
    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  const handlePrev = () => {
    onChange(Math.max(durationIndex - 1, 0));
  };

  const handleNext = () => {
    onChange(Math.min(durationIndex + 1, DURATIONS.length - 1));
  };

  return (
    <div className="wizard-panel wizard-panel--center">
      <p className="wizard-panel__subtitle">选择目标持续时间</p>
      <div className="wizard-duration">
        <button
          type="button"
          className="wizard-duration__nav"
          onClick={handlePrev}
          disabled={durationIndex === 0}
        >
          <MaterialIcon name="chevron_left" />
        </button>
        <div
          ref={containerRef}
          className="wizard-duration__value"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          role="slider"
          aria-valuemin={0}
          aria-valuemax={DURATIONS.length - 1}
          aria-valuenow={durationIndex}
          aria-label="目标持续天数"
        >
          <span className="wizard-duration__number">{duration}</span>
          <span className="wizard-duration__unit">天</span>
        </div>
        <button
          type="button"
          className="wizard-duration__nav"
          onClick={handleNext}
          disabled={durationIndex === DURATIONS.length - 1}
        >
          <MaterialIcon name="chevron_right" />
        </button>
      </div>
      <div className="wizard-pagination">
        {DURATIONS.map((value, index) => (
          <span
            key={value}
            className={
              index === durationIndex
                ? "wizard-pagination__dot wizard-pagination__dot--active"
                : "wizard-pagination__dot"
            }
          />
        ))}
      </div>
      <div className="wizard-duration__hint-wrapper">
        <button
          type="button"
          className="wizard-duration__hint-button"
          onClick={() => setShowHint(!showHint)}
        >
          <MaterialIcon name={showHint ? "expand_less" : "expand_more"} />
          <span>目标说明</span>
        </button>
        {showHint && (
          <div className="wizard-duration__hint">
            <p>目标制定完成后，你可以择日再启动。</p>
            <p>
              目标启动后，需要你在{getToleranceDays(duration)}天内完成{duration}次打卡。
            </p>
            <p>之所以设置期限，是为了让一个小目标能顺利走完，而不会被无限拖延到失去意义。</p>
            <p>但不论成功与否，这次目标的记录和总结都会保留。画了就是成功，不论多少。</p>
          </div>
        )}
      </div>
    </div>
  );
}

type TypeStepProps = {
  planType: PlanType;
  onChange: (type: PlanType) => void;
};

function TypeStep({ planType, onChange }: TypeStepProps) {
  return (
    <div className="wizard-panel">
      <p className="wizard-panel__subtitle">选择目标任务结构</p>
      <div className="wizard-type">
        {PLAN_TYPES.map((item) => (
          <button
            type="button"
            key={item.id}
            className={
              item.id === planType
                ? "wizard-type__card wizard-type__card--active"
                : "wizard-type__card"
            }
            onClick={() => onChange(item.id)}
          >
            <h3>{item.title}</h3>
            <p>{item.subtitle}</p>
          </button>
        ))}
      </div>
    </div>
  );
}

type TasksStepProps = {
  planType: PlanType;
  planName: string;
  onChangePlanName: (value: string) => void;
  dayLabels: string[];
  selectedDay: number;
  onSelectDay: (index: number) => void;
  categories: TaskCategory[];
  selectedCategory: string;
  onSelectCategory: (id: string) => void;
  availableTasks: TaskItem[];
  selectedTasks: SelectedTask[];
  allSelectedTasks: Record<number, SelectedTask[]>;
  onAddTask: (task: TaskItem) => void;
  onRemoveTask: (instanceId: string) => void;
  onDecrementTask: (sourceId: string) => void;
  onUpdateTask: (instanceId: string, payload: { title: string; subtitle: string }) => void;
  customPresetState: CustomPresetState;
  onCreateCustomPreset: (input: { title: string; description: string }) => Promise<boolean>;
  onDeleteCustomPreset: (presetId: number) => Promise<boolean>;
  onResetCustomPresetError: () => void;
  showDaySelector: boolean;
};

function TasksStep({
  planType,
  planName,
  onChangePlanName,
  dayLabels,
  selectedDay,
  onSelectDay,
  categories,
  selectedCategory,
  onSelectCategory,
  availableTasks,
  selectedTasks,
  allSelectedTasks,
  onAddTask,
  onRemoveTask,
  onDecrementTask,
  onUpdateTask,
  customPresetState,
  onCreateCustomPreset,
  onDeleteCustomPreset,
  onResetCustomPresetError,
  showDaySelector,
}: TasksStepProps) {
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftSubtitle, setDraftSubtitle] = useState("");
  const [newPresetTitle, setNewPresetTitle] = useState("");
  const [newPresetSubtitle, setNewPresetSubtitle] = useState("");
  const isMineCategory = selectedCategory === MY_CATEGORY_ID;

  const startEditing = (task: SelectedTask) => {
    setEditingTaskId(task.instanceId);
    setDraftTitle(task.title);
    setDraftSubtitle(task.subtitle);
  };

  const cancelEditing = () => {
    setEditingTaskId(null);
  };

  const confirmEditing = () => {
    if (!editingTaskId) {
      return;
    }
    onUpdateTask(editingTaskId, {
      title: draftTitle,
      subtitle: draftSubtitle,
    });
    setEditingTaskId(null);
  };

  const handleEditKeyDown = (
    event: ReactKeyboardEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      confirmEditing();
    } else if (event.key === "Escape") {
      event.preventDefault();
      cancelEditing();
    }
  };

  useEffect(() => {
    if (editingTaskId && !selectedTasks.some((task) => task.instanceId === editingTaskId)) {
      setEditingTaskId(null);
    }
  }, [editingTaskId, selectedTasks]);

  const handleCustomPresetSubmit = async (event: ReactFormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const success = await onCreateCustomPreset({
      title: newPresetTitle,
      description: newPresetSubtitle,
    });
    if (success) {
      setNewPresetTitle("");
      setNewPresetSubtitle("");
    }
  };

  const handleCustomPresetTitleChange = (value: string) => {
    if (customPresetState.error) {
      onResetCustomPresetError();
    }
    setNewPresetTitle(value);
  };

  const handleCustomPresetSubtitleChange = (value: string) => {
    if (customPresetState.error) {
      onResetCustomPresetError();
    }
    setNewPresetSubtitle(value);
  };

  useEffect(() => {
    if (!isMineCategory && customPresetState.error) {
      onResetCustomPresetError();
    }
  }, [customPresetState.error, isMineCategory, onResetCustomPresetError]);

  return (
    <div className="wizard-panel">
      <div className="wizard-plan-name">
        <div className="wizard-plan-name__header">
          <label htmlFor="plan-name">目标名称</label>
          <MaterialIcon name="edit" className="wizard-plan-name__edit-icon" />
        </div>
        <input
          id="plan-name"
          value={planName}
          onChange={(event) => onChangePlanName(event.target.value)}
          placeholder="为你的目标取个名字"
        />
      </div>

      {showDaySelector && (
        <div className="wizard-days">
          <div className="wizard-days__scroller">
            {dayLabels.map((label, index) => {
              const hasTasks = (allSelectedTasks[index] ?? []).length > 0;
              return (
                <button
                  type="button"
                  key={label}
                  className={
                    index === selectedDay
                      ? "wizard-days__button wizard-days__button--active"
                      : "wizard-days__button"
                  }
                  onClick={() => onSelectDay(index)}
                >
                  {!hasTasks && (
                    <span className="wizard-days__indicator" aria-label="未设置任务" />
                  )}
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="wizard-tasks">
        <section className="wizard-selected">
          <header>
            <h3>{planType === "same" ? "每日任务" : `Day${selectedDay + 1} 已选任务`}</h3>
            <p>点击右侧任务即可添加，已选任务可编辑或删除</p>
          </header>
          <div className="wizard-selected__list">
            {selectedTasks.length === 0 ? (
              <p className="wizard-selected__placeholder">暂未选择任务</p>
            ) : (
              selectedTasks.map((task) => (
                <article key={task.instanceId} className="wizard-selected__item">
                  <div className="wizard-selected__content">
                    {editingTaskId === task.instanceId ? (
                      <>
                        <input
                          className="wizard-selected__input"
                          value={draftTitle}
                          onChange={(event) => setDraftTitle(event.target.value)}
                          onKeyDown={handleEditKeyDown}
                          placeholder="任务名称"
                        />
                        <textarea
                          className="wizard-selected__textarea"
                          rows={2}
                          value={draftSubtitle}
                          onChange={(event) => setDraftSubtitle(event.target.value)}
                          onKeyDown={handleEditKeyDown}
                          placeholder="任务简介（可选）"
                        />
                      </>
                    ) : (
                      <>
                        <h4>{task.title}</h4>
                        {task.subtitle ? <p>{task.subtitle}</p> : <p className="wizard-selected__muted">暂无简介</p>}
                      </>
                    )}
                  </div>
                  <div className="wizard-selected__actions">
                    {editingTaskId === task.instanceId ? (
                      <>
                        <button
                          type="button"
                          className="wizard-icon-button wizard-icon-button--confirm"
                          onClick={confirmEditing}
                          aria-label="保存任务"
                        >
                          <MaterialIcon name="check" />
                        </button>
                        <button
                          type="button"
                          className="wizard-icon-button"
                          onClick={cancelEditing}
                          aria-label="取消编辑"
                        >
                          <MaterialIcon name="close" />
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="wizard-icon-button"
                          onClick={() => startEditing(task)}
                          aria-label="编辑任务"
                        >
                          <MaterialIcon name="edit" />
                        </button>
                        <button
                          type="button"
                          className="wizard-icon-button"
                          onClick={() => onRemoveTask(task.instanceId)}
                          aria-label="删除任务"
                        >
                          <MaterialIcon name="delete" />
                        </button>
                      </>
                    )}
                  </div>
                </article>
              ))
            )}
          </div>
        </section>

        <section className="wizard-library">
          <aside className="wizard-library__categories">
            {categories.map((category) => (
              <button
                type="button"
                key={category.id}
                className={
                  category.id === selectedCategory
                    ? "wizard-library__category wizard-library__category--active"
                    : "wizard-library__category"
                }
                onClick={() => onSelectCategory(category.id)}
              >
                {category.name}
              </button>
            ))}
          </aside>

          <div className="wizard-library__tasks">
            {!isMineCategory && (
              <p className="wizard-library__hint">
                -预设只是为了给您提供思路，您可以添加进任务然后进行修改-
              </p>
            )}
            {isMineCategory ? (
              <article className="wizard-custom">
                <header>
                  <h4>新增自定义任务</h4>
                  <p>保存后可在任何目标中重复使用</p>
                </header>
                <form className="wizard-custom__form" onSubmit={handleCustomPresetSubmit}>
                  <input
                    className="wizard-custom__input"
                    value={newPresetTitle}
                    onChange={(event) => handleCustomPresetTitleChange(event.target.value)}
                    placeholder="任务名称（必填）"
                    maxLength={160}
                    disabled={customPresetState.creating}
                    required
                  />
                  <textarea
                    className="wizard-custom__textarea"
                    rows={2}
                    value={newPresetSubtitle}
                    onChange={(event) => handleCustomPresetSubtitleChange(event.target.value)}
                    placeholder="简要介绍（可选）"
                    maxLength={240}
                    disabled={customPresetState.creating}
                  />
                  <div className="wizard-custom__actions">
                    <button
                      type="submit"
                      className="wizard-custom__submit"
                      disabled={customPresetState.creating}
                    >
                      {customPresetState.creating ? "保存中..." : "保存任务"}
                    </button>
                  </div>
                </form>
                {customPresetState.error ? (
                  <p className="wizard-custom__error">{customPresetState.error}</p>
                ) : null}
              </article>
            ) : null}

            {isMineCategory && availableTasks.length === 0 ? (
              <p className="wizard-library__empty">暂未保存自定义任务。</p>
            ) : null}

            {availableTasks.map((task) => {
              const count = selectedTasks.reduce(
                (total, item) => (item.sourceId === task.id ? total + 1 : total),
                0,
              );
              const isDeleting = task.presetId
                ? customPresetState.deletingId === task.presetId
                : false;
              return (
                <article key={task.id} className="wizard-library__item">
                  <div className="wizard-library__content">
                    <h4>{task.title}</h4>
                    <p>{task.subtitle}</p>
                  </div>
                  <div className="wizard-library__actions">
                    {count > 0 ? (
                      <div className="wizard-library__quantity">
                        <button
                          type="button"
                          className="wizard-icon-button"
                          onClick={() => onDecrementTask(task.id)}
                          aria-label={`移除一个 ${task.title}`}
                          disabled={isDeleting}
                        >
                          <MaterialIcon name="remove" />
                        </button>
                        <span>{count}</span>
                        <button
                          type="button"
                          className="wizard-icon-button"
                          onClick={() => onAddTask(task)}
                          aria-label={`再添加一个 ${task.title}`}
                          disabled={isDeleting}
                        >
                          <MaterialIcon name="add" />
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="wizard-icon-button wizard-icon-button--primary"
                        onClick={() => onAddTask(task)}
                        aria-label={`添加 ${task.title}`}
                        disabled={isDeleting}
                      >
                        <MaterialIcon name="add" />
                      </button>
                    )}
                    {task.origin === "custom" && task.presetId ? (
                      <button
                        type="button"
                        className="wizard-icon-button wizard-icon-button--danger"
                        disabled={isDeleting}
                        onClick={() => {
                          if (task.presetId) {
                            void onDeleteCustomPreset(task.presetId);
                          }
                        }}
                        aria-label={`删除 ${task.title}`}
                      >
                        <MaterialIcon name={isDeleting ? "hourglass_top" : "delete"} />
                      </button>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}

type ConfirmStepProps = {
  duration: number;
  planName: string;
  planType: PlanType;
  tasks: Record<number, SelectedTask[]>;
  dayLabels: string[];
};

function ConfirmStep({ duration, planName, planType, tasks, dayLabels: _dayLabels }: ConfirmStepProps) {
  const summaryList = useMemo(() => {
    if (planType === "same") {
      // 每日相同任务：只显示一次任务列表
      const dayTasks = tasks[0] ?? [];
      return [
        {
          label: "每日任务",
          tasks: dayTasks,
        },
      ];
    }
    // 每日不同任务：显示每一天的任务，所有天数都显示为 "Day x" 格式
    return Array.from({ length: duration }).map((_, index) => {
      const dayTasks = tasks[index] ?? [];
      const dayNumber = index + 1;
      return {
        label: `Day${dayNumber}`,
        tasks: dayTasks,
      };
    });
  }, [duration, planType, tasks]);

  return (
    <>
      <div className="wizard-panel">
        <div className="wizard-confirm">
          <header>
            <h2>{planName || "未命名目标"}</h2>
            <p>
              {duration} 天 · {planType === "same" ? "每日重复任务" : "每日不同安排"}
            </p>
          </header>

          <div className="wizard-confirm__list">
            {summaryList.map((item, index) => (
              <Fragment key={item.label}>
                <article className="wizard-confirm__item">
                  {planType === "different" && (
                    <div className="wizard-confirm__badge">{item.label}</div>
                  )}
                  <div>
                    {planType === "same" ? (
                      <>
                        <h3>{item.label}</h3>
                        {item.tasks.length > 0 ? (
                          <ul>
                            {item.tasks.map((task) => (
                              <li key={task.instanceId}>{task.title}</li>
                            ))}
                          </ul>
                        ) : (
                          <p className="wizard-confirm__placeholder">尚未安排任务</p>
                        )}
                      </>
                    ) : (
                      <>
                        {item.tasks.length > 0 ? (
                          <ul>
                            {item.tasks.map((task) => (
                              <li key={task.instanceId}>{task.title}</li>
                            ))}
                          </ul>
                        ) : (
                          <p className="wizard-confirm__placeholder">尚未安排任务</p>
                        )}
                      </>
                    )}
                  </div>
                </article>
                {index < summaryList.length - 1 ? <hr /> : null}
              </Fragment>
            ))}
          </div>
        </div>
      </div>
      <p className="wizard-confirm__hint">
        - 功不唐捐。{duration}天后回头看，你会是不同的自己 -
      </p>
    </>
  );
}

export default NewChallengeWizard;






