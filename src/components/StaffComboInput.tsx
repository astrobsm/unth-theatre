'use client';

/**
 * StaffComboInput
 * ---------------
 * A lightweight combobox: it shows suggestions fetched from the database
 * (via the `options` prop) using a native <datalist>, while still allowing the
 * user to type a brand-new name that is not in the database. This satisfies the
 * "pick a known surgeon / scrub nurse, or type a new one" requirement without a
 * heavy custom dropdown.
 */

import { useId } from 'react';

export type StaffComboOption = {
  id: string;
  fullName: string;
  staffCode?: string | null;
  role?: string | null;
};

type Props = {
  value: string;
  onChange: (value: string) => void;
  options: StaffComboOption[];
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  'aria-label'?: string;
};

export default function StaffComboInput({
  value,
  onChange,
  options,
  placeholder = 'Select or type a name…',
  required,
  disabled,
  className,
  'aria-label': ariaLabel,
}: Props) {
  const listId = useId();
  return (
    <>
      <input
        type="text"
        list={listId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        aria-label={ariaLabel}
        className={className || 'w-full border rounded-lg px-3 py-2'}
        autoComplete="off"
      />
      <datalist id={listId}>
        {options.map((o) => (
          <option key={o.id} value={o.fullName}>
            {o.staffCode ? `${o.staffCode}${o.role ? ` — ${o.role}` : ''}` : o.role || ''}
          </option>
        ))}
      </datalist>
    </>
  );
}
