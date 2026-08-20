import React, { useState, forwardRef, useId } from "react";
import { Eye, EyeOff, X } from "lucide-react";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
    label?: React.ReactNode;
    error?: string;
    helperText?: string;
    leftIcon?: React.ReactNode;
    rightIcon?: React.ReactNode;
    inputSize?: "sm" | "md" | "lg";
    variant?: "default" | "filled" | "borderless";
    showPasswordToggle?: boolean;
    clearable?: boolean;
    onClear?: () => void;
    containerClassName?: string;
    labelClassName?: string;
    errorClassName?: string;
    helperClassName?: string;
    inputClassName?: string;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
    (
        {
            id: customId,
            label,
            error,
            helperText,
            leftIcon,
            rightIcon,
            inputSize = "md",
            variant = "default",
            type = "text",
            showPasswordToggle = true,
            clearable = false,
            onClear,
            containerClassName = "",
            labelClassName = "",
            inputClassName = "",
            errorClassName = "",
            helperClassName = "",
            className = "",
            disabled = false,
            required = false,
            value,
            onChange,
            ...props
        },
        ref
    ) => {
        const generatedId = useId();
        const inputId = customId || generatedId;
        const errorId = `${inputId}-error`;
        const helperId = `${inputId}-helper`;

        const [showPassword, setShowPassword] = useState(false);

        const isPasswordType = type === "password";
        const actualType = isPasswordType ? (showPassword ? "text" : "password") : type;

        const sizes = {
            sm: {
                input: "py-1.5 text-xs rounded-md",
                paddingDefault: "px-3",
                paddingLeft: "pl-8",
                paddingRight: "pr-8",
                paddingRightDouble: "pr-14",
                iconSize: 14,
                iconPosition: "left-2.5",
                rightIconPosition: "right-2.5",
            },
            md: {
                input: "py-2 text-sm rounded-lg",
                paddingDefault: "px-3.5",
                paddingLeft: "pl-9",
                paddingRight: "pr-9",
                paddingRightDouble: "pr-16",
                iconSize: 16,
                iconPosition: "left-3",
                rightIconPosition: "right-3",
            },
            lg: {
                input: "py-2.5 text-base rounded-lg",
                paddingDefault: "px-4",
                paddingLeft: "pl-10",
                paddingRight: "pr-10",
                paddingRightDouble: "pr-20",
                iconSize: 18,
                iconPosition: "left-3.5",
                rightIconPosition: "right-3.5",
            },
        };

        const currentSize = sizes[inputSize] || sizes.md;

        const variants = {
            default:
                "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10",
            filled:
                "bg-slate-100 dark:bg-slate-800/60 border-transparent text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:bg-white dark:focus:bg-slate-900 focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10",
            borderless:
                "bg-transparent border-transparent text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-primary-500 focus:ring-0",
        };

        const errorStyles = error
            ? "border-red-500 dark:border-red-500/80 focus:border-red-500 focus:ring-red-500/10 dark:focus:border-red-500 dark:focus:ring-red-500/10"
            : "";

        const hasRightAction = (isPasswordType && showPasswordToggle) || (clearable && Boolean(value));
        const hasRightContent = Boolean(rightIcon || hasRightAction);
        const hasMultipleRightActions =
            (Boolean(rightIcon) && hasRightAction) ||
            (Boolean(clearable && value) && isPasswordType && showPasswordToggle);

        let paddingClass = currentSize.paddingDefault;
        if (leftIcon && hasMultipleRightActions) {
            paddingClass = `${currentSize.paddingLeft} ${currentSize.paddingRightDouble}`;
        } else if (leftIcon && hasRightContent) {
            paddingClass = `${currentSize.paddingLeft} ${currentSize.paddingRight}`;
        } else if (leftIcon) {
            paddingClass = `${currentSize.paddingLeft} ${currentSize.paddingDefault}`;
        } else if (hasMultipleRightActions) {
            paddingClass = `${currentSize.paddingDefault} ${currentSize.paddingRightDouble}`;
        } else if (hasRightContent) {
            paddingClass = `${currentSize.paddingDefault} ${currentSize.paddingRight}`;
        }

        const baseInputStyles =
            "w-full border font-normal outline-none transition-all duration-150 ease-in-out disabled:bg-slate-50 dark:disabled:bg-slate-800/40 disabled:text-slate-400 dark:disabled:text-slate-500 disabled:cursor-not-allowed disabled:border-slate-200 dark:disabled:border-slate-800";

        return (
            <div className={`flex flex-col gap-1.5 w-full ${containerClassName}`}>
                {label && (
                    <label
                        htmlFor={inputId}
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
                            className={`absolute ${currentSize.iconPosition} flex items-center justify-center text-slate-400 dark:text-slate-500 pointer-events-none transition-colors`}
                        >
                            {leftIcon}
                        </div>
                    )}

                    <input
                        ref={ref}
                        id={inputId}
                        type={actualType}
                        value={value}
                        onChange={onChange}
                        disabled={disabled}
                        required={required}
                        aria-invalid={Boolean(error)}
                        aria-describedby={error ? errorId : helperText ? helperId : undefined}
                        className={`${baseInputStyles} ${currentSize.input} ${paddingClass} ${variants[variant]} ${errorStyles} ${className} ${inputClassName}`}
                        {...props}
                    />

                    <div className={`absolute ${currentSize.rightIconPosition} flex items-center gap-1.5 text-slate-400 dark:text-slate-500`}>
                        {clearable && value && !disabled && (
                            <button
                                type="button"
                                onClick={onClear}
                                tabIndex={-1}
                                className="p-0.5 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors focus:outline-none"
                                title="Limpar"
                            >
                                <X size={currentSize.iconSize} />
                            </button>
                        )}

                        {isPasswordType && showPasswordToggle && !disabled && (
                            <button
                                type="button"
                                onClick={() => setShowPassword((prev) => !prev)}
                                tabIndex={-1}
                                className="p-0.5 rounded hover:text-slate-700 dark:hover:text-slate-200 transition-colors focus:outline-none"
                                title={showPassword ? "Ocultar senha" : "Exibir senha"}
                            >
                                {showPassword ? <EyeOff size={currentSize.iconSize} /> : <Eye size={currentSize.iconSize} />}
                            </button>
                        )}

                        {rightIcon && <div className="flex items-center justify-center">{rightIcon}</div>}
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

Input.displayName = "Input";

export default Input;

