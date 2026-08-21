import React, { forwardRef, useId } from "react";
import { ChevronDown } from "lucide-react";

export interface SelectOption {
    label: string;
    value: string | number;
    disabled?: boolean;
}

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
    label?: React.ReactNode;
    error?: string;
    helperText?: string;
    leftIcon?: React.ReactNode;
    options?: SelectOption[];
    placeholder?: string;
    selectSize?: "sm" | "md" | "lg";
    variant?: "default" | "filled" | "borderless";
    containerClassName?: string;
    labelClassName?: string;
    errorClassName?: string;
    helperClassName?: string;
    selectClassName?: string;
}

const Select = forwardRef<HTMLSelectElement, SelectProps>(
    (
        {
            id: customId,
            label,
            error,
            helperText,
            leftIcon,
            options,
            placeholder,
            selectSize = "md",
            variant = "default",
            containerClassName = "",
            labelClassName = "",
            selectClassName = "",
            errorClassName = "",
            helperClassName = "",
            className = "",
            disabled = false,
            required = false,
            value,
            defaultValue,
            children,
            ...props
        },
        ref
    ) => {
        const generatedId = useId();
        const selectId = customId || generatedId;
        const errorId = `${selectId}-error`;
        const helperId = `${selectId}-helper`;

        const sizes = {
            sm: {
                select: "py-1.5 text-xs rounded-md pr-8",
                paddingDefault: "pl-3",
                paddingLeft: "pl-8",
                iconSize: 14,
                iconPosition: "left-2.5",
                chevronPosition: "right-2.5",
            },
            md: {
                select: "py-2 text-sm rounded-lg pr-9",
                paddingDefault: "pl-3.5",
                paddingLeft: "pl-9",
                iconSize: 16,
                iconPosition: "left-3",
                chevronPosition: "right-3",
            },
            lg: {
                select: "py-2.5 text-base rounded-lg pr-10",
                paddingDefault: "pl-4",
                paddingLeft: "pl-10",
                iconSize: 18,
                iconPosition: "left-3.5",
                chevronPosition: "right-3.5",
            },
        };

        const currentSize = sizes[selectSize] || sizes.md;

        const variants = {
            default:
                "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10",
            filled:
                "bg-slate-100 dark:bg-slate-800/60 border-transparent text-slate-900 dark:text-slate-100 focus:bg-white dark:focus:bg-slate-900 focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10",
            borderless:
                "bg-transparent border-transparent text-slate-900 dark:text-slate-100 focus:border-primary-500 focus:ring-0",
        };

        const errorStyles = error
            ? "border-red-500 dark:border-red-500/80 focus:border-red-500 focus:ring-red-500/10 dark:focus:border-red-500 dark:focus:ring-red-500/10"
            : "";

        const paddingClass = leftIcon ? currentSize.paddingLeft : currentSize.paddingDefault;

        const baseSelectStyles =
            "w-full border font-normal outline-none appearance-none cursor-pointer transition-all duration-150 ease-in-out disabled:bg-slate-50 dark:disabled:bg-slate-800/40 disabled:text-slate-400 dark:disabled:text-slate-500 disabled:cursor-not-allowed disabled:border-slate-200 dark:disabled:border-slate-800";

        const isPlaceholderSelected =
            placeholder &&
            (value === "" || value === undefined) &&
            (defaultValue === "" || defaultValue === undefined);

        return (
            <div className={`flex flex-col gap-1.5 w-full ${containerClassName}`}>
                {label && (
                    <label
                        htmlFor={selectId}
                        className={`text-xs font-medium text-slate-700 dark:text-slate-300 flex items-center justify-between select-none ${labelClassName}`}
                    >
                        <span>
                            {label}
                            {required && <span className="text-red-500 ml-1 select-none">*</span>}
                        </span>
                    </label>
                )}

                <div className="relative flex items-center w-full">
                    {leftIcon && (
                        <div
                            className={`absolute ${currentSize.iconPosition} flex items-center justify-center text-slate-400 dark:text-slate-500 pointer-events-none transition-colors z-10`}
                        >
                            {leftIcon}
                        </div>
                    )}

                    <select
                        ref={ref}
                        id={selectId}
                        value={value}
                        defaultValue={defaultValue}
                        disabled={disabled}
                        required={required}
                        aria-invalid={Boolean(error)}
                        aria-describedby={error ? errorId : helperText ? helperId : undefined}
                        className={`${baseSelectStyles} ${currentSize.select} ${paddingClass} ${variants[variant]} ${
                            isPlaceholderSelected ? "text-slate-400 dark:text-slate-500" : ""
                        } ${errorStyles} ${className} ${selectClassName}`}
                        {...props}
                    >
                        {placeholder && (
                            <option value="" disabled hidden>
                                {placeholder}
                            </option>
                        )}
                        {options
                            ? options.map((opt) => (
                                  <option
                                      key={opt.value}
                                      value={opt.value}
                                      disabled={opt.disabled}
                                      className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                                  >
                                      {opt.label}
                                  </option>
                              ))
                            : children}
                    </select>

                    <div
                        className={`absolute ${currentSize.chevronPosition} flex items-center justify-center text-slate-400 dark:text-slate-500 pointer-events-none transition-colors z-10`}
                    >
                        <ChevronDown size={currentSize.iconSize} />
                    </div>
                </div>

                {error ? (
                    <p id={errorId} className={`text-xs font-medium text-red-500 dark:text-red-400 flex items-center gap-1 ${errorClassName}`}>
                        {error}
                    </p>
                ) : helperText ? (
                    <p id={helperId} className={`text-xs text-slate-500 dark:text-slate-400 ${helperClassName}`}>
                        {helperText}
                    </p>
                ) : null}
            </div>
        );
    }
);

Select.displayName = "Select";

export default Select;
