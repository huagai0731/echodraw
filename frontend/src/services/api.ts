import axios from "axios";

function stripTrailingSlash(url: string) {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

const explicitBaseURL = (import.meta.env.VITE_API_BASE_URL ?? "").trim();

function resolveBaseURL() {
  if (explicitBaseURL) {
    if (
      typeof window !== "undefined" &&
      window.location.hostname &&
      window.location.hostname !== "localhost" &&
      /localhost|127\.0\.0\.1/i.test(explicitBaseURL)
    ) {
      return `${window.location.protocol}//${window.location.host.replace(/\/$/, "")}/api`;
    }
    return stripTrailingSlash(explicitBaseURL);
  }

  if (typeof window !== "undefined") {
    if (import.meta.env.DEV) {
      return "/api";
    }

    const origin = window.location.origin.replace(/\/$/, "");
    return `${origin}/api`;
  }

  return "/api";
}

type HttpLikeError = Error & {
  response?: {
    status?: number;
  };
};

function createUnauthorizedError(): HttpLikeError {
  const error = new Error("Authentication token is missing.") as HttpLikeError;
  error.response = { status: 401 };
  return error;
}

export const EXPLICIT_API_BASE_URL = explicitBaseURL;
export const API_BASE_URL = resolveBaseURL();

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
  withCredentials: true,
});

if (typeof window !== "undefined") {
  // 提供调试入口，便于确认当前使用的 API 根地址
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).__ECHO_API_BASE__ = api.defaults.baseURL;
}

export const AUTH_STORAGE_KEY = "echodraw-auth";
export const AUTH_CHANGED_EVENT = "echo.auth-changed";
export const AUTH_FORCED_LOGOUT_EVENT = "echo.auth-forced-logout";
export const CHECK_IN_STATUS_CHANGED_EVENT = "echo.check-in-status-changed";

let currentAuthToken: string | null = null;
let lastNotifiedAuthToken: string | null | undefined;

function loadStoredToken(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const payload = JSON.parse(raw) as { token?: string | null };
    const token = typeof payload?.token === "string" ? payload.token.trim() : "";
    return token.length > 0 ? token : null;
  } catch (error) {
    console.warn("[Echo] Failed to load stored auth token:", error);
    return null;
  }
}

function clearStoredAuth() {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.removeItem(AUTH_STORAGE_KEY);
  } catch (error) {
    console.warn("[Echo] Failed to clear stored auth token:", error);
  }
}

const initialToken = loadStoredToken();
if (initialToken) {
  api.defaults.headers.common.Authorization = `Token ${initialToken}`;
  currentAuthToken = initialToken;
}

function emitAuthChanged() {
  if (typeof window === "undefined") {
    return;
  }
  if (lastNotifiedAuthToken === currentAuthToken) {
    return;
  }
  lastNotifiedAuthToken = currentAuthToken;
  window.dispatchEvent(
    new CustomEvent(AUTH_CHANGED_EVENT, {
      detail: {
        hasToken: Boolean(currentAuthToken),
      },
    }),
  );
}

export function setAuthToken(token: string | null) {
  if (token) {
    const trimmed = token.trim();
    if (!trimmed) {
      delete api.defaults.headers.common.Authorization;
      currentAuthToken = null;
      emitAuthChanged();
      return;
    }
    api.defaults.headers.common.Authorization = `Token ${trimmed}`;
    currentAuthToken = trimmed;
  } else {
    delete api.defaults.headers.common.Authorization;
    currentAuthToken = null;
  }
  emitAuthChanged();
}

let isHandlingUnauthorizedResponse = false;

function handleUnauthorizedResponse() {
  if (isHandlingUnauthorizedResponse) {
    return;
  }

  const hadToken = Boolean(currentAuthToken) || Boolean(loadStoredToken());
  if (!hadToken) {
    return;
  }

  isHandlingUnauthorizedResponse = true;
  try {
    clearStoredAuth();
    setAuthToken(null);
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent(AUTH_FORCED_LOGOUT_EVENT, {
          detail: {
            reason: "token_revoked",
            timestamp: Date.now(),
          },
        }),
      );
    }
  } finally {
    isHandlingUnauthorizedResponse = false;
  }
}

