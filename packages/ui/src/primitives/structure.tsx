/**
 * The structural primitives (ticket Deliverable 6): `Tabs`, `Table`, `Toolbar`.
 */
import { useId, useRef } from 'react';
import type { ReactNode } from 'react';

export type TabDescriptor = {
  readonly id: string;
  readonly label: string;
  readonly content: ReactNode;
};

export type TabsProps = {
  /** The accessible name of the tab list. */
  readonly label: string;
  readonly tabs: readonly [TabDescriptor, ...TabDescriptor[]];
  /** Controlled by the owning screen; this package holds no selection state (risk R7). */
  readonly selectedId: string;
  readonly onSelect: (id: string) => void;
};

/**
 * `tablist`/`tab`/`tabpanel` with a roving tab stop and arrow-key navigation.
 *
 * Manual activation (arrow moves focus, `Enter`/`Space` selects) rather than automatic: with
 * automatic activation, arrowing through a tab list swaps the panel under a screen-reader user on
 * every keypress.
 *
 * `tabs` is a NON-EMPTY tuple: a tab list with no tabs is not representable.
 */
export function Tabs(props: TabsProps): ReactNode {
  const base = useId();
  const listRef = useRef<HTMLDivElement | null>(null);
  const selectedIndex = Math.max(
    0,
    props.tabs.findIndex((tab) => tab.id === props.selectedId),
  );
  const selected = props.tabs[selectedIndex] ?? props.tabs[0];

  const focusTab = (index: number): void => {
    const wrapped = (index + props.tabs.length) % props.tabs.length;
    const target = props.tabs[wrapped];
    if (target === undefined) return;
    listRef.current?.querySelector<HTMLElement>(`#${CSS.escape(`${base}-tab-${target.id}`)}`)?.focus();
  };

  return (
    <div className="tui-tabs">
      <div className="tui-tabs__list" role="tablist" aria-label={props.label} ref={listRef}>
        {props.tabs.map((tab, index) => {
          const isSelected = tab.id === selected.id;
          return (
            <button
              key={tab.id}
              type="button"
              id={`${base}-tab-${tab.id}`}
              className="tui-tabs__tab"
              role="tab"
              aria-selected={isSelected}
              aria-controls={`${base}-panel-${tab.id}`}
              tabIndex={isSelected ? 0 : -1}
              onClick={() => props.onSelect(tab.id)}
              onKeyDown={(event) => {
                if (event.key === 'ArrowRight') {
                  event.preventDefault();
                  focusTab(index + 1);
                } else if (event.key === 'ArrowLeft') {
                  event.preventDefault();
                  focusTab(index - 1);
                } else if (event.key === 'Home') {
                  event.preventDefault();
                  focusTab(0);
                } else if (event.key === 'End') {
                  event.preventDefault();
                  focusTab(props.tabs.length - 1);
                }
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      <div
        className="tui-tabs__panel"
        id={`${base}-panel-${selected.id}`}
        role="tabpanel"
        aria-labelledby={`${base}-tab-${selected.id}`}
        tabIndex={0}
      >
        {selected.content}
      </div>
    </div>
  );
}

export type TableColumn<Row> = {
  readonly key: string;
  readonly header: string;
  readonly cell: (row: Row) => ReactNode;
};

export type TableProps<Row> = {
  /** Rendered as a real `<caption>`: a table's accessible name, not a heading above it. */
  readonly caption: string;
  readonly columns: readonly [TableColumn<Row>, ...TableColumn<Row>[]];
  readonly rows: readonly Row[];
  readonly rowKey: (row: Row) => string;
  /** Shown in place of an empty body — never a table with a caption and nothing under it. */
  readonly emptyMessage?: string;
};

/** A native `<table>` with a caption and `scope="col"` headers. */
export function Table<Row>(props: TableProps<Row>): ReactNode {
  return (
    <div className="tui-table__scroller">
      <table className="tui-table">
        <caption className="tui-table__caption">{props.caption}</caption>
        <thead>
          <tr>
            {props.columns.map((column) => (
              <th key={column.key} scope="col">
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {props.rows.length === 0 ? (
            <tr>
              <td colSpan={props.columns.length}>
                {props.emptyMessage ?? 'No rows to show.'}
              </td>
            </tr>
          ) : (
            props.rows.map((row) => (
              <tr key={props.rowKey(row)}>
                {props.columns.map((column) => (
                  <td key={column.key}>{column.cell(row)}</td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

export type ToolbarProps = {
  /** The accessible name of the group. Required — an unnamed toolbar is a div. */
  readonly label: string;
  readonly children: ReactNode;
};

/**
 * A named group of controls.
 *
 * `role="toolbar"` with NO roving tabindex: the controls inside are ordinary buttons and links that
 * a keyboard user tabs through, which is what the surrounding screens need. A roving tab stop is
 * correct only for a toolbar of homogeneous controls, and imposing one here would remove tab access
 * to every control but the first.
 */
export function Toolbar(props: ToolbarProps): ReactNode {
  return (
    <div className="tui-toolbar" role="toolbar" aria-label={props.label}>
      {props.children}
    </div>
  );
}
