/**
 * The form primitives (ticket Deliverable 6): `TextField`, `TextArea`, `Select`, `MultiSelect`,
 * `DateField`, `Checkbox`, `RadioGroup`, `ErrorSummary`.
 *
 * Every field takes a REQUIRED `label` and renders a real `<label for>` — an unlabelled field is not
 * representable through this API. Help text and error text are wired with `aria-describedby`, and an
 * errored field carries `aria-invalid="true"`.
 */
import { useId } from 'react';
import type { ReactNode } from 'react';

import { Chip } from './basic.js';

/** The label/description/error wiring every field shares. */
type FieldShellProps = {
  readonly label: string;
  /**
   * An id supplied by the owning screen — typically so an `ErrorSummary` entry can link to this
   * field. It replaces the generated id on BOTH the control and the label's `htmlFor`: applying it
   * to only one of the two silently breaks the label association, which is the single most common
   * way an accessible form stops being accessible.
   */
  readonly controlId?: string;
  readonly help?: string;
  readonly error?: string;
  readonly required?: boolean;
  readonly children: (ids: {
    readonly controlId: string;
    readonly describedBy: string | undefined;
    readonly invalid: boolean;
  }) => ReactNode;
};

function FieldShell(props: FieldShellProps): ReactNode {
  const base = useId();
  const controlId = props.controlId ?? `${base}-control`;
  const helpId = `${base}-help`;
  const errorId = `${base}-error`;
  const described = [
    props.help === undefined ? undefined : helpId,
    props.error === undefined ? undefined : errorId,
  ].filter((value): value is string => value !== undefined);
  return (
    <div className="tui-field">
      <label className="tui-field__label" htmlFor={controlId}>
        {props.label}
        {props.required === true ? <span className="tui-field__required"> (required)</span> : null}
      </label>
      {props.help === undefined ? null : (
        <p className="tui-field__help" id={helpId}>
          {props.help}
        </p>
      )}
      {props.error === undefined ? null : (
        <p className="tui-field__error" id={errorId}>
          {props.error}
        </p>
      )}
      {props.children({
        controlId,
        describedBy: described.length === 0 ? undefined : described.join(' '),
        invalid: props.error !== undefined,
      })}
    </div>
  );
}

export type TextFieldProps = {
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly help?: string;
  readonly error?: string;
  readonly required?: boolean;
  readonly id?: string;
};

export function TextField(props: TextFieldProps): ReactNode {
  return (
    <FieldShell
      label={props.label}
      {...(props.help === undefined ? {} : { help: props.help })}
      {...(props.error === undefined ? {} : { error: props.error })}
      {...(props.required === undefined ? {} : { required: props.required })}
      {...(props.id === undefined ? {} : { controlId: props.id })}
    >
      {({ controlId, describedBy, invalid }) => (
        <input
          className="tui-input"
          type="text"
          id={controlId}
          value={props.value}
          aria-describedby={describedBy}
          aria-invalid={invalid ? 'true' : undefined}
          onChange={(event) => props.onChange(event.target.value)}
        />
      )}
    </FieldShell>
  );
}

export type TextAreaProps = TextFieldProps & { readonly rows?: number };

export function TextArea(props: TextAreaProps): ReactNode {
  return (
    <FieldShell
      label={props.label}
      {...(props.help === undefined ? {} : { help: props.help })}
      {...(props.error === undefined ? {} : { error: props.error })}
      {...(props.required === undefined ? {} : { required: props.required })}
      {...(props.id === undefined ? {} : { controlId: props.id })}
    >
      {({ controlId, describedBy, invalid }) => (
        <textarea
          className="tui-textarea"
          id={controlId}
          rows={props.rows ?? 4}
          value={props.value}
          aria-describedby={describedBy}
          aria-invalid={invalid ? 'true' : undefined}
          onChange={(event) => props.onChange(event.target.value)}
        />
      )}
    </FieldShell>
  );
}

export type SelectOption = { readonly value: string; readonly label: string };

