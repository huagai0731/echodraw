import { useCallback, useMemo, useState } from "react";

export type UploadState = {
  file: File | null;
  title: string;
  description: string;
  tags: (string | number)[];
  mood: number | null; // 使用ID而不是字符串
  rating: number;
  durationHours: number;
  durationMinutes: number;
  collectionId?: string | null;
  collectionName?: string | null;
};

export type ValidationError = {
  field: string;
  message: string;
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars, no-unused-vars
export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
const ALLOWED_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp"];
const MAX_TITLE_LENGTH = 20;

export function useUploadState(initialState?: Partial<UploadState>) {
  const [state, setState] = useState<UploadState>({
    file: null,
    title: "",
    description: "",
    tags: [],
    mood: null,
    rating: 70,
    durationHours: 1,
    durationMinutes: 30,
    ...initialState,
  });

  const updateState = useCallback((updates: Partial<UploadState>) => {
    setState((prev) => ({ ...prev, ...updates }));
  }, []);

  const resetState = useCallback(() => {
    setState({
      file: null,
      title: "",
      description: "",
      tags: [],
      mood: null,
      rating: 70,
      durationHours: 1,
      durationMinutes: 30,
    });
  }, []);

  const totalMinutes = useMemo(
    () => state.durationHours * 60 + state.durationMinutes,
    [state.durationHours, state.durationMinutes]
  );

  const validateFile = useCallback((file: File): ValidationError | null => {
    // 不验证文件大小，因为我们会自动压缩
    // 只验证文件类型
    const lastDotIndex = file.name.lastIndexOf(".");
    const fileExtension =
      lastDotIndex >= 0 && lastDotIndex < file.name.length - 1
        ? file.name.toLowerCase().substring(lastDotIndex)
        : "";

    const isValidType =
      ALLOWED_TYPES.includes(file.type) ||
      (fileExtension && ALLOWED_EXTENSIONS.includes(fileExtension));

    if (!isValidType) {
      return {
        field: "file",
        message: `不支持的文件格式：${fileExtension || file.type}。\n仅支持：${ALLOWED_EXTENSIONS.join(", ")}`,
      };
    }

    return null;
  }, []);

  const validateTitle = useCallback((title: string): ValidationError | null => {
    if (title.length > MAX_TITLE_LENGTH) {
      return {
        field: "title",
        message: `标题长度不能超过 ${MAX_TITLE_LENGTH} 个字符`,
      };
    }
    return null;
  }, []);

  const validateTags = useCallback(
    (tags: (string | number)[]): ValidationError | null => {
      const seen = new Set<string | number>();
      for (const tag of tags) {
        if (seen.has(tag)) {
          return {
            field: "tags",
            message: "标签不能重复",
          };
        }
        seen.add(tag);
      }
      return null;
    },
    []
  );

  const validateDuration = useCallback(
    (hours: number, minutes: number): ValidationError | null => {
      const total = hours * 60 + minutes;
      if (total < 0) {
        return {
          field: "duration",
          message: "时长不能为负数",
        };
      }
      if (total % 5 !== 0) {
        return {
          field: "duration",
          message: "时长必须是 5 分钟的倍数",
        };
      }
      return null;
    },
    []
  );

  const validateAll = useCallback((): ValidationError[] => {
    const errors: ValidationError[] = [];

    if (state.file) {
      const fileError = validateFile(state.file);
      if (fileError) errors.push(fileError);
    }

    const titleError = validateTitle(state.title);
    if (titleError) errors.push(titleError);

    const tagsError = validateTags(state.tags);
    if (tagsError) errors.push(tagsError);

    const durationError = validateDuration(
      state.durationHours,
      state.durationMinutes
    );
    if (durationError) errors.push(durationError);

    return errors;
  }, [
    state,
    validateFile,
    validateTitle,
    validateTags,
    validateDuration,
  ]);

  return {
    state,
    updateState,
    resetState,
    totalMinutes,
    validateFile,
    validateTitle,
    validateTags,
    validateDuration,
    validateAll,
  };
}