export function hasAuthToken() {
  if (typeof currentAuthToken === "string" && currentAuthToken.length > 0) {
    return true;
  }

  const stored = loadStoredToken();
  if (stored) {
    setAuthToken(stored);
    return true;
  }

  return false;
}

export type AuthResponse = {
  token: string;
  user: {
    id: number;
    email: string;
    is_staff: boolean;
    is_active: boolean;
    first_name: string | null;
    last_name: string | null;
  };
};

export type ProfilePreferenceResponse = {
  display_name: string;
  signature: string;
  default_display_name: string;
  updated_at: string;
};

export type ProfilePreferences = {
  displayName: string;
  signature: string;
  defaultDisplayName: string;
  updatedAt: string;
};

export type UpdateProfilePreferencesInput = {
  displayName?: string;
  signature?: string;
};

export async function login(payload: { email: string; password: string }) {
  const response = await api.post<AuthResponse>("/auth/login/", payload);
  return response.data;
}

export async function fetchCurrentUser() {
  const response = await api.get<AuthResponse["user"]>("/auth/me/");
  return response.data;
}

export type CheckInStatus = {
  checked_today: boolean;
  current_streak: number;
  total_checkins: number;
  latest_checkin: string | null;
};

export type CheckInMutationResponse = CheckInStatus & {
  created: boolean;
  checked_date: string;
};

export type HomeMessagesResponse = {
  history: {
    headline: string | null;
    text: string | null;
  } | null;
  holiday?: {
    headline: string | null;
    text: string | null;
  } | null;
  conditional: string | null;
  encouragement: string | null;
  general?: string | null;
  last_upload: {
    uploaded_at: string | null;
    self_rating: number | null;
    mood_label: string | null;
    duration_minutes: number | null;
    tags: string[] | null;
  } | null;
  check_in?: CheckInStatus;
};

export async function fetchHomeMessages() {
  if (!hasAuthToken()) {
    throw createUnauthorizedError();
  }
  const response = await api.get<HomeMessagesResponse>("/homepage/messages/");
  return response.data;
}

export async function fetchProfilePreferences(): Promise<ProfilePreferences> {
  if (!hasAuthToken()) {
    throw createUnauthorizedError();
  }
  const response = await api.get<ProfilePreferenceResponse>("/profile/preferences/");
  return mapProfilePreferences(response.data);
}

export async function updateProfilePreferences(
  input: UpdateProfilePreferencesInput,
): Promise<ProfilePreferences> {
  if (!hasAuthToken()) {
    throw createUnauthorizedError();
  }
  const payload: Record<string, string> = {};
  if (typeof input.displayName === "string") {
    payload.display_name = input.displayName.trim();
  }
  if (typeof input.signature === "string") {
    payload.signature = input.signature.trim();
  }
  const response = await api.patch<ProfilePreferenceResponse>(
    "/profile/preferences/",
    payload,
  );
  return mapProfilePreferences(response.data);
}

export type GoalsCalendarDay = {
  date: string;
  day: number;
  in_month: boolean;
  status: "none" | "check" | "upload";
};

export type GoalsCalendarResponse = {
  year: number;
  month: number;
  start: string;
  end: string;
  days: GoalsCalendarDay[];
  summary?: {
    total_days: number;
    checkin_days: number;
    upload_days: number;
  };
};

type FetchGoalsCalendarOptions = {
  year?: number;
  month?: number;
};

export async function fetchGoalsCalendar(options: FetchGoalsCalendarOptions = {}) {
  const params = new URLSearchParams();
  if (options.year) {
    params.set("year", String(options.year));
  }
  if (options.month) {
    params.set("month", String(options.month));
  }

  const query = params.toString();
  const response = await api.get<GoalsCalendarResponse>(
    `/goals/calendar/${query ? `?${query}` : ""}`,
  );
  return response.data;
}

