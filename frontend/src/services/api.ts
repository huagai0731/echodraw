import axios from "axios";
import { getCachedData, setCachedData, clearCache } from "@/utils/apiCache";
import { STORAGE_KEYS } from "@/constants/storageKeys";
import { replaceLocalhostInUrl } from "@/utils/urlUtils";

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
    headers?: Record<string, string>;
  };
  config?: {
    metadata?: {
      retryCount?: number;
    };
    method?: string;
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
  timeout: 30000, // 30秒超时，适用于大多数请求
});

// 创建专门用于长时间请求的 axios 实例（如图像分析）
const longTimeoutApi = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
  withCredentials: true,
  timeout: 300000, // 5分钟超时，用于图像分析等长时间操作
});

if (typeof window !== "undefined") {
  // 提供调试入口，便于确认当前使用的 API 根地址
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).__ECHO_API_BASE__ = api.defaults.baseURL;
}

export const AUTH_STORAGE_KEY = STORAGE_KEYS.AUTH;
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
    // 注意：完整的缓存清除应该通过 clearAllUserCache() 函数完成
    // 这里只清除认证信息，避免循环依赖
  } catch (error) {
    console.warn("[Echo] Failed to clear stored auth token:", error);
  }
}

const initialToken = loadStoredToken();
if (initialToken) {
  api.defaults.headers.common.Authorization = `Token ${initialToken}`;
  longTimeoutApi.defaults.headers.common.Authorization = `Token ${initialToken}`;
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
      delete longTimeoutApi.defaults.headers.common.Authorization;
      currentAuthToken = null;
      // 清除localStorage中的token
      try {
        if (typeof window !== "undefined") {
          const raw = window.localStorage.getItem(AUTH_STORAGE_KEY);
          if (raw) {
            const payload = JSON.parse(raw) as { token?: string | null; user?: { email?: string } };
            if (payload?.user?.email) {
              // 保留user信息，只清除token
              window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ ...payload, token: null }));
            } else {
              window.localStorage.removeItem(AUTH_STORAGE_KEY);
            }
          }
        }
      } catch (error) {
        console.warn("[Echo] Failed to clear stored auth token:", error);
      }
      emitAuthChanged();
      return;
    }
    api.defaults.headers.common.Authorization = `Token ${trimmed}`;
    longTimeoutApi.defaults.headers.common.Authorization = `Token ${trimmed}`;
    currentAuthToken = trimmed;
    // 更新localStorage中的token（如果已存在auth payload）
    try {
      if (typeof window !== "undefined") {
        const raw = window.localStorage.getItem(AUTH_STORAGE_KEY);
        if (raw) {
          const payload = JSON.parse(raw) as { token?: string | null; user?: { email?: string } };
          if (payload?.user?.email) {
            // 更新token，保留user信息
            window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ ...payload, token: trimmed }));
          }
        }
      }
    } catch (error) {
      console.warn("[Echo] Failed to update stored auth token:", error);
    }
  } else {
    delete api.defaults.headers.common.Authorization;
    delete longTimeoutApi.defaults.headers.common.Authorization;
    currentAuthToken = null;
    // 清除localStorage中的token
    try {
      if (typeof window !== "undefined") {
        const raw = window.localStorage.getItem(AUTH_STORAGE_KEY);
        if (raw) {
          const payload = JSON.parse(raw) as { token?: string | null; user?: { email?: string } };
          if (payload?.user?.email) {
            // 保留user信息，只清除token
            window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ ...payload, token: null }));
          } else {
            window.localStorage.removeItem(AUTH_STORAGE_KEY);
          }
        }
      }
    } catch (error) {
      console.warn("[Echo] Failed to clear stored auth token:", error);
    }
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
    date_joined: string | null;
  };
};

export type ProfilePreferenceResponse = {
  display_name: string;
  signature: string;
  default_display_name: string;
  updated_at: string;
  is_member: boolean;
  membership_expires: string | null;
};

export type ProfilePreferences = {
  displayName: string;
  signature: string;
  defaultDisplayName: string;
  updatedAt: string;
  isMember: boolean;
  membershipExpires: string | null;
};

export type UpdateProfilePreferencesInput = {
  displayName?: string;
  signature?: string;
};

export async function login(payload: { email: string; password: string }) {
  const response = await api.post<AuthResponse>("/auth/login/", payload);
  return response.data;
}

