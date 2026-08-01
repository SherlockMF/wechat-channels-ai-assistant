"use client";

import { useState } from "react";
import { cn } from "@/components/ui";

export const SELECT_OTHER_VALUE = "__other__";

export function SelectWithOther({
  label,
  value,
  onChange,
  options,
  allowEmpty = false,
  emptyLabel = "不指定",
  otherLabel = "其他",
  otherPlaceholder = "请输入自定义内容",
  optionalHint = false,
  className,
  selectClassName,
}: {
  label?: string;
  /** 最终值：预设 value、自定义文本、或空字符串 */
  value: string;
  onChange: (value: string) => void;
  options: readonly { value: string; label: string }[];
  allowEmpty?: boolean;
  emptyLabel?: string;
  otherLabel?: string;
  otherPlaceholder?: string;
  optionalHint?: boolean;
  className?: string;
  selectClassName?: string;
}) {
  const [forceOther, setForceOther] = useState(false);
  const isKnownOption = options.some((item) => item.value === value);
  const showOther =
    forceOther || (value !== "" && !isKnownOption);
  const selectValue = showOther
    ? SELECT_OTHER_VALUE
    : allowEmpty || isKnownOption
      ? value
      : SELECT_OTHER_VALUE;

  return (
    <div className={cn("grid gap-1", className)}>
      {label ? (
        <span className="text-xs font-semibold text-[#52615a]">
          {label}
          {optionalHint ? (
            <span className="ml-1 font-normal text-[#9aa59e]">可选</span>
          ) : null}
        </span>
      ) : null}
      <select
        className={cn(
          "h-10 rounded-lg border border-line bg-white px-3 text-sm outline-none focus:border-pine",
          selectClassName,
        )}
        value={
          selectValue === SELECT_OTHER_VALUE || isKnownOption || allowEmpty
            ? selectValue
            : SELECT_OTHER_VALUE
        }
        onChange={(event) => {
          const next = event.target.value;
          if (next === SELECT_OTHER_VALUE) {
            setForceOther(true);
            if (isKnownOption || value === "") onChange("");
            return;
          }
          setForceOther(false);
          onChange(next);
        }}
      >
        {allowEmpty ? <option value="">{emptyLabel}</option> : null}
        {options.map((item) => (
          <option key={item.value} value={item.value}>
            {item.label}
          </option>
        ))}
        <option value={SELECT_OTHER_VALUE}>{otherLabel}</option>
      </select>
      {showOther ? (
        <input
          className="h-10 rounded-lg border border-line bg-white px-3 text-sm outline-none focus:border-pine"
          value={isKnownOption ? "" : value}
          placeholder={otherPlaceholder}
          onChange={(event) => {
            setForceOther(true);
            onChange(event.target.value);
          }}
        />
      ) : null}
    </div>
  );
}
