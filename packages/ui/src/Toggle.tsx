import type { InputHTMLAttributes } from 'react';

interface ToggleProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'onChange'> {
    label: string;
    description?: string;
    checked: boolean;
    onChange: (checked: boolean) => void;
}

export function Toggle({
    label,
    description,
    checked,
    onChange,
    disabled,
    id,
    ...props
}: ToggleProps) {
    const toggleId = id || `toggle-${label.toLowerCase().replace(/\s+/g, '-')}`;

    return (
        <label
            htmlFor={toggleId}
            className={`
        flex items-center justify-between p-3 rounded-xl
        bg-white/5 hover:bg-white/10
        border border-white/10 hover:border-white/20
        transition-all duration-200 cursor-pointer
        ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
      `}
        >
            <div className="flex flex-col">
                <span className="text-white font-medium text-sm">{label}</span>
                {description && (
                    <span className="text-white/50 text-xs mt-0.5">{description}</span>
                )}
            </div>
            <div className="relative">
                <input
                    type="checkbox"
                    id={toggleId}
                    checked={checked}
                    onChange={(e) => onChange(e.target.checked)}
                    disabled={disabled}
                    className="sr-only peer"
                    {...props}
                />
                <div
                    className={`
            w-11 h-6 rounded-full
            peer-focus:ring-2 peer-focus:ring-violet-500/50
            transition-all duration-200
            ${checked
                            ? 'bg-gradient-to-r from-violet-600 to-indigo-600'
                            : 'bg-white/20'
                        }
          `}
                />
                <div
                    className={`
            absolute top-0.5 left-0.5
            w-5 h-5 rounded-full bg-white
            shadow-lg transition-transform duration-200
            ${checked ? 'translate-x-5' : 'translate-x-0'}
          `}
                />
            </div>
        </label>
    );
}
