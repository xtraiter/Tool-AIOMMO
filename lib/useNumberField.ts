import { useCallback, useState } from "react";

type NumberFieldOptions = {
  min?: number;
  max?: number;
};

/**
 * Controlled number-input state that keeps a separate typing "draft" from the
 * committed numeric value. Fixes the classic React number-input bug where
 * clamping/coercing on every keystroke makes it impossible to clear the field
 * or type a fresh value (deleting digits snaps straight back to min).
 *
 * - While typing: the field can be empty or temporarily out of range; the
 *   committed `value` only updates for numbers that parse cleanly.
 * - On blur: the draft is clamped to [min, max] and both are synced.
 * - `isInvalid` is true while the current draft is empty or out of range, so
 *   callers can show a red border / "Tối thiểu: X" hint without fighting the
 *   user's typing.
 */
export function useNumberField(initialValue: number, options: NumberFieldOptions = {}) {
  const { min, max } = options;
  const [value, setValueState] = useState(initialValue);
  const [draft, setDraft] = useState(String(initialValue));

  const clamp = useCallback(
    (n: number) => {
      let result = n;
      if (min !== undefined) result = Math.max(min, result);
      if (max !== undefined) result = Math.min(max, result);
      return result;
    },
    [min, max]
  );

  const onChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    setDraft(raw);
    if (raw.trim() === "") return;
    const parsed = Number(raw);
    if (!Number.isNaN(parsed)) setValueState(parsed);
  }, []);

  const onBlur = useCallback(() => {
    const parsed = Number(draft);
    const finalValue = draft.trim() === "" || Number.isNaN(parsed) ? clamp(min ?? 0) : clamp(parsed);
    setValueState(finalValue);
    setDraft(String(finalValue));
  }, [draft, clamp, min]);

  const setValue = useCallback((n: number) => {
    setValueState(n);
    setDraft(String(n));
  }, []);

  const parsedDraft = Number(draft);
  const isInvalid =
    draft.trim() === "" ||
    Number.isNaN(parsedDraft) ||
    (min !== undefined && parsedDraft < min) ||
    (max !== undefined && parsedDraft > max);

  const hint =
    min !== undefined && max !== undefined
      ? `Giá trị hợp lệ: ${min} - ${max}`
      : min !== undefined
        ? `Tối thiểu: ${min}`
        : max !== undefined
          ? `Tối đa: ${max}`
          : undefined;

  return { value, draft, onChange, onBlur, isInvalid, hint, setValue };
}
