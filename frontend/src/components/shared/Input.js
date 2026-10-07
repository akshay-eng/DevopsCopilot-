import React from 'react';

/**
 * Text Input component
 */
export const Input = ({
    theme,
    type = 'text',
    value,
    onChange,
    placeholder,
    disabled,
    className = '',
    ...props
}) => {
    return (
        <input
            type={type}
            value={value}
            onChange={onChange}
            placeholder={placeholder}
            disabled={disabled}
            className={`w-full px-4 py-2 rounded-lg border outline-none transition-colors ${
                disabled
                    ? theme === 'dark'
                        ? 'bg-gray-900 border-gray-800 text-gray-500 cursor-not-allowed'
                        : 'bg-gray-100 border-gray-200 text-gray-500 cursor-not-allowed'
                    : theme === 'dark'
                        ? 'bg-gray-800 border-gray-700 text-white focus:border-purple-600'
                        : 'bg-white border-gray-300 text-gray-900 focus:border-purple-600'
            } ${className}`}
            {...props}
        />
    );
};

/**
 * Label component
 */
export const Label = ({ theme, children, required, className = '' }) => {
    return (
        <label className={`block text-sm font-medium mb-2 ${
            theme === 'dark' ? 'text-gray-300' : 'text-gray-700'
        } ${className}`}>
            {children}
            {required && <span className="text-red-500 ml-1">*</span>}
        </label>
    );
};

/**
 * Select/Dropdown component
 */
export const Select = ({
    theme,
    value,
    onChange,
    children,
    disabled,
    className = '',
    ...props
}) => {
    return (
        <div className="relative">
            <select
                value={value}
                onChange={onChange}
                disabled={disabled}
                className={`w-full px-4 py-2 rounded-lg border outline-none appearance-none ${
                    disabled
                        ? theme === 'dark'
                            ? 'bg-gray-900 border-gray-800 text-gray-500 cursor-not-allowed'
                            : 'bg-gray-100 border-gray-200 text-gray-500 cursor-not-allowed'
                        : theme === 'dark'
                            ? 'bg-gray-800 border-gray-700 text-white focus:border-purple-600'
                            : 'bg-white border-gray-300 text-gray-900 focus:border-purple-600'
                } ${className}`}
                {...props}
            >
                {children}
            </select>
            <svg
                className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 pointer-events-none"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
            >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
        </div>
    );
};

/**
 * Textarea component
 */
export const Textarea = ({
    theme,
    value,
    onChange,
    placeholder,
    rows = 4,
    disabled,
    className = '',
    ...props
}) => {
    return (
        <textarea
            value={value}
            onChange={onChange}
            placeholder={placeholder}
            rows={rows}
            disabled={disabled}
            className={`w-full px-4 py-2 rounded-lg border outline-none transition-colors resize-none ${
                disabled
                    ? theme === 'dark'
                        ? 'bg-gray-900 border-gray-800 text-gray-500 cursor-not-allowed'
                        : 'bg-gray-100 border-gray-200 text-gray-500 cursor-not-allowed'
                    : theme === 'dark'
                        ? 'bg-gray-800 border-gray-700 text-white focus:border-purple-600'
                        : 'bg-white border-gray-300 text-gray-900 focus:border-purple-600'
            } ${className}`}
            {...props}
        />
    );
};

/**
 * FormGroup component (Label + Input wrapper)
 */
export const FormGroup = ({ theme, label, required, children, helper, error }) => {
    return (
        <div className="mb-4">
            {label && <Label theme={theme} required={required}>{label}</Label>}
            {children}
            {helper && !error && (
                <p className={`text-xs mt-1 ${theme === 'dark' ? 'text-gray-500' : 'text-gray-600'}`}>
                    {helper}
                </p>
            )}
            {error && (
                <p className="text-xs mt-1 text-red-500">{error}</p>
            )}
        </div>
    );
};

export default { Input, Label, Select, Textarea, FormGroup };