export async function fetchCurrentUser(): Promise<AuthResponse["user"]> {
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
  checked_at?: string; // 完成时间（ISO格式）
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
  // 允许未登录时也尝试获取首页文案
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

export async function fetchFeaturedArtworkIds(): Promise<string[]> {
  try {
    const response = await api.get<{ featured_artwork_ids: string[] }>(
      "/profile/featured-artworks/"
    );
    return response.data.featured_artwork_ids || [];
  } catch (error) {
    console.warn("[Echo] Failed to fetch featured artwork IDs:", error);
    // 如果请求失败，返回空数组
    return [];
  }
}

export async function updateFeaturedArtworkIds(ids: string[]): Promise<string[]> {
  try {
    const response = await api.put<{ featured_artwork_ids: string[] }>(
      "/profile/featured-artworks/",
      { featured_artwork_ids: ids }
    );
    return response.data.featured_artwork_ids || [];
  } catch (error) {
    console.error("[Echo] Failed to update featured artwork IDs:", error);
    throw error;
  }
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

export type MembershipSubscriptionInput = {
  tier: "premium";
  expiresAt: string; // ISO格式日期字符串 "YYYY-MM-DD"
};

export type MembershipSubscriptionResponse = {
  is_member: boolean;
  membership_expires: string | null;
};

export async function subscribeMembership(
  input: MembershipSubscriptionInput,
): Promise<MembershipSubscriptionResponse> {
  if (!hasAuthToken()) {
    throw createUnauthorizedError();
  }
  const response = await api.post<MembershipSubscriptionResponse>(
    "/membership/subscribe/",
    {
      tier: input.tier,
      expires_at: input.expiresAt,
    },
  );
  return response.data;
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
  goal_id?: number;
  task_images?: Record<string, number>; // taskId -> uploadId
  notes?: string;
};

export async function submitCheckIn(options: SubmitCheckInOptions = {}) {
  if (!hasAuthToken()) {
    throw createUnauthorizedError();
  }
  // 打卡请求使用更长的超时时间，因为可能涉及图片处理等耗时操作
  const response = await api.post<CheckInMutationResponse>("/goals/check-in/", options, {
    timeout: 60000, // 60秒超时
  });
  return response.data;
}

export type UserUploadRecord = {
  id: number;
  title: string;
  description: string;
  uploaded_at: string;
  self_rating: number | null;
  mood_id: number | null;
  mood_label: string; // 保持向后兼容，用于显示
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
  tags: (string | number)[]; // 支持字符串ID和数字ID
  moodId: number | null; // 使用ID而不是字符串
  selfRating: number;
  durationMinutes: number;
  uploadedAt?: string; // 上传日期，格式：YYYY-MM-DD
};

export async function fetchUserUploads(useCache: boolean = true, forceRefresh: boolean = false) {
  if (!hasAuthToken()) {
    return [];
  }
  
  // 如果强制刷新，清除缓存
  if (forceRefresh) {
    clearCache("/uploads/");
  }
  
  // 尝试从缓存获取
  if (useCache && !forceRefresh) {
    const cached = getCachedData<UserUploadRecord[]>("/uploads/");
    if (cached) {
      return cached;
    }
  }
  
  const response = await api.get<UserUploadRecord[]>("/uploads/");
  const data = response.data;
  
  // 保存到缓存（5分钟有效期）
  if (useCache) {
    setCachedData("/uploads/", data, undefined, 5 * 60 * 1000);
  }
  
  return data;
}

function mapProfilePreferences(payload: ProfilePreferenceResponse): ProfilePreferences {
  return {
    displayName: payload.display_name ?? "",
    signature: payload.signature ?? "",
    defaultDisplayName: payload.default_display_name ?? "",
    updatedAt: payload.updated_at ?? "",
    isMember: payload.is_member ?? false,
    membershipExpires: payload.membership_expires ?? null,
  };
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
  status: "saved" | "active" | "completed";
  started_at: string | null;
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
  status: "saved" | "active" | "completed";
  startedAt: string | null;
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
    status: goal.status,
    schedule: goal.schedule.map((day) => ({
      dayIndex: day.day_index,
      tasks: day.tasks.map(mapShortTermGoalTask),
    })),
    startedAt: goal.started_at,
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
    targetHours: goal.target_hours ?? 0,
    checkpointCount: goal.checkpoint_count ?? 0,
    startedAt: goal.started_at,
    createdAt: goal.created_at,
    updatedAt: goal.updated_at,
    progress: goal.progress,
    checkpoints: goal.checkpoints,
  };
}

export async function fetchLongTermGoal(): Promise<LongTermGoal | null> {
  try {
    const response = await api.get<LongTermGoalResponse | null>("/goals/long-term/");
    // 后端现在返回 200 状态码和 null（而不是 404），如果没有目标
    if (response.data === null || response.data === undefined) {
      return null;
    }
    return mapLongTermGoal(response.data);
  } catch (error) {
    // 保留对 404 的兼容性处理（以防后端版本不一致）
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

export async function fetchCompletedLongTermGoals(): Promise<LongTermGoal[]> {
  const response = await api.get<LongTermGoalResponse[]>("/goals/long-term/completed/");
  return response.data.map(mapLongTermGoal);
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

export type UpdateCheckpointInput = {
  checkpointIndex: number;
  uploadId?: number | null;
  completionNote?: string | null;
};

export async function updateCheckpoint(
  input: UpdateCheckpointInput,
): Promise<LongTermGoal> {
  const payload: Record<string, unknown> = {
    checkpoint_index: input.checkpointIndex,
  };
  if (input.uploadId !== undefined) {
    payload.upload_id = input.uploadId;
  }
  if (input.completionNote !== undefined) {
    payload.completion_note = input.completionNote;
  }
  const response = await api.patch<LongTermGoalResponse>("/goals/long-term/checkpoint/", payload);
  return mapLongTermGoal(response.data);
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

export async function updateShortTermGoal(
  id: number,
  input: Partial<CreateShortTermGoalInput>
) {
  const payload: Record<string, unknown> = {};
  if (input.title !== undefined) {
    payload.title = input.title;
  }
  if (input.durationDays !== undefined) {
    payload.duration_days = input.durationDays;
  }
  if (input.planType !== undefined) {
    payload.plan_type = input.planType;
  }
  if (input.schedule !== undefined) {
    payload.schedule = input.schedule.map((day) => ({
      day_index: day.dayIndex,
      tasks: day.tasks.map((task) => ({
        task_id: task.taskId,
        title: task.title,
        subtitle: task.subtitle,
      })),
    }));
  }

  const response = await api.patch<ShortTermGoalResponse>(`/goals/short-term/${id}/`, payload);
  return mapShortTermGoal(response.data);
}

export async function startShortTermGoal(id: number) {
  const response = await api.post<ShortTermGoalResponse>(`/goals/short-term/${id}/start/`);
  return mapShortTermGoal(response.data);
}

export async function deleteShortTermGoal(id: number) {
  await api.delete(`/goals/short-term/${id}/`);
}

export type TaskCompletionRecord = {
  id: number;
  title: string;
  image: string | null;
  uploaded_at: string;
};

export type TaskCompletionsResponse = Record<string, Record<string, TaskCompletionRecord>>;

export async function fetchShortTermGoalTaskCompletions(goalId: number) {
  const response = await api.get<TaskCompletionsResponse>(
    `/goals/short-term/${goalId}/task-completions/`
  );
  return response.data;
}

// ==================== 灵感记录 API（完全独立，与画集无关）====================

// 灵感记录特殊标记，用于区分灵感和画集
const INSPIRATION_MARKER = "__INSPIRATION_NOTE__";

export type InspirationNoteRecord = {
  id: number;
  image: string | null;
  text: string;
  uploaded_at: string;
};

export type CreateInspirationNoteInput = {
  file?: File | null; // 图片可选
  text: string; // 正文
  uploadedAt?: string;
};

/**
 * 获取灵感记录列表（从uploads API获取，但只返回灵感记录，与画集完全分离）
 */
export async function fetchInspirationNotes(useCache: boolean = true, forceRefresh: boolean = false): Promise<InspirationNoteRecord[]> {
  if (!hasAuthToken()) {
    return [];
  }
  
  // 如果强制刷新，清除缓存
  if (forceRefresh) {
    clearCache("/uploads/");
  }
  
  // 从uploads API获取所有记录
  const allRecords = await fetchUserUploads(useCache, forceRefresh);
  
  // 只返回灵感记录（通过description字段中的特殊标记区分）
  const inspirationRecords: InspirationNoteRecord[] = [];
  
  allRecords.forEach((record) => {
    // 只处理包含灵感标记的记录
    if (record.description && record.description.includes(INSPIRATION_MARKER)) {
      // 移除标记，提取正文
      const text = record.description.replace(INSPIRATION_MARKER, "").replace(/^\n+/, "").trim();
      
      // 处理图片URL（与画集页面一致的处理逻辑）
      let imageUrl = record.image || null;
      if (imageUrl) {
        // 如果是相对路径 /api/uploads/...，说明后端返回的是代理URL，需要拼接API base
        if (imageUrl.startsWith("/api/") && !imageUrl.startsWith("http")) {
          const apiBase = API_BASE_URL.replace(/\/api\/?$/, "");
          imageUrl = apiBase ? `${apiBase}${imageUrl}` : imageUrl;
        }
        // 如果URL包含127.0.0.1或localhost，且当前页面不是localhost，则替换为当前hostname
        if (typeof window !== "undefined" && window.location?.hostname) {
          imageUrl = replaceLocalhostInUrl(imageUrl);
        }
      }
      
      inspirationRecords.push({
        id: record.id,
        image: imageUrl,
        text: text,
        uploaded_at: record.uploaded_at,
      });
    }
  });
  
  return inspirationRecords;
}

/**
 * 创建灵感记录（使用uploads API，但添加特殊标记，与画集完全分离）
 */
export async function createInspirationNote(input: CreateInspirationNoteInput): Promise<InspirationNoteRecord> {
  // 如果没有图片，创建一个1x1的透明PNG图片（因为uploads API要求必须有图片）
  let fileToUpload: File;
  if (input.file) {
    fileToUpload = input.file;
  } else {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, 1, 1);
    }
    const blob = await new Promise<Blob>((resolve) => {
      canvas.toBlob((blob) => {
        resolve(blob || new Blob());
      }, 'image/png');
    });
    fileToUpload = new File([blob], 'empty.png', { type: 'image/png' });
  }
  
  // 验证文件类型
  if (!fileToUpload.type.startsWith("image/")) {
    throw new Error("只能上传图片文件");
  }
  
  // 验证文件大小
  const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
  if (fileToUpload.size > MAX_FILE_SIZE) {
    throw new Error("文件大小不能超过10MB");
  }
  
  // 构建description：添加灵感标记 + 正文
  const text = input.text.trim();
  const markedDescription = text 
    ? `${INSPIRATION_MARKER}\n${text}` 
    : INSPIRATION_MARKER;
  
  // 使用uploads API创建，但添加灵感标记（与画集完全分离）
  const record = await createUserUpload({
    file: fileToUpload,
    title: "", // 标题为空
    description: markedDescription, // 包含灵感标记的正文
    tags: [],
    moodId: null,
    selfRating: 0,
    durationMinutes: 0,
    uploadedAt: input.uploadedAt,
  });
  
  // 转换为灵感记录格式
  const textContent = record.description?.replace(INSPIRATION_MARKER, "").replace(/^\n+/, "").trim() || "";
  
  // 处理图片URL（与画集页面一致的处理逻辑）
  let imageUrl: string | null = null;
  if (input.file && record.image) {
    imageUrl = record.image;
    // 如果是相对路径 /api/uploads/...，说明后端返回的是代理URL，需要拼接API base
    if (imageUrl.startsWith("/api/") && !imageUrl.startsWith("http")) {
      const apiBase = API_BASE_URL.replace(/\/api\/?$/, "");
      imageUrl = apiBase ? `${apiBase}${imageUrl}` : imageUrl;
    }
    // 如果URL包含127.0.0.1或localhost，且当前页面不是localhost，则替换为当前hostname
    if (typeof window !== "undefined" && window.location?.hostname) {
      imageUrl = replaceLocalhostInUrl(imageUrl);
    }
  }
  
  return {
    id: record.id,
    image: imageUrl,
    text: textContent,
    uploaded_at: record.uploaded_at,
  };
}

export async function createUserUpload(input: CreateUserUploadInput) {
  // 验证文件是否存在
  if (!input.file) {
    throw new Error("上传文件不能为空");
  }
  
  // 验证文件类型
  if (!input.file.type.startsWith("image/")) {
    throw new Error("只能上传图片文件");
  }
  
  // 验证文件大小（例如：最大10MB）
  const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
  if (input.file.size > MAX_FILE_SIZE) {
    throw new Error("文件大小不能超过10MB");
  }
  
  const formData = new FormData();
  formData.append("image", input.file);
  // 标题和描述是可选的，如果为空则不发送或发送空字符串（后端允许blank=True）
  const title = input.title.trim();
  const description = input.description.trim();
  if (title) {
    formData.append("title", title);
  } else {
    formData.append("title", ""); // 发送空字符串，后端blank=True会接受
  }
  if (description) {
    formData.append("description", description);
  } else {
    formData.append("description", ""); // 发送空字符串，后端allow_blank=True会接受
  }
  // 传递mood_id而不是mood_label
  if (input.moodId !== null && input.moodId !== undefined) {
    formData.append("mood_id", String(input.moodId));
  }
  formData.append("self_rating", String(input.selfRating));
  formData.append("duration_minutes", String(input.durationMinutes));
  
  // 上传日期（如果提供）
  if (input.uploadedAt) {
    formData.append("uploaded_at", input.uploadedAt);
  }
  
  // 支持标签ID数组（新格式）或标签名称数组（旧格式兼容）
  let tagIds: number[] = [];
  if (Array.isArray(input.tags) && input.tags.length > 0) {
    // 将标签转换为数字数组，过滤掉无效值
    tagIds = input.tags
      .map(id => {
        const num = typeof id === 'string' ? Number(id) : id;
        return Number.isFinite(num) && num > 0 ? num : null;
      })
      .filter((id): id is number => id !== null);
    
    if (tagIds.length > 0) {
      // 对于 FormData，使用 JSON 字符串格式，后端会解析
      formData.append("tag_ids", JSON.stringify(tagIds));
    }
  }
  
  // 仅在开发环境输出调试信息
  if (import.meta.env.DEV) {
    console.log("=".repeat(60));
    console.log("[Echo] 上传图片 - 传给后端的信息：");
    console.log("=".repeat(60));
    console.log("文件信息:", {
      fileName: input.file?.name || "未知",
      fileSize: input.file?.size || 0,
      fileType: input.file?.type || "未知",
    });
    console.log("标题:", input.title || "(空)");
    console.log("简介:", input.description || "(空)");
    console.log("Tag IDs (传给后端):", tagIds.length > 0 ? tagIds : "(无)");
    console.log("创作状态ID:", input.moodId !== null && input.moodId !== undefined ? input.moodId : "(空)");
    console.log("自评分:", input.selfRating || "(空)");
    console.log("时长（分钟）:", input.durationMinutes || "(空)");
    console.log("FormData 内容:");
    for (const [key, value] of formData.entries()) {
      if (key === "image") {
        const file = value as File;
        console.log(`  ${key}:`, {
          name: file.name,
          size: file.size,
          type: file.type,
        });
      } else {
        console.log(`  ${key}:`, value);
      }
    }
    console.log("=".repeat(60));
  }
  
  const response = await api.post<UserUploadRecord>("/uploads/", formData, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
    timeout: 120000, // 上传图片使用更长的超时时间（120秒），适用于大文件上传
  });

  // 仅在开发环境输出调试信息
  if (import.meta.env.DEV) {
    console.log("[Echo] 后端返回的数据:", {
      id: response.data.id,
      title: response.data.title,
      description: response.data.description,
      tags: response.data.tags,
      tagsType: Array.isArray(response.data.tags) ? response.data.tags.map(t => typeof t) : typeof response.data.tags,
      image: response.data.image,
      uploaded_at: response.data.uploaded_at,
    });
    console.log("=".repeat(60));
  }

  return response.data;
}

export async function deleteUserUpload(id: number) {
  // 验证ID是否有效
  if (!Number.isFinite(id) || id <= 0) {
    throw new Error("无效的作品ID");
  }
  
  await api.delete(`/uploads/${id}/`);
}

export type UploadLimitInfo = {
  monthly_count: number;
  max_monthly_uploads: number;
  remaining: number;
  can_upload: boolean;
};

export async function checkUploadLimit(): Promise<UploadLimitInfo> {
  const response = await api.get<UploadLimitInfo>("/uploads/check-limit/");
  return response.data;
}

export type UpdateUserUploadInput = {
  title?: string;
  description?: string;
  tags?: (string | number)[]; // 支持字符串ID和数字ID
  moodId?: number | null; // 使用ID而不是字符串
  selfRating?: number;
  durationMinutes?: number;
  collectionId?: string | null;
  collectionName?: string | null;
  collectionIndex?: number | null;
};

export async function updateUserUpload(id: number, input: UpdateUserUploadInput) {
  // 验证ID是否有效
  if (!Number.isFinite(id) || id <= 0) {
    throw new Error("无效的作品ID");
  }
  
  const formData = new FormData();
  
  // 标题和描述是可选的
  if (input.title !== undefined) {
    formData.append("title", input.title.trim());
  }
  if (input.description !== undefined) {
    formData.append("description", input.description.trim());
  }
  
  // 传递mood_id而不是mood_label
  if (input.moodId !== undefined) {
    if (input.moodId !== null) {
      formData.append("mood_id", String(input.moodId));
    } else {
      formData.append("mood_id", "");
    }
  }
  
  if (input.selfRating !== undefined) {
    formData.append("self_rating", String(input.selfRating));
  }
  
  if (input.durationMinutes !== undefined) {
    formData.append("duration_minutes", String(input.durationMinutes));
  }
  
  // 套图相关字段
  
  // 支持标签ID数组
  if (input.tags !== undefined && Array.isArray(input.tags) && input.tags.length > 0) {
    const tagIds = input.tags
      .map(id => {
        const num = typeof id === 'string' ? Number(id) : id;
        return Number.isFinite(num) && num > 0 ? num : null;
      })
      .filter((id): id is number => id !== null);
    
    if (tagIds.length > 0) {
      formData.append("tag_ids", JSON.stringify(tagIds));
    } else {
      formData.append("tag_ids", JSON.stringify([]));
    }
  }
  
  const response = await api.patch<UserUploadRecord>(`/uploads/${id}/`, formData, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
  });
  
  return response.data;
}


// 请求重试配置
const MAX_RETRIES = 2; // 最多重试2次
const RETRY_DELAY = 1000; // 重试延迟1秒

// 判断HTTP方法是否幂等
function isIdempotentMethod(method: string | undefined): boolean {
  if (!method) return false;
  const upperMethod = method.toUpperCase();
  // 幂等方法：GET, HEAD, PUT, DELETE, OPTIONS, TRACE
  // 非幂等方法：POST, PATCH（某些情况下）
  return ['GET', 'HEAD', 'PUT', 'DELETE', 'OPTIONS', 'TRACE'].includes(upperMethod);
}

// 判断是否应该重试
function shouldRetry(error: HttpLikeError, retryCount: number, method?: string): boolean {
  if (retryCount >= MAX_RETRIES) {
    return false;
  }
  
  // 只对幂等请求进行重试，防止重复操作
  if (!isIdempotentMethod(method)) {
    return false;
  }
  
  const status = error?.response?.status;
  // 只对网络错误和5xx错误进行重试
  if (!status) {
    // 网络错误，可以重试（仅限幂等方法）
    return true;
  }
  
  // 5xx服务器错误，可以重试（仅限幂等方法）
  if (status >= 500 && status < 600) {
    return true;
  }
  
  // 429 Too Many Requests，可以重试（仅限幂等方法，使用指数退避）
  if (status === 429) {
    return true;
  }
  
  // 408 Request Timeout，可以重试（仅限幂等方法）
  if (status === 408) {
    return true;
  }
  
  return false;
}

// 请求拦截器：添加重试逻辑
api.interceptors.request.use(
  (config) => {
    // 为每个请求添加重试计数
    const configWithMetadata = config as typeof config & {
      metadata?: { retryCount?: number };
    };
    if (!configWithMetadata.metadata) {
      configWithMetadata.metadata = {};
    }
    if (configWithMetadata.metadata.retryCount === undefined) {
      configWithMetadata.metadata.retryCount = 0;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// 响应拦截器：处理错误和重试
api.interceptors.response.use(
  (response) => response,
  async (error: HttpLikeError) => {
    const status = error?.response?.status;
    if (status === 401) {
      handleUnauthorizedResponse();
      throw error;
    }
    
    // 获取原始请求配置
    const originalRequest = error.config as typeof error.config & {
      metadata?: { retryCount?: number };
      method?: string;
    };
    
    // 检查是否应该重试（只对幂等方法重试，确保不会重复提交）
    if (originalRequest && shouldRetry(error, originalRequest.metadata?.retryCount || 0, originalRequest.method)) {
      const retryCount = (originalRequest.metadata?.retryCount || 0) + 1;
      if (originalRequest.metadata) {
        originalRequest.metadata.retryCount = retryCount;
      } else {
        originalRequest.metadata = { retryCount };
      }
      
      // 使用指数退避策略，避免重试风暴
      // 对于429错误，使用更长的延迟时间
      const status = error?.response?.status;
      let backoffDelay: number;
      
      if (status === 429) {
        // 检查响应头中的 Retry-After（秒）
        const retryAfter = error?.response?.headers?.['retry-after'] || 
                          error?.response?.headers?.['Retry-After'];
        if (retryAfter) {
          // 如果服务器指定了重试时间，使用该时间（转换为毫秒）
          const retryAfterSeconds = parseInt(String(retryAfter), 10);
          if (!isNaN(retryAfterSeconds) && retryAfterSeconds > 0) {
            backoffDelay = retryAfterSeconds * 1000;
          } else {
            // 如果 Retry-After 无效，使用指数退避
            backoffDelay = RETRY_DELAY * Math.pow(2, retryCount) * 5; // 429错误使用更长的延迟（5倍）
          }
        } else {
          // 没有 Retry-After 头，使用指数退避
          backoffDelay = RETRY_DELAY * Math.pow(2, retryCount) * 5; // 429错误使用更长的延迟（5倍）
        }
        // 429错误最多等待30秒
        backoffDelay = Math.min(backoffDelay, 30000);
      } else {
        // 其他错误使用标准指数退避
        backoffDelay = RETRY_DELAY * Math.pow(2, retryCount);
        // 其他错误最多等待10秒
        backoffDelay = Math.min(backoffDelay, 10000);
      }
      
      await new Promise((resolve) => setTimeout(resolve, backoffDelay));
      
      // 幂等性检查：只对幂等方法重试
      if (isIdempotentMethod(originalRequest.method)) {
        return api(originalRequest);
      }
    }
    
    throw error;
  },
);

// 为 longTimeoutApi 也添加相同的响应拦截器（处理401错误）
longTimeoutApi.interceptors.response.use(
  (response) => response,
  async (error: HttpLikeError) => {
    const status = error?.response?.status;
    if (status === 401) {
      handleUnauthorizedResponse();
      throw error;
    }
    throw error;
  },
);


// ==================== 用户测试 API ====================

export type UserTest = {
  id: number;
  slug: string;
  name: string;
  description: string;
  test_type: "type_1" | "type_2";
  question_count: number;
  dimensions: Array<{
    id: number;
    code: string;
    name: string;
    endpoint_a_code: string;
    endpoint_a_name: string;
    endpoint_b_code: string;
    endpoint_b_name: string;
    description: string;
  }>;
};

export type UserTestQuestion = {
  id: number;
  question_text: string;
  dimension_id: number | null;
  dimension_name: string | null;
  endpoint_code: string | null;
  score_config: Record<string, number> | null;
  option_texts: Array<{
    id: number;
    text: string;
    options: Array<{
      endpoint_code: string;
      score_config: {
        selected?: number;
        value?: number;
      };
    }>;
  }>;
};

export type UserTestDetail = {
  id: number;
  slug: string;
  name: string;
  description: string;
  test_type: "type_1" | "type_2";
  questions: UserTestQuestion[];
  dimensions: Array<{
    id: number;
    code: string;
    name: string;
    endpoint_a_code: string;
    endpoint_a_name: string;
    endpoint_b_code: string;
    endpoint_b_name: string;
    description: string;
  }>;
};

export type UserTestResult = {
  id: number;
  test_id: number;
  test_name: string;
  dimension_scores: Record<string, number>;
  answers: Record<string, unknown>;
  completed_at: string;
};

export type SubmitTestAnswerInput = {
  test_id: number;
  answers: Record<string, string | number>; // question_id -> answer (option_id for type_2, score for type_1)
};

/**
 * 获取可用的测试列表
 */
export async function fetchUserTests(): Promise<UserTest[]> {
  const response = await api.get<UserTest[]>("/tests/");
  return response.data;
}

/**
 * 获取测试详情（包含题目）
 */
export async function fetchUserTestDetail(testId: number): Promise<UserTestDetail> {
  const response = await api.get<UserTestDetail>(`/tests/${testId}/`);
  return response.data;
}

/**
 * 提交测试答案
 */
export async function submitTestAnswer(input: SubmitTestAnswerInput): Promise<UserTestResult> {
  const response = await api.post<UserTestResult>("/tests/submit/", input);
  return response.data;
}

/**
 * 获取用户的测试结果
 */
export async function fetchUserTestResult(resultId: number): Promise<UserTestResult> {
  // 尝试从缓存获取
  const cacheKey = `/tests/results/${resultId}/`;
  const cached = getCachedData<UserTestResult>(cacheKey);
  if (cached) {
    return cached;
  }

  const response = await api.get<UserTestResult>(cacheKey);
  // 缓存结果（5分钟）
  setCachedData(cacheKey, response.data, undefined, 5 * 60 * 1000);
  return response.data;
}

/**
 * 获取用户的所有测试结果列表
 */
export async function fetchUserTestResults(): Promise<UserTestResult[]> {
  const response = await api.get<UserTestResult[]>("/tests/results/");
  return response.data;
}

/**
 * 删除测试结果
 */
export async function deleteUserTestResult(resultId: number): Promise<void> {
  if (!hasAuthToken()) {
    throw createUnauthorizedError();
  }

  await api.delete(`/tests/results/${resultId}/`);
}

// ==================== 标签管理 API ====================

export type TagResponse = {
  id: number;
  name: string;
  is_preset: boolean;
  is_hidden: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
};

export type TagsListResponse = {
  preset_tags: TagResponse[];
  custom_tags: TagResponse[];
};

export type Tag = {
  id: number;
  name: string;
  isPreset: boolean;
  isHidden: boolean;
  displayOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type CreateTagInput = {
  name: string;
  isHidden?: boolean; // 保留字段以兼容，但不再使用
};

export type UpdateTagInput = {
  name?: string;
  isHidden?: boolean; // 保留字段以兼容，但不再使用
};

/**
 * 获取所有标签（预设+用户自定义）
 */
export async function fetchTags(): Promise<TagsListResponse> {
  if (!hasAuthToken()) {
    throw createUnauthorizedError();
  }
  const response = await api.get<TagsListResponse>("/tags/");
  return response.data;
}

/**
 * 获取标签列表（用于管理）
 */
export async function fetchTagList(): Promise<Tag[]> {
  if (!hasAuthToken()) {
    throw createUnauthorizedError();
  }
  const response = await api.get<TagResponse[]>("/tags/manage/");
  return response.data.map(mapTag);
}

/**
 * 创建标签
 */
export async function createTag(input: CreateTagInput): Promise<Tag> {
  if (!hasAuthToken()) {
    throw createUnauthorizedError();
  }
  const payload = {
    name: input.name.trim(),
    is_hidden: false, // 不再支持隐藏功能
  };
  const response = await api.post<TagResponse>("/tags/manage/", payload);
  return mapTag(response.data);
}

/**
 * 更新标签
 */
export async function updateTag(id: number, input: UpdateTagInput): Promise<Tag> {
  if (!hasAuthToken()) {
    throw createUnauthorizedError();
  }
  const payload: Record<string, unknown> = {};
  if (input.name !== undefined) {
    payload.name = input.name.trim();
  }
  // 不再支持isHidden字段
  const response = await api.patch<TagResponse>(`/tags/manage/${id}/`, payload);
  return mapTag(response.data);
}

/**
 * 删除标签
 */
export async function deleteTag(id: number): Promise<void> {
  if (!hasAuthToken()) {
    throw createUnauthorizedError();
  }
  await api.delete(`/tags/manage/${id}/`);
}

// ==================== Mood API ====================

export type MoodResponse = {
  id: number;
  name: string;
  display_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type Mood = {
  id: number;
  name: string;
  displayOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

function mapMood(data: MoodResponse): Mood {
  return {
    id: data.id,
    name: data.name,
    displayOrder: data.display_order,
    isActive: data.is_active,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

/**
 * 获取所有创作状态
 */
export async function fetchMoods(): Promise<Mood[]> {
  if (!hasAuthToken()) {
    throw createUnauthorizedError();
  }
  const response = await api.get<MoodResponse[]>("/moods/");
  return response.data.map(mapMood);
}

function mapTag(tag: TagResponse): Tag {
  return {
    id: tag.id,
    name: tag.name,
    isPreset: tag.is_preset,
    isHidden: tag.is_hidden,
    displayOrder: tag.display_order,
    createdAt: tag.created_at,
    updatedAt: tag.updated_at,
  };
}

// 视觉分析结果类型
export type VisualAnalysisResultRecord = {
  id: number;
  original_image: string;
  step1_binary: string;
  step2_grayscale: string;
  step3_lab_l: string;
  step4_hsv_s?: string;
  step4_hls_s: string;
  step5_hue: string;
  step2_grayscale_3_level?: string; // 3阶灰度图（可选）
  step2_grayscale_4_level?: string; // 4阶灰度图（可选）
  step4_hls_s_inverted?: string; // HLS反色图（可选）
  kmeans_segmentation_image?: string; // K-means色块分割图（可选）
  binary_threshold: number;
  comprehensive_analysis?: any; // 专业分析结果（JSON格式，只包含结构化数据）
  created_at: string;
  updated_at: string;
};

export type CreateVisualAnalysisResultInput = {
  original_image: string;
  step1_binary: string;
  step2_grayscale: string;
  step3_lab_l: string;
  step4_hsv_s?: string;
  step4_hls_s: string;
  step5_hue: string;
  step2_grayscale_3_level?: string; // 3阶灰度图（可选）
  step2_grayscale_4_level?: string; // 4阶灰度图（可选）
  step4_hls_s_inverted?: string; // HLS反色图（可选）
  kmeans_segmentation_image?: string; // K-means色块分割图（可选）
  binary_threshold: number;
  comprehensive_analysis?: any; // 专业分析结果（可选，只包含结构化数据，图片已保存到TOS）
};

/**
 * 保存视觉分析结果
 */
export async function createVisualAnalysisResult(
  input: CreateVisualAnalysisResultInput
): Promise<VisualAnalysisResultRecord> {
  if (!hasAuthToken()) {
    throw createUnauthorizedError();
  }

  // 使用FormData发送，因为需要上传图片文件
  const formData = new FormData();
  
  // 将base64字符串转换为Blob并添加到FormData
  const imageFields = [
    'original_image',
    'step1_binary',
    'step2_grayscale',
    'step3_lab_l',
    'step4_hsv_s',
    'step4_hls_s',
    'step5_hue',
    'step2_grayscale_3_level',
    'step2_grayscale_4_level',
    'step4_hls_s_inverted',
    'kmeans_segmentation_image',
  ];
  
  for (const fieldName of imageFields) {
    const fieldValue = input[fieldName as keyof CreateVisualAnalysisResultInput];
    // 跳过可选字段如果为空
    if (!fieldValue) {
      continue;
    }
    if (typeof fieldValue === 'string' && fieldValue.trim()) {
      // 检查是否是URL（http:// 或 https:// 开头）
      const isUrl = fieldValue.startsWith('http://') || fieldValue.startsWith('https://');
      
      if (isUrl) {
        // 如果是URL，跳过这个字段（不发送，让后端使用已有的图片）
        // 或者可以发送一个特殊标记，让后端知道使用已有图片
        // 这里选择跳过，因为更新时如果字段是URL，说明图片已经存在，不需要更新
        console.log(`[createVisualAnalysisResult] ${fieldName} 是URL，跳过发送:`, fieldValue.substring(0, 50) + '...');
        continue;
      }
      
      // 将base64字符串转换为Blob
      let base64Data = fieldValue;
      // 移除 data URL 前缀（如果有）
      if (base64Data.includes(',')) {
        base64Data = base64Data.split(',')[1];
      }
      
      try {
        // 解码base64
        const byteCharacters = atob(base64Data);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: 'image/png' });
        
        // 添加到FormData
        formData.append(fieldName, blob, `${fieldName}.png`);
      } catch (error) {
        console.error(`Failed to convert ${fieldName} to blob:`, error);
        // 如果转换失败，可能是无效的base64或URL，跳过这个字段
        console.warn(`[createVisualAnalysisResult] ${fieldName} 转换失败，跳过发送`);
        continue;
      }
    } else if (fieldValue) {
      // 如果不是字符串，直接添加
      formData.append(fieldName, fieldValue as any);
    }
  }
  
  // 添加其他字段
  formData.append('binary_threshold', String(input.binary_threshold));
  if (input.comprehensive_analysis) {
    const comprehensiveAnalysisStr = JSON.stringify(input.comprehensive_analysis);
    console.log("[createVisualAnalysisResult] 准备发送comprehensive_analysis:", {
      hasData: !!input.comprehensive_analysis,
      isObject: typeof input.comprehensive_analysis === 'object',
      keys: input.comprehensive_analysis ? Object.keys(input.comprehensive_analysis) : [],
      stringLength: comprehensiveAnalysisStr.length,
      hasColorQuality: !!(input.comprehensive_analysis as any)?.color_quality,
      hasColorBlockStructure: !!(input.comprehensive_analysis as any)?.color_block_structure,
    });
    formData.append('comprehensive_analysis', comprehensiveAnalysisStr);
  } else {
    console.warn("[createVisualAnalysisResult] comprehensive_analysis 为空，未发送");
  }

  // 不要手动设置Content-Type，让浏览器自动设置（包含boundary）
  // 如果手动设置，会缺少boundary参数，导致服务器无法解析
  const response = await api.post<VisualAnalysisResultRecord>("/visual-analysis/", formData);
  return response.data;
}

/**
 * 获取用户的视觉分析结果列表
 */
export async function fetchVisualAnalysisResults(): Promise<VisualAnalysisResultRecord[]> {
  if (!hasAuthToken()) {
    throw createUnauthorizedError();
  }

  const response = await api.get<{
    count: number;
    next: string | null;
    previous: string | null;
    results: VisualAnalysisResultRecord[];
  } | VisualAnalysisResultRecord[]>("/visual-analysis/");
  
  // 处理分页响应：如果返回的是分页对象，提取 results 数组；否则直接返回数组
  if (response.data && typeof response.data === 'object' && 'results' in response.data && Array.isArray(response.data.results)) {
    console.log("[fetchVisualAnalysisResults] 检测到分页响应，总数:", response.data.count, "当前页结果数:", response.data.results.length);
    return response.data.results;
  }
  
  // 如果不是分页响应，直接返回数组
  if (Array.isArray(response.data)) {
    console.log("[fetchVisualAnalysisResults] 返回数组响应，结果数:", response.data.length);
    return response.data;
  }
  
  console.warn("[fetchVisualAnalysisResults] 意外的响应格式:", response.data);
  return [];
}

/**
 * 获取单个视觉分析结果
 */
export async function fetchVisualAnalysisResult(id: number): Promise<VisualAnalysisResultRecord> {
  if (!hasAuthToken()) {
    throw createUnauthorizedError();
  }

  // 尝试从缓存获取
  const cacheKey = `/visual-analysis/${id}/`;
  const cached = getCachedData<VisualAnalysisResultRecord>(cacheKey);
  if (cached) {
    return cached;
  }

  const response = await api.get<VisualAnalysisResultRecord>(cacheKey);
  // 缓存结果（5分钟）
  setCachedData(cacheKey, response.data, undefined, 5 * 60 * 1000);
  return response.data;
}

/**
 * 删除视觉分析结果
 */
export async function deleteVisualAnalysisResult(id: number): Promise<void> {
  if (!hasAuthToken()) {
    throw createUnauthorizedError();
  }

  await api.delete(`/visual-analysis/${id}/`);
}

/**
 * 图像分析（固定5步流程）- 创建异步任务
 */
export async function analyzeImageComprehensive(imageFile: File, binaryThreshold: number = 140): Promise<{ task_id: string; status: string; progress: number; result_id?: number }> {
  if (!hasAuthToken()) {
    throw createUnauthorizedError();
  }

  // 使用 FormData 上传文件
  const formData = new FormData();
  formData.append('image', imageFile);
  formData.append('binary_threshold', String(binaryThreshold));

  const response = await api.post("/visual-analysis/comprehensive/", formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
  return response.data;
}

/**
 * 查询图像分析任务状态
 */
export async function getImageAnalysisTaskStatus(taskId: string): Promise<{
  task_id: string;
  status: string;
  progress: number;
  result?: any;
  error?: string;
  created_at: string;
  updated_at: string;
  completed_at?: string;
}> {
  if (!hasAuthToken()) {
    throw createUnauthorizedError();
  }

  const response = await api.get(`/visual-analysis/task/${taskId}/status/`);
  return response.data;
}

/**
 * 获取用户进行中的图像分析任务（pending或started状态）
 * 用于用户刷新页面后恢复任务状态
 */
export async function getPendingImageAnalysisTask(): Promise<{
  task: {
    task_id: string;
    status: string;
    progress: number;
    created_at: string;
    updated_at: string;
  } | null;
}> {
  if (!hasAuthToken()) {
    throw createUnauthorizedError();
  }

  const response = await api.get(`/visual-analysis/task/pending/`);
  return response.data;
}

/**
 * 获取用户视觉分析额度信息
 */
export type VisualAnalysisQuota = {
  is_member: boolean;
  free_quota: number;
  used_free_quota: number;
  remaining_free_quota: number;
  monthly_quota: number;
  used_monthly_quota: number;
  remaining_monthly_quota: number;
  total_remaining_quota: number;
  current_month: string;
};

export async function getVisualAnalysisQuota(): Promise<VisualAnalysisQuota> {
  if (!hasAuthToken()) {
    throw createUnauthorizedError();
  }

  const response = await api.get<VisualAnalysisQuota>("/visual-analysis/quota/");
  return response.data;
}

/**
 * 创建点数充值订单
 */
export async function createPointsOrder(input: {
  points: number;
  amount: number;
  payment_method: "wechat" | "alipay";
}): Promise<{
  order_id: number;
  order_number: string;
  points: number;
  amount: number;
  payment_method: string;
  status: string;
}> {
  if (!hasAuthToken()) {
    throw createUnauthorizedError();
  }

  const response = await api.post("/points/orders/", input);
  return response.data;
}

/**
 * 完成点数充值订单
 */
export async function completePointsOrder(
  orderId: number,
  input: {
    payment_transaction_id: string;
  }
): Promise<{
  order_id: number;
  points_added: number;
  balance_after: number;
}> {
  if (!hasAuthToken()) {
    throw createUnauthorizedError();
  }

  const response = await api.post(`/points/orders/${orderId}/complete/`, input);
  return response.data;
}

export default api;