export async function fetchCheckInStatus() {
  if (!hasAuthToken()) {
    throw createUnauthorizedError();
  }
  const response = await api.get<CheckInStatus>("/goals/check-in/");
  return response.data;
}

type SubmitCheckInOptions = {
  date?: string;
  source?: string;
};

export async function submitCheckIn(options: SubmitCheckInOptions = {}) {
  if (!hasAuthToken()) {
    throw createUnauthorizedError();
  }
  const response = await api.post<CheckInMutationResponse>("/goals/check-in/", options);
  return response.data;
}

export type UserUploadRecord = {
  id: number;
  title: string;
  description: string;
  uploaded_at: string;
  self_rating: number | null;
  mood_label: string;
  tags: string[];
  duration_minutes: number | null;
  image: string | null;
  created_at: string;
  updated_at: string;
};

type CreateUserUploadInput = {
  file: File;
  title: string;
  description: string;
  tags: string[];
  moodLabel: string;
  selfRating: number;
  durationMinutes: number;
};

export async function fetchUserUploads() {
  if (!hasAuthToken()) {
    return [];
  }
  const response = await api.get<UserUploadRecord[]>("/uploads/");
  return response.data;
}

function mapProfilePreferences(payload: ProfilePreferenceResponse): ProfilePreferences {
  return {
    displayName: payload.display_name ?? "",
    signature: payload.signature ?? "",
    defaultDisplayName: payload.default_display_name ?? "",
    updatedAt: payload.updated_at ?? "",
  };
}

export type UserAchievementLevelRecord = {
  id: number;
  slug: string;
  name: string;
  description: string;
  category: string | null;
  icon: string | null;
  level: number;
  metadata: Record<string, unknown>;
  condition: Record<string, unknown>;
  unlocked_at: string | null;
};

export type UserAchievementGroupSummaryRecord = {
  level_count: number;
  highest_unlocked_level: number;
  unlocked_levels: number[];
};

export type UserAchievementGroupRecord = {
  id: number;
  slug: string;
  name: string;
  description: string;
  category: string | null;
  icon: string | null;
  display_order: number;
  metadata: Record<string, unknown>;
  summary: UserAchievementGroupSummaryRecord;
  levels: UserAchievementLevelRecord[];
};

export type UserAchievementsSummary = {
  group_count: number;
  standalone_count: number;
  achievement_count: number;
};

export type UserAchievementsResponse = {
  summary: UserAchievementsSummary;
  groups: UserAchievementGroupRecord[];
  standalone: UserAchievementLevelRecord[];
};

export async function fetchUserAchievements(): Promise<UserAchievementsResponse> {
  const response = await api.get<UserAchievementsResponse>("/profile/achievements/");
  return response.data;
}

export type LongTermGoalProgress = {
  spentMinutes: number;
  spentHours: number;
  progressRatio: number;
  progressPercent: number;
  targetHours: number;
  elapsedDays: number;
  completedCheckpoints: number;
  totalCheckpoints: number;
  nextCheckpoint: number | null;
  startedDate: string;
};

export type LongTermGoalUpload = {
  id: number;
  title: string;
  description: string;
  uploadedAt: string;
  uploadedDate: string;
  durationMinutes: number | null;
  selfRating: number | null;
  moodLabel: string | null;
  tags: string[] | null;
  image: string | null;
};

export type LongTermGoalCheckpoint = {
  index: number;
  label: string;
  status: "completed" | "current" | "upcoming";
  targetHours: number;
  thresholdMinutes: number;
  reachedMinutes: number | null;
  reachedAt: string | null;
  upload: LongTermGoalUpload | null;
  completionNote?: string | null;
};

