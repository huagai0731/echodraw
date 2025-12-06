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
  // 打卡条件
  min_total_checkins: number | null;
  max_total_checkins: number | null;
  min_streak_days: number | null;
  max_streak_days: number | null;
  // 上传条件
  min_total_uploads: number | null;
  max_total_uploads: number | null;
  // 上一次上传条件
  match_last_upload_moods: string[];
  match_last_upload_tags: string[];
  created_at: string;
  updated_at: string;
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

export type AdminMonthlyReportTemplate = {
  id: number;
  section: string;
  name: string;
  text_template: string;
  priority: number;
  is_active: boolean;
  min_total_uploads: number | null;
  max_total_uploads: number | null;
  min_total_hours: number | null;
  max_total_hours: number | null;
  min_avg_hours: number | null;
  max_avg_hours: number | null;
  creator_type: string | null;
  min_avg_rating: number | null;
  max_avg_rating: number | null;
  uploads_change_direction: string | null;
  hours_change_direction: string | null;
  extra_conditions: Record<string, unknown>;
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

// ==================== 测试管理 API ====================

export type AdminTestDimension = {
  id: number;
  code: string;
  name: string;
  endpoint_a_code: string;
  endpoint_a_name: string;
  endpoint_b_code: string;
  endpoint_b_name: string;
  description: string;
  display_order: number;
  created_at: string;
  updated_at: string;
};

export type AdminTestOption = {
  id: number;
  option_text: string;
  dimension: number;
  dimension_name: string;
  endpoint_code: string;
  score_config: Record<string, number>;
  display_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type AdminTestOptionText = {
  id: number;
  text: string;
  display_order: number;
  is_active: boolean;
  options: AdminTestOption[];
  option_count: number;
  created_at: string;
  updated_at: string;
};

export type AdminTestQuestion = {
  id: number;
  test: number;
  question_text: string;
  dimension?: number | null;
  dimension_id?: number | null;
  dimension_name?: string | null;
  endpoint_code?: string;
  score_config?: Record<string, number>;
  display_order: number;
  is_active: boolean;
  option_texts: AdminTestOptionText[];
  option_text_count: number;
  created_at: string;
  updated_at: string;
};

export type AdminTest = {
  id: number;
  slug: string;
  name: string;
  description: string;
  test_type: "type_1" | "type_2";
  dimensions: AdminTestDimension[];
  dimension_ids?: number[];
  questions: AdminTestQuestion[];
  question_count: number;
  is_active: boolean;
  display_order: number;
  metadata: Record<string, unknown>;
  dimension_question_mapping?: Record<string, number[]>; // 维度ID（字符串） -> 题目ID列表
  created_at: string;
  updated_at: string;
};

export type AdminUserTestResult = {
  id: number;
  user: number;
  user_email: string;
  test: number;
  test_name: string;
  dimension_scores: Record<string, number>;
  answers: Record<string, unknown>;
  completed_at: string;
  created_at: string;
  updated_at: string;
};

// 测试维度 API
export async function listTestDimensions() {
  const response = await api.get<AdminTestDimension[]>("/admin/tests/dimensions/");
  return response.data;
}

export async function createTestDimension(payload: Partial<AdminTestDimension>) {
  const response = await api.post<AdminTestDimension>("/admin/tests/dimensions/", payload);
  return response.data;
}

export async function updateTestDimension(id: number, payload: Partial<AdminTestDimension>) {
  const response = await api.patch<AdminTestDimension>(`/admin/tests/dimensions/${id}/`, payload);
  return response.data;
}

export async function deleteTestDimension(id: number) {
  await api.delete(`/admin/tests/dimensions/${id}/`);
}

// 测试 API
export async function listTests() {
  const response = await api.get<AdminTest[]>("/admin/tests/");
  return response.data;
}

export async function getTest(id: number) {
  const response = await api.get<AdminTest>(`/admin/tests/${id}/`);
  return response.data;
}

export async function createTest(payload: Partial<AdminTest>) {
  const response = await api.post<AdminTest>("/admin/tests/", payload);
  return response.data;
}

export async function updateTest(id: number, payload: Partial<AdminTest>) {
  const response = await api.patch<AdminTest>(`/admin/tests/${id}/`, payload);
  return response.data;
}

export async function deleteTest(id: number) {
  await api.delete(`/admin/tests/${id}/`);
}

// 测试题目 API
export async function listTestQuestions(testId?: number) {
  const params = testId ? { test: testId } : {};
  const response = await api.get<AdminTestQuestion[]>("/admin/tests/questions/", { params });
  return response.data;
}

export async function getTestQuestion(id: number) {
  const response = await api.get<AdminTestQuestion>(`/admin/tests/questions/${id}/`);
  return response.data;
}

export async function createTestQuestion(payload: Partial<AdminTestQuestion>) {
  const response = await api.post<AdminTestQuestion>("/admin/tests/questions/", payload);
  return response.data;
}

export async function updateTestQuestion(id: number, payload: Partial<AdminTestQuestion>) {
  const response = await api.patch<AdminTestQuestion>(`/admin/tests/questions/${id}/`, payload);
  return response.data;
}

export async function deleteTestQuestion(id: number) {
  await api.delete(`/admin/tests/questions/${id}/`);
}

// 测试选项 API
export async function listTestOptions(questionId?: number) {
  const params = questionId ? { question: questionId } : {};
  const response = await api.get<AdminTestOption[]>("/admin/tests/options/", { params });
  return response.data;
}

export async function getTestOption(id: number) {
  const response = await api.get<AdminTestOption>(`/admin/tests/options/${id}/`);
  return response.data;
}

export async function createTestOption(payload: Partial<AdminTestOption>) {
  const response = await api.post<AdminTestOption>("/admin/tests/options/", payload);
  return response.data;
}

export async function updateTestOption(id: number, payload: Partial<AdminTestOption>) {
  const response = await api.patch<AdminTestOption>(`/admin/tests/options/${id}/`, payload);
  return response.data;
}

export async function deleteTestOption(id: number) {
  await api.delete(`/admin/tests/options/${id}/`);
}

// 用户测试结果 API
export async function listUserTestResults(testId?: number, userId?: number) {
  const params: Record<string, number> = {};
  if (testId) params.test = testId;
  if (userId) params.user = userId;
  const response = await api.get<AdminUserTestResult[]>("/admin/tests/results/", { params });
  return response.data;
}

export type AdminUser = {
  id: number;
  email: string;
  first_name: string | null;
  last_name: string | null;
  date_joined: string | null;
};

export type AdminMonthlyReportData = {
  exists: boolean;
  year: number;
  month: number;
  user?: {
    id: number;
    email: string;
  };
  stats?: {
    totalUploads: number;
    totalHours: number;
    avgHoursPerUpload: number;
    avgRating: number;
    mostUploadDay: { date: string; count: number } | null;
    currentStreak: number;
    longestStreak: number;
  };
  timeDistribution?: Array<{ hour: number; count: number; percentage: number }>;
  weeklyDistribution?: Array<{ weekday: number; count: number; minutes: number }>;
  tagStats?: Array<{ tag: string; count: number; percentage: number; avgDurationMinutes: number; avgRating: number }>;
  heatmapCalendar?: Array<{ day: number; count: number; weekday: number; opacity: number }>;
  uploadIds?: number[];
  reportTexts?: Record<string, string>;
};

export async function listAdminUsers(): Promise<AdminUser[]> {
  const response = await api.get<AdminUser[]>("/admin/users/");
  return response.data;
}

export async function getAdminUserMonthlyReport(
  userId: number,
  year: number,
  month: number
): Promise<AdminMonthlyReportData> {
  const response = await api.get<AdminMonthlyReportData>("/admin/reports/monthly/", {
    params: { user_id: userId, year, month },
  });
  return response.data;
}

export async function getUserTestResult(id: number) {
  const response = await api.get<AdminUserTestResult>(`/admin/tests/results/${id}/`);
  return response.data;
}

// ==================== 每日小测 API ====================

export type AdminDailyQuizOption = {
  id: number;
  option_type: "text" | "image";
  text: string;
  image: string | null;
  image_url: string | null;
  display_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type AdminDailyQuiz = {
  id: number;
  date: string;
  question_text: string;
  options: AdminDailyQuizOption[];
  option_count: number;
  display_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type AdminDailyQuizInput = {
  date: string;
  question_text: string;
  display_order?: number;
  is_active?: boolean;
  options_data?: Array<{
    option_type: "text" | "image";
    text?: string;
    image?: File | null;
    display_order?: number;
  }>;
};

// 每日小测 API
export async function listDailyQuizzes() {
  const response = await api.get<AdminDailyQuiz[]>("/admin/daily-quiz/");
  return response.data;
}

export async function getDailyQuiz(id: number) {
  const response = await api.get<AdminDailyQuiz>(`/admin/daily-quiz/${id}/`);
  return response.data;
}

function buildDailyQuizFormData(payload: AdminDailyQuizInput): FormData {
  const formData = new FormData();
  
  formData.append("date", payload.date);
  formData.append("question_text", payload.question_text);
  
  if (payload.display_order !== undefined) {
    formData.append("display_order", String(payload.display_order));
  }
  if (payload.is_active !== undefined) {
    formData.append("is_active", String(payload.is_active));
  }
  
  // 构建options_data，将图片文件单独处理
  if (payload.options_data) {
    const optionsDataForJson: Array<{
      option_type: string;
      text?: string;
      display_order?: number;
    }> = [];
    
    payload.options_data.forEach((option, index) => {
      const optionData: any = {
        option_type: option.option_type,
      };
      
      if (option.option_type === "text" && option.text !== undefined) {
        optionData.text = option.text || "";
      }
      
      if (option.display_order !== undefined) {
        optionData.display_order = option.display_order;
      } else {
        optionData.display_order = 100 + index * 10;
      }
      
      optionsDataForJson.push(optionData);
      
      // 如果有图片，单独添加
      if (option.option_type === "image" && option.image instanceof File) {
        formData.append(`option_image_${index}`, option.image, option.image.name);
      }
    });
    
    // 将options_data作为JSON字符串添加
    formData.append("options_data", JSON.stringify(optionsDataForJson));
  }
  
  return formData;
}

export async function createDailyQuiz(payload: AdminDailyQuizInput) {
  const formData = buildDailyQuizFormData(payload);
  const response = await api.post<AdminDailyQuiz>("/admin/daily-quiz/", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return response.data;
}

export async function updateDailyQuiz(id: number, payload: AdminDailyQuizInput) {
  const formData = buildDailyQuizFormData(payload);
  const response = await api.patch<AdminDailyQuiz>(`/admin/daily-quiz/${id}/`, formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return response.data;
}

export async function deleteDailyQuiz(id: number) {
  await api.delete(`/admin/daily-quiz/${id}/`);
}

export async function listMonthlyReportTemplates(section?: string) {
  const params = section ? { section } : {};
  const response = await api.get<AdminMonthlyReportTemplate[]>("/admin/reports/monthly-templates/", { params });
  return response.data;
}

export async function createMonthlyReportTemplate(payload: Partial<AdminMonthlyReportTemplate>) {
  const response = await api.post<AdminMonthlyReportTemplate>("/admin/reports/monthly-templates/", payload);
  return response.data;
}

export async function updateMonthlyReportTemplate(
  id: number,
  payload: Partial<AdminMonthlyReportTemplate>,
) {
  const response = await api.patch<AdminMonthlyReportTemplate>(`/admin/reports/monthly-templates/${id}/`, payload);
  return response.data;
}

export async function deleteMonthlyReportTemplate(id: number) {
  await api.delete(`/admin/reports/monthly-templates/${id}/`);
}


