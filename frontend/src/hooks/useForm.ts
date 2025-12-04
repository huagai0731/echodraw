// 表单管理 Hook - 处理表单字段、验证和提交
import { useState, useCallback, useMemo, type ChangeEvent } from "react";

type FormField<T> = {
  value: T;
  error?: string;
};

type FormFields = Record<string, FormField<any>>;

type UseFormOptions<T extends FormFields> = {
  initialValues: T;
  validate?: (values: T) => Partial<Record<keyof T, string>>;
  onSubmit?: (values: T) => void | Promise<void>;
};

type UseFormReturn<T extends FormFields> = {
  fields: T;
  setField: <K extends keyof T>(name: K, value: T[K]["value"]) => void;
  setFieldError: <K extends keyof T>(name: K, error: string | undefined) => void;
  handleChange: <K extends keyof T>(
    name: K
  ) => (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  handleSubmit: (event?: React.FormEvent) => Promise<void>;
  reset: () => void;
  isValid: boolean;
  errors: Partial<Record<keyof T, string>>;
};

/**
 * 管理表单状态、验证和提交
 * 
 * @example
 * const { fields, handleChange, handleSubmit, isValid } = useForm({
 *   initialValues: {
 *     email: { value: '' },
 *     password: { value: '' }
 *   },
 *   validate: (values) => {
 *     const errors: any = {};
 *     if (!values.email.value) errors.email = '邮箱不能为空';
 *     if (!values.password.value) errors.password = '密码不能为空';
 *     return errors;
 *   },
 *   onSubmit: async (values) => {
 *     await api.post('/login', {
 *       email: values.email.value,
 *       password: values.password.value
 *     });
 *   }
 * });
 */
export function useForm<T extends FormFields>(
  options: UseFormOptions<T>
): UseFormReturn<T> {
  const { initialValues, validate, onSubmit } = options;

  const [fields, setFields] = useState<T>(initialValues);

  const setField = useCallback(<K extends keyof T>(
    name: K,
    value: T[K]["value"]
  ) => {
    setFields((prev) => ({
      ...prev,
      [name]: { ...prev[name], value, error: undefined },
    }));
  }, []);

  const setFieldError = useCallback(<K extends keyof T>(
    name: K,
    error: string | undefined
  ) => {
    setFields((prev) => ({
      ...prev,
      [name]: { ...prev[name], error },
    }));
  }, []);

  const handleChange = useCallback(<K extends keyof T>(name: K) => {
    return (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const value = event.target.value as T[K]["value"];
      setField(name, value);
    };
  }, [setField]);

  const errors = useMemo(() => {
    if (!validate) return {};
    return validate(fields);
  }, [fields, validate]);

  const isValid = useMemo(() => {
    return Object.keys(errors).length === 0;
  }, [errors]);

  const handleSubmit = useCallback(
    async (event?: React.FormEvent) => {
      event?.preventDefault();

      // 应用验证错误
      if (validate) {
        const validationErrors = validate(fields);
        Object.entries(validationErrors).forEach(([key, error]) => {
          setFieldError(key as keyof T, error);
        });

        if (Object.keys(validationErrors).length > 0) {
          return;
        }
      }

      if (onSubmit) {
        await onSubmit(fields);
      }
    },
    [fields, validate, onSubmit, setFieldError]
  );

  const reset = useCallback(() => {
    setFields(initialValues);
  }, [initialValues]);

  return {
    fields,
    setField,
    setFieldError,
    handleChange,
    handleSubmit,
    reset,
    isValid,
    errors,
  };
}