export type LongTermGoal = {
  id: number;
  title: string;
  description: string;
  targetHours: number;
  checkpointCount: number;
  startedAt: string;
  createdAt: string;
  updatedAt: string;
  progress: LongTermGoalProgress;
  checkpoints: LongTermGoalCheckpoint[];
};

type ShortTermGoalTaskResponse = {
  task_id: string;
  title: string;
  subtitle: string | null;
};

type ShortTermGoalDayResponse = {
  day_index: number;
  tasks: ShortTermGoalTaskResponse[];
};

type ShortTermGoalResponse = {
  id: number;
  title: string;
  duration_days: number;
  plan_type: "same" | "different";
  schedule: ShortTermGoalDayResponse[];
  created_at: string;
  updated_at: string;
};

type ShortTermTaskPresetResponse = {
  code: string;
  category: string;
  title: string;
  description: string | null;
  metadata: Record<string, unknown> | null;
  origin?: "global" | "custom";
  preset_id?: number | null;
};

type UserTaskPresetResponse = {
  id: number;
  slug: string;
  title: string;
  description: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

type ShortTermTaskPresetCategory = {
  id: string;
  name: string;
};

export type ShortTermTaskPreset = {
  code: string;
  category: string;
  title: string;
  description: string;
  metadata: Record<string, unknown>;
  origin: "global" | "custom";
  presetId?: number | null;
};

export type UserTaskPreset = {
  id: number;
  slug: string;
  title: string;
  description: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type ShortTermTaskPresetBundle = {
  categories: ShortTermTaskPresetCategory[];
  tasks: ShortTermTaskPreset[];
  userPresets: UserTaskPreset[];
};

export type ShortTermGoalTask = {
  taskId: string;
  title: string;
  subtitle: string;
};

export type ShortTermGoalDay = {
  dayIndex: number;
  tasks: ShortTermGoalTask[];
};

export type ShortTermGoal = {
  id: number;
  title: string;
  durationDays: number;
  planType: "same" | "different";
  schedule: ShortTermGoalDay[];
  createdAt: string;
  updatedAt: string;
};

function mapShortTermGoalTask(task: ShortTermGoalTaskResponse): ShortTermGoalTask {
  return {
    taskId: task.task_id,
    title: task.title,
    subtitle: task.subtitle ?? "",
  };
}

function mapShortTermGoal(goal: ShortTermGoalResponse): ShortTermGoal {
  return {
    id: goal.id,
    title: goal.title,
    durationDays: goal.duration_days,
    planType: goal.plan_type,
    schedule: goal.schedule.map((day) => ({
      dayIndex: day.day_index,
      tasks: day.tasks.map(mapShortTermGoalTask),
    })),
    createdAt: goal.created_at,
    updatedAt: goal.updated_at,
  };
}

export async function fetchShortTermGoals() {
  const response = await api.get<ShortTermGoalResponse[]>("/goals/short-term/");
  return response.data.map(mapShortTermGoal);
}

function mapUserTaskPreset(preset: UserTaskPresetResponse): UserTaskPreset {
  return {
    id: preset.id,
    slug: preset.slug,
    title: preset.title,
    description: preset.description ?? "",
    metadata: preset.metadata ?? {},
    createdAt: preset.created_at,
    updatedAt: preset.updated_at,
  };
}

export async function fetchShortTermTaskPresets(): Promise<ShortTermTaskPresetBundle> {
  const response = await api.get<{
    categories: ShortTermTaskPresetCategory[];
    tasks: ShortTermTaskPresetResponse[];
    user_presets?: UserTaskPresetResponse[];
  }>("/goals/short-term/presets/");

  const categories = response.data.categories.map((category) => ({
    id: category.id,
    name: category.name,
  }));

  const tasks = response.data.tasks.map((task) => ({
    code: task.code,
    category: task.category,
    title: task.title,
    description: task.description ?? "",
    metadata: task.metadata ?? {},
    origin: task.origin ?? "global",
    presetId: task.preset_id ?? null,
  }));

  const userPresets = (response.data.user_presets ?? []).map(mapUserTaskPreset);

  return { categories, tasks, userPresets };
}

export type UpsertUserTaskPresetInput = {
  title: string;
  description?: string;
  metadata?: Record<string, unknown>;
};

export async function createUserTaskPreset(
  input: UpsertUserTaskPresetInput,
): Promise<UserTaskPreset> {
  const payload = {
    title: input.title.trim(),
    description: input.description?.trim() ?? "",
    metadata: input.metadata ?? {},
  };
  const response = await api.post<UserTaskPresetResponse>("/goals/short-term/my-presets/", payload);
  return mapUserTaskPreset(response.data);
}

export async function updateUserTaskPreset(
  id: number,
  input: UpsertUserTaskPresetInput,
): Promise<UserTaskPreset> {
  const payload = {
    title: input.title.trim(),
    description: input.description?.trim() ?? "",
    metadata: input.metadata ?? {},
  };
  const response = await api.patch<UserTaskPresetResponse>(
    `/goals/short-term/my-presets/${id}/`,
    payload,
  );
  return mapUserTaskPreset(response.data);
}

export async function deleteUserTaskPreset(id: number) {
  await api.delete(`/goals/short-term/my-presets/${id}/`);
}

type LongTermGoalResponse = {
  id: number;
  title: string;
  description: string;
  target_hours: number;
  checkpoint_count: number;
  started_at: string;
  created_at: string;
  updated_at: string;
  progress: LongTermGoalProgress;
  checkpoints: LongTermGoalCheckpoint[];
};

function mapLongTermGoal(goal: LongTermGoalResponse): LongTermGoal {
  return {
    id: goal.id,
    title: goal.title,
    description: goal.description,
    targetHours: goal.target_hours,
    checkpointCount: goal.checkpoint_count,
    startedAt: goal.started_at,
    createdAt: goal.created_at,
    updatedAt: goal.updated_at,
    progress: goal.progress,
    checkpoints: goal.checkpoints,
  };
}

export async function fetchLongTermGoal(): Promise<LongTermGoal | null> {
  try {
    const response = await api.get<LongTermGoalResponse>("/goals/long-term/");
    return mapLongTermGoal(response.data);
  } catch (error) {
    if (
      axios.isAxiosError(error) &&
      error.response &&
      error.response.status === 404
    ) {
      return null;
    }
    throw error;
  }
}

export type UpsertLongTermGoalInput = {
  title?: string;
  description?: string;
  targetHours: number;
  checkpointCount: number;
  resetProgress?: boolean;
};

export async function upsertLongTermGoal(
  input: UpsertLongTermGoalInput,
): Promise<LongTermGoal> {
  const payload = {
    title: input.title?.trim(),
    description: input.description?.trim(),
    target_hours: input.targetHours,
    checkpoint_count: input.checkpointCount,
    reset_progress: input.resetProgress ?? false,
  };
  const response = await api.post<LongTermGoalResponse>("/goals/long-term/", payload);
  return mapLongTermGoal(response.data);
}

export async function deleteLongTermGoal() {
  await api.delete("/goals/long-term/");
}

type LongTermCopyGuideResponse = {
  id: number;
  min_hours: number;
  max_hours: number | null;
  message: string;
  is_active: boolean;
};

export type LongTermCopyGuide = {
  id: number;
  minHours: number;
  maxHours: number | null;
  message: string;
  isActive: boolean;
};

type StoredLongTermCopy = {
  id?: number;
  min_hours?: number;
  max_hours?: number | null;
  message?: string;
  is_active?: boolean;
};

const LOCAL_LONG_TERM_COPY_KEY = "echo-admin-long-term-copy";

const SAMPLE_LONG_TERM_COPY_GUIDES: LongTermCopyGuide[] = [
  {
    id: -101,
    minHours: 50,
    maxHours: 99,
    message: "这是一个入门级长线计划，可用于集中训练单一技巧或完成小型系列。",
    isActive: true,
  },
  {
    id: -102,
    minHours: 100,
    maxHours: 199,
    message: "中等时长适合安排阶段性迭代，每 20-30 小时总结一次产出与经验。",
    isActive: true,
  },
  {
    id: -103,
    minHours: 200,
    maxHours: 399,
    message: "大跨度创作建议拆分为多个主题或章节，确保每个检查点有清晰目标。",
    isActive: true,
  },
  {
    id: -104,
    minHours: 400,
    maxHours: null,
    message: "超长计划请预留充足的缓冲时间，并定期复盘资源投入与创作成果。",
    isActive: true,
  },
];

function readLocalLongTermCopyGuides(): LongTermCopyGuide[] {
  if (typeof window === "undefined") {
    return [];
  }
  try {
    const raw = window.localStorage.getItem(LOCAL_LONG_TERM_COPY_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as StoredLongTermCopy[];
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .filter((item) => item && item.min_hours != null && item.message)
      .map((item, index) => ({
        id: typeof item.id === "number" ? item.id : -200 - index,
        minHours: Number(item.min_hours),
        maxHours:
          item.max_hours === null || item.max_hours === undefined
            ? null
            : Number(item.max_hours),
        message: String(item.message),
        isActive: item.is_active !== false,
      }));
  } catch (error) {
    console.warn("[Echo] Failed to read local long-term copy guides", error);
    return [];
  }
}

export async function fetchLongTermCopyGuides(): Promise<LongTermCopyGuide[]> {
  try {
    const response = await api.get<LongTermCopyGuideResponse[]>("/goals/long-term-copy/");
    return response.data.map((item) => ({
      id: item.id,
      minHours: item.min_hours,
      maxHours: item.max_hours,
      message: item.message,
      isActive: item.is_active,
    }));
  } catch (error) {
    if (axios.isAxiosError(error) && error.response && error.response.status === 404) {
      const localGuides = readLocalLongTermCopyGuides();
      if (localGuides.length > 0) {
        return localGuides;
      }
      return SAMPLE_LONG_TERM_COPY_GUIDES;
    }
    const localGuides = readLocalLongTermCopyGuides();
    if (localGuides.length > 0) {
      return localGuides;
    }
    throw error;
  }
}

export type CreateShortTermGoalInput = {
  title: string;
  durationDays: number;
  planType: "same" | "different";
  schedule: ShortTermGoalDay[];
};

export async function createShortTermGoal(input: CreateShortTermGoalInput) {
  const payload = {
    title: input.title.trim(),
    duration_days: input.durationDays,
    plan_type: input.planType,
    schedule: input.schedule.map((day) => ({
      day_index: day.dayIndex,
      tasks: day.tasks.map((task) => ({
        task_id: task.taskId,
        title: task.title,
        subtitle: task.subtitle,
      })),
    })),
  };

  const response = await api.post<ShortTermGoalResponse>("/goals/short-term/", payload);
  return mapShortTermGoal(response.data);
}

export async function deleteShortTermGoal(id: number) {
  await api.delete(`/goals/short-term/${id}/`);
}

export async function createUserUpload(input: CreateUserUploadInput) {
  const formData = new FormData();
  if (input.file) {
    formData.append("image", input.file);
  }
  formData.append("title", input.title.trim());
  formData.append("description", input.description.trim());
  formData.append("mood_label", input.moodLabel);
  formData.append("self_rating", String(input.selfRating));
  formData.append("duration_minutes", String(input.durationMinutes));
  formData.append("tags", JSON.stringify(input.tags));

  const response = await api.post<UserUploadRecord>("/uploads/", formData, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
  });

  return response.data;
}

export async function deleteUserUpload(id: number) {
  await api.delete(`/uploads/${id}/`);
}

api.interceptors.response.use(
  (response) => response,
  (error: HttpLikeError) => {
    const status = error?.response?.status;
    if (status === 401) {
      handleUnauthorizedResponse();
    }
    throw error;
  },
);

export default api;

