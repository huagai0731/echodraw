import api from "@/services/api";

export type AdminHistoryMessage = {
  id: number;
  date: string;
  headline: string;
  text: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type AdminEncouragementMessage = {
  id: number;
  text: string;
  weight: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type AdminConditionalMessage = {
  id: number;
  name: string;
  text: string;
  priority: number;
  is_active: boolean;
  applies_when_no_upload: boolean;
  min_days_since_last_upload: number | null;
  max_days_since_last_upload: number | null;
  min_self_rating: number | null;
  max_self_rating: number | null;
  min_duration_minutes: number | null;
  max_duration_minutes: number | null;
  match_moods: string[];
  match_tags: string[];
  created_at: string;
  updated_at: string;
};

export type AdminAchievement = {
  id: number;
  slug: string;
  name: string;
  description: string;
  category: string;
  icon: string;
  is_active: boolean;
  display_order: number;
  level: number;
  group: number | null;
  condition: Record<string, unknown>;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type AdminAchievementGroup = {
  id: number;
  slug: string;
  name: string;
  description: string;
  category: string;
  icon: string;
  display_order: number;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  achievements: AdminAchievement[];
};

export type AdminShortTermTaskPreset = {
  id: number;
  code: string;
  category: string;
  title: string;
  description: string;
  is_active: boolean;
  display_order: number;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type AdminLongTermCopy = {
  id: number;
  min_hours: number;
  max_hours: number | null;
  message: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type AdminTestAccount = {
  id: number;
  user_id: number;
  email: string;
  display_name: string;
  notes: string;
  tags: string[];
  metadata: Record<string, unknown>;
  is_active: boolean;
  last_login: string | null;
  created_at: string;
  updated_at: string;
};

export type AdminCheckIn = {
  id: number;
  date: string;
  checked_at: string;
  source: string;
};

export type AdminUpload = {
  id: number;
  uploaded_at: string;
  self_rating: number | null;
  mood_label: string;
  tags: string[];
  duration_minutes: number | null;
  notes: string;
  image: string | null;
  created_at: string;
  updated_at: string;
};

export type AdminUploadInput = {
  uploaded_at?: string;
  self_rating?: number | null;
  mood_label?: string;
  tags?: string[];
  duration_minutes?: number | null;
  notes?: string;
  image?: File | null;
  clear_image?: boolean;
};

export async function listHistoryMessages() {
  const response = await api.get<AdminHistoryMessage[]>("/admin/home/history/");
  return response.data;
}

export async function createHistoryMessage(payload: Partial<AdminHistoryMessage>) {
  const response = await api.post<AdminHistoryMessage>("/admin/home/history/", payload);
  return response.data;
}

export async function updateHistoryMessage(id: number, payload: Partial<AdminHistoryMessage>) {
  const response = await api.patch<AdminHistoryMessage>(`/admin/home/history/${id}/`, payload);
  return response.data;
}

export async function deleteHistoryMessage(id: number) {
  await api.delete(`/admin/home/history/${id}/`);
}

export async function listEncouragementMessages() {
  const response = await api.get<AdminEncouragementMessage[]>("/admin/home/encouragements/");
  return response.data;
}

export async function createEncouragementMessage(payload: Partial<AdminEncouragementMessage>) {
  const response = await api.post<AdminEncouragementMessage>("/admin/home/encouragements/", payload);
  return response.data;
}

export async function updateEncouragementMessage(
  id: number,
  payload: Partial<AdminEncouragementMessage>,
) {
  const response = await api.patch<AdminEncouragementMessage>(`/admin/home/encouragements/${id}/`, payload);
  return response.data;
}

export async function deleteEncouragementMessage(id: number) {
  await api.delete(`/admin/home/encouragements/${id}/`);
}

export async function listConditionalMessages() {
  const response = await api.get<AdminConditionalMessage[]>("/admin/home/conditionals/");
  return response.data;
}

export async function createConditionalMessage(payload: Partial<AdminConditionalMessage>) {
  const response = await api.post<AdminConditionalMessage>("/admin/home/conditionals/", payload);
  return response.data;
}

export async function updateConditionalMessage(id: number, payload: Partial<AdminConditionalMessage>) {
  const response = await api.patch<AdminConditionalMessage>(`/admin/home/conditionals/${id}/`, payload);
  return response.data;
}

export async function deleteConditionalMessage(id: number) {
  await api.delete(`/admin/home/conditionals/${id}/`);
}

export type ListAchievementsOptions = {
  standalone?: boolean;
  group?: number | "none" | null;
};

function buildQuery(params: Record<string, string | number | undefined>) {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined) {
      return;
    }
    searchParams.set(key, String(value));
  });
  const serialized = searchParams.toString();
  return serialized ? `?${serialized}` : "";
}

export async function listAchievements(options: ListAchievementsOptions = {}) {
  const query = buildQuery({
    standalone:
      options.standalone === undefined ? undefined : options.standalone ? "true" : "false",
    group:
      options.group === undefined || options.group === null
        ? undefined
        : options.group === "none"
          ? "none"
          : options.group,
  });
  const response = await api.get<AdminAchievement[]>(`/admin/achievements/${query}`);
  return response.data;
}

export async function createAchievement(payload: Partial<AdminAchievement>) {
  const response = await api.post<AdminAchievement>("/admin/achievements/", payload);
  return response.data;
}

export async function updateAchievement(id: number, payload: Partial<AdminAchievement>) {
  const response = await api.patch<AdminAchievement>(`/admin/achievements/${id}/`, payload);
  return response.data;
}

export async function deleteAchievement(id: number) {
  await api.delete(`/admin/achievements/${id}/`);
}

export async function listAchievementGroups() {
  const response = await api.get<AdminAchievementGroup[]>("/admin/achievement-groups/");
  return response.data;
}

export async function createAchievementGroup(payload: Partial<AdminAchievementGroup>) {
  const response = await api.post<AdminAchievementGroup>("/admin/achievement-groups/", payload);
  return response.data;
}

export async function updateAchievementGroup(
  id: number,
  payload: Partial<AdminAchievementGroup>,
) {
  const response = await api.patch<AdminAchievementGroup>(
    `/admin/achievement-groups/${id}/`,
    payload,
  );
  return response.data;
}

export async function deleteAchievementGroup(id: number) {
  await api.delete(`/admin/achievement-groups/${id}/`);
}

export async function listShortTermTaskPresets() {
  const response = await api.get<AdminShortTermTaskPreset[]>("/admin/goals/short-term-presets/");
  return response.data;
}

export async function createShortTermTaskPreset(payload: Partial<AdminShortTermTaskPreset>) {
  const response = await api.post<AdminShortTermTaskPreset>("/admin/goals/short-term-presets/", payload);
  return response.data;
}

export async function updateShortTermTaskPreset(
  id: number,
  payload: Partial<AdminShortTermTaskPreset>,
) {
  const response = await api.patch<AdminShortTermTaskPreset>(
    `/admin/goals/short-term-presets/${id}/`,
    payload,
  );
  return response.data;
}

export async function deleteShortTermTaskPreset(id: number) {
  await api.delete(`/admin/goals/short-term-presets/${id}/`);
}

export async function listLongTermCopies() {
  const response = await api.get<AdminLongTermCopy[]>("/admin/goals/long-term-copy/");
  return response.data;
}

export async function createLongTermCopy(payload: Partial<AdminLongTermCopy>) {
  const response = await api.post<AdminLongTermCopy>("/admin/goals/long-term-copy/", payload);
  return response.data;
}

export async function updateLongTermCopy(id: number, payload: Partial<AdminLongTermCopy>) {
  const response = await api.patch<AdminLongTermCopy>(`/admin/goals/long-term-copy/${id}/`, payload);
  return response.data;
}

export async function deleteLongTermCopy(id: number) {
  await api.delete(`/admin/goals/long-term-copy/${id}/`);
}

export type ListTestAccountsOptions = {
  search?: string;
  tag?: string;
};

export async function listTestAccounts(options: ListTestAccountsOptions = {}) {
  const params = new URLSearchParams();
  if (options.search) {
    params.set("search", options.search);
  }
  if (options.tag) {
    params.set("tag", options.tag);
  }
  const query = params.toString();
  const response = await api.get<AdminTestAccount[]>(
    `/admin/test-accounts/${query ? `?${query}` : ""}`,
  );
  return response.data;
}

export async function getTestAccount(id: number) {
  const response = await api.get<AdminTestAccount>(`/admin/test-accounts/${id}/`);
  return response.data;
}

export async function createTestAccount(payload: Partial<AdminTestAccount> & { password?: string }) {
  const response = await api.post<AdminTestAccount>("/admin/test-accounts/", payload);
  return response.data;
}

export async function updateTestAccount(
  id: number,
  payload: Partial<AdminTestAccount> & { password?: string },
) {
  const response = await api.patch<AdminTestAccount>(`/admin/test-accounts/${id}/`, payload);
  return response.data;
}

export async function deleteTestAccount(id: number) {
  await api.delete(`/admin/test-accounts/${id}/`);
}

export async function listTestAccountCheckIns(profileId: number) {
  const response = await api.get<AdminCheckIn[]>(`/admin/test-accounts/${profileId}/checkins/`);
  return response.data;
}

export async function createTestAccountCheckIn(profileId: number, payload: Partial<AdminCheckIn>) {
  const response = await api.post<AdminCheckIn>(
    `/admin/test-accounts/${profileId}/checkins/`,
    payload,
  );
  return response.data;
}

export async function updateTestAccountCheckIn(
  profileId: number,
  checkinId: number,
  payload: Partial<AdminCheckIn>,
) {
  const response = await api.patch<AdminCheckIn>(
    `/admin/test-accounts/${profileId}/checkins/${checkinId}/`,
    payload,
  );
  return response.data;
}

export async function deleteTestAccountCheckIn(profileId: number, checkinId: number) {
  await api.delete(`/admin/test-accounts/${profileId}/checkins/${checkinId}/`);
}

export async function listTestAccountUploads(profileId: number) {
  const response = await api.get<AdminUpload[]>(`/admin/test-accounts/${profileId}/uploads/`);
  return response.data;
}

function buildUploadFormData(payload: AdminUploadInput): FormData {
  const formData = new FormData();

  if (payload.uploaded_at !== undefined) {
    formData.append("uploaded_at", payload.uploaded_at ?? "");
  }
  if (payload.self_rating !== undefined) {
    formData.append("self_rating", payload.self_rating == null ? "" : String(payload.self_rating));
  }
  if (payload.mood_label !== undefined) {
    formData.append("mood_label", payload.mood_label ?? "");
  }
  if (payload.tags !== undefined) {
    formData.append("tags", JSON.stringify(payload.tags ?? []));
  }
  if (payload.duration_minutes !== undefined) {
    formData.append(
      "duration_minutes",
      payload.duration_minutes == null ? "" : String(payload.duration_minutes),
    );
  }
  if (payload.notes !== undefined) {
    formData.append("notes", payload.notes ?? "");
  }

  if (payload.clear_image !== undefined) {
    formData.append("clear_image", payload.clear_image ? "true" : "false");
  }

  if (payload.image instanceof File) {
    formData.append("image", payload.image, payload.image.name);
  } else if (payload.image === null) {
    // 显式设置为 null 时，与 clear_image 组合用于清理旧图片。
    formData.append("image", "");
  }

  return formData;
}

export async function createTestAccountUpload(
  profileId: number,
  payload: AdminUploadInput,
) {
  const formData = buildUploadFormData(payload);
  const response = await api.post<AdminUpload>(
    `/admin/test-accounts/${profileId}/uploads/`,
    formData,
    {
      headers: { "Content-Type": "multipart/form-data" },
    },
  );
  return response.data;
}

export async function updateTestAccountUpload(
  profileId: number,
  uploadId: number,
  payload: AdminUploadInput,
) {
  const formData = buildUploadFormData(payload);
  const response = await api.patch<AdminUpload>(
    `/admin/test-accounts/${profileId}/uploads/${uploadId}/`,
    formData,
    {
      headers: { "Content-Type": "multipart/form-data" },
    },
  );
  return response.data;
}

export async function deleteTestAccountUpload(profileId: number, uploadId: number) {
  await api.delete(`/admin/test-accounts/${profileId}/uploads/${uploadId}/`);
}