export type SelectProps = {
  readonly label: string;
  readonly value: string;
  readonly options: readonly SelectOption[];
  readonly onChange: (value: string) => void;
  readonly help?: string;
  readonly error?: string;
  readonly required?: boolean;
  /** Supplied by the owning screen so an `ErrorSummary` entry can link here. */
  readonly id?: string;
};

/** A native `<select>`: keyboard behaviour and the mobile picker come from the platform. */
export function Select(props: SelectProps): ReactNode {
  return (
    <FieldShell
      label={props.label}
      {...(props.help === undefined ? {} : { help: props.help })}
      {...(props.error === undefined ? {} : { error: props.error })}
      {...(props.required === undefined ? {} : { required: props.required })}
      {...(props.id === undefined ? {} : { controlId: props.id })}
    >
      {({ controlId, describedBy, invalid }) => (
        <select
          className="tui-select"
          id={controlId}
          value={props.value}
          aria-describedby={describedBy}
          aria-invalid={invalid ? 'true' : undefined}
          onChange={(event) => props.onChange(event.target.value)}
        >
          {props.options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      )}
    </FieldShell>
  );
}

export type MultiSelectProps = {
  readonly label: string;
  readonly values: readonly string[];
  readonly options: readonly SelectOption[];
  readonly onChange: (values: readonly string[]) => void;
  readonly help?: string;
  readonly error?: string;
};

/**
 * A checkbox group plus removable chips for the current selection.
 *
 * Deliberately NOT a custom listbox: a `fieldset`/`legend` of native checkboxes is operable by every
 * assistive technology without a single ARIA attribute, and the chips give a sighted user the same
 * summary the group already exposes.
 */
export function MultiSelect(props: MultiSelectProps): ReactNode {
  const base = useId();
  const errorId = `${base}-error`;
  const toggle = (value: string): void => {
    props.onChange(
      props.values.includes(value)
        ? props.values.filter((held) => held !== value)
        : [...props.values, value],
    );
  };
  return (
    <fieldset
      className="tui-multiselect"
      aria-describedby={props.error === undefined ? undefined : errorId}
      aria-invalid={props.error === undefined ? undefined : 'true'}
    >
      <legend className="tui-field__label">{props.label}</legend>
      {props.help === undefined ? null : <p className="tui-field__help">{props.help}</p>}
      {props.error === undefined ? null : (
        <p className="tui-field__error" id={errorId}>
          {props.error}
        </p>
      )}
      {props.options.map((option) => {
        const optionId = `${base}-${option.value}`;
        return (
          <div className="tui-multiselect__option" key={option.value}>
            <input
              type="checkbox"
              id={optionId}
              checked={props.values.includes(option.value)}
              onChange={() => toggle(option.value)}
            />
            <label htmlFor={optionId}>{option.label}</label>
          </div>
        );
      })}
      <div className="tui-multiselect__chips">
        {props.values.map((value) => (
          <Chip
            key={value}
            label={props.options.find((option) => option.value === value)?.label ?? value}
            onRemove={() => toggle(value)}
          />
        ))}
      </div>
    </fieldset>
  );
}

export type DateFieldProps = {
  readonly label: string;
  /** An ISO 8601 calendar date, `YYYY-MM-DD`. Passed to and from the caller untouched. */
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly help?: string;
  readonly error?: string;
  readonly required?: boolean;
  /** Supplied by the owning screen so an `ErrorSummary` entry can link here. */
  readonly id?: string;
};

/**
 * A native `<input type="date">`.
 *
 * The value in and out is ISO 8601 — PRD §41.1's "APIs use ISO format" half. The `3 Aug 2026` half
 * is display, and `formatLegalDate` renders it in the help line so the reader can confirm the value
 * unambiguously without the field having to reformat what it stores.
 */
export function DateField(props: DateFieldProps): ReactNode {
  return (
    <FieldShell
      label={props.label}
      {...(props.help === undefined ? {} : { help: props.help })}
      {...(props.error === undefined ? {} : { error: props.error })}
      {...(props.required === undefined ? {} : { required: props.required })}
      {...(props.id === undefined ? {} : { controlId: props.id })}
    >
      {({ controlId, describedBy, invalid }) => (
        <input
          className="tui-input"
          type="date"
          id={controlId}
          value={props.value}
          aria-describedby={describedBy}
          aria-invalid={invalid ? 'true' : undefined}
          onChange={(event) => props.onChange(event.target.value)}
        />
      )}
    </FieldShell>
  );
}

export type CheckboxProps = {
  readonly label: string;
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
  readonly help?: string;
  readonly error?: string;
};

export function Checkbox(props: CheckboxProps): ReactNode {
  const base = useId();
  const controlId = `${base}-control`;
  const helpId = `${base}-help`;
  const errorId = `${base}-error`;
  const described = [
    props.help === undefined ? undefined : helpId,
    props.error === undefined ? undefined : errorId,
  ].filter((value): value is string => value !== undefined);
  return (
    <div className="tui-field tui-field--checkbox">
      <input
        type="checkbox"
        id={controlId}
        checked={props.checked}
        aria-describedby={described.length === 0 ? undefined : described.join(' ')}
        aria-invalid={props.error === undefined ? undefined : 'true'}
        onChange={(event) => props.onChange(event.target.checked)}
      />
      <label className="tui-field__label" htmlFor={controlId}>
        {props.label}
      </label>
      {props.help === undefined ? null : (
        <p className="tui-field__help" id={helpId}>
          {props.help}
        </p>
      )}
      {props.error === undefined ? null : (
        <p className="tui-field__error" id={errorId}>
          {props.error}
        </p>
      )}
    </div>
  );
}

export type RadioGroupProps = {
  readonly label: string;
  readonly value: string;
  readonly options: readonly SelectOption[];
  readonly onChange: (value: string) => void;
  readonly help?: string;
  readonly error?: string;
};

/**
 * A native radio group in a `fieldset`/`legend`.
 *
 * Arrow-key navigation and the roving tab stop are the platform's, not ours — every browser
 * implements them for same-named radios, and a hand-rolled version is a way to get them wrong.
 */
export function RadioGroup(props: RadioGroupProps): ReactNode {
  const base = useId();
  const errorId = `${base}-error`;
  return (
    <fieldset
      className="tui-radiogroup"
      aria-describedby={props.error === undefined ? undefined : errorId}
      aria-invalid={props.error === undefined ? undefined : 'true'}
    >
      <legend className="tui-field__label">{props.label}</legend>
      {props.help === undefined ? null : <p className="tui-field__help">{props.help}</p>}
      {props.error === undefined ? null : (
        <p className="tui-field__error" id={errorId}>
          {props.error}
        </p>
      )}
      {props.options.map((option) => {
        const optionId = `${base}-${option.value}`;
        return (
          <div className="tui-radiogroup__option" key={option.value}>
            <input
              type="radio"
              id={optionId}
              name={base}
              value={option.value}
              checked={props.value === option.value}
              onChange={() => props.onChange(option.value)}
            />
            <label htmlFor={optionId}>{option.label}</label>
          </div>
        );
      })}
    </fieldset>
  );
}

export type ErrorSummaryEntry = {
  /** The `id` of the field this entry is about. The entry links to it in-page. */
  readonly fieldId: string;
  readonly message: string;
};

export type ErrorSummaryProps = {
  readonly title?: string;
  readonly entries: readonly ErrorSummaryEntry[];
};

/**
 * The error summary of PRD §41.1 ("error summaries").
 *
 * `role="alert"` and a focusable container, so a screen that moves focus here after a failed submit
 * both announces the failure and puts the reader at the top of the list. Each entry is an in-page
 * link to the offending field.
 *
 * Renders nothing when there are no errors — an empty alert region announced on every render is
 * noise (risk R4).
 */
export function ErrorSummary(props: ErrorSummaryProps): ReactNode {
  if (props.entries.length === 0) return null;
  return (
    <div className="tui-error-summary" role="alert" tabIndex={-1}>
      <h2 className="tui-error-summary__title">{props.title ?? 'There is a problem'}</h2>
      <ul>
        {props.entries.map((entry) => (
          <li key={entry.fieldId}>
            <a href={`#${entry.fieldId}`}>{entry.message}</a>
          </li>
        ))}
      </ul>
    </div>
  );
}
