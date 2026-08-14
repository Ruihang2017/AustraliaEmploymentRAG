import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
// The NAMED export, not the default: under `moduleResolution: "nodenext"` this package's types
// resolve as CJS and the default binding is the module namespace object, not the API.
import { userEvent } from '@testing-library/user-event';
import { useState } from 'react';
import type { ReactNode } from 'react';

import {
  Badge,
  Button,
  Chip,
  EmptyState,
  Link,
  LiveRegion,
  PageHeading,
  SkipLink,
} from '../src/primitives/basic.js';
import {
  Checkbox,
  DateField,
  ErrorSummary,
  MultiSelect,
  RadioGroup,
  Select,
  TextArea,
  TextField,
} from '../src/primitives/fields.js';
import { Dialog, Disclosure, Tooltip } from '../src/primitives/overlay.js';
import { Table, Tabs, Toolbar } from '../src/primitives/structure.js';
import { CopyableId } from '../src/primitives/CopyableId.js';

describe('Button', () => {
  it('is a native button with the label as its accessible name', () => {
    render(<Button label="Run search" onClick={() => undefined} />);
    const button = screen.getByRole('button', { name: 'Run search' });
    expect(button.tagName).toBe('BUTTON');
    expect(button.getAttribute('type')).toBe('button');
  });

  it.each(['{Enter}', ' '])('activates on %s from the keyboard', async (keys) => {
    const onClick = vi.fn();
    render(<Button label="Run search" onClick={onClick} />);
    await userEvent.tab();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Run search' }));
    await userEvent.keyboard(keys);
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe('Link', () => {
  it('renders an https link with rel="noopener noreferrer"', () => {
    render(<Link href="https://example.gov.au/act" label="The Act" />);
    const link = screen.getByRole('link', { name: 'The Act' });
    expect(link.getAttribute('href')).toBe('https://example.gov.au/act');
    expect(link.getAttribute('rel')).toContain('noopener');
    expect(link.getAttribute('rel')).toContain('noreferrer');
  });

  it('names "opens in a new tab" in the accessible name rather than only visually', () => {
    render(<Link href="https://example.gov.au/act" label="The Act" newTab />);
    const link = screen.getByRole('link', { name: /opens in a new tab/i });
    expect(link.getAttribute('target')).toBe('_blank');
  });

  it.each([
    'javascript:alert(1)',
    'data:text/html;base64,PHN2Zz4=',
    'vbscript:msgbox(1)',
    'file:///etc/passwd',
    'http://example.gov.au/act',
    '//example.gov.au/act',
    'not a url',
  ])('refuses to make %s a link, and still shows the raw value', (href) => {
    const { container } = render(<Link href={href} label="Source" />);
    expect(container.querySelector('a')).toBeNull();
    expect(container.textContent).toContain(href);
    expect(container.textContent).toContain('Source');
  });

  it('allows mailto:', () => {
    render(<Link href="mailto:records@example.gov.au" label="Email the registry" />);
    expect(screen.getByRole('link', { name: 'Email the registry' })).toBeTruthy();
  });
});

describe('Badge', () => {
  it('renders text and a non-colour shape, and the shape is not optional', () => {
    const { container } = render(<Badge label="In force" shape="circle" />);
    expect(screen.getByText('In force')).toBeTruthy();
    expect(container.querySelector('svg')).not.toBeNull();
    expect(container.querySelector('[data-shape="circle"]')).not.toBeNull();
  });

  it('hides the shape from assistive technology — it duplicates the label, it does not add to it', () => {
    const { container } = render(<Badge label="Repealed" shape="triangle" />);
    expect(container.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });
});

describe('Chip', () => {
  it('is inert text with no button when it is not removable', () => {
    const { container } = render(<Chip label="Victoria" />);
    expect(container.querySelector('button')).toBeNull();
  });

  it('exposes a named remove button when it is removable', async () => {
    const onRemove = vi.fn();
    render(<Chip label="Victoria" onRemove={onRemove} />);
    await userEvent.click(screen.getByRole('button', { name: 'Remove Victoria' }));
    expect(onRemove).toHaveBeenCalledTimes(1);
  });
});

describe('PageHeading and SkipLink', () => {
  it('renders exactly one level-1 heading', () => {
    const { container } = render(<PageHeading text="Search" subtitle="Find a source" />);
    expect(container.querySelectorAll('h1')).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1, name: 'Search' })).toBeTruthy();
  });

  it('points the skip link at the main landmark id', () => {
    render(<SkipLink targetId="main" />);
    expect(screen.getByRole('link', { name: 'Skip to main content' }).getAttribute('href')).toBe(
      '#main',
    );
  });
});

describe('EmptyState', () => {
  it('explains the emptiness and can offer a next action', async () => {
    const onAction = vi.fn();
    render(
      <EmptyState
        title="No sources matched"
        explanation="Broaden the jurisdiction filter or remove the date limit."
        action={{ label: 'Clear filters', onAction }}
      />,
    );
    expect(screen.getByText(/Broaden the jurisdiction filter/)).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(onAction).toHaveBeenCalledTimes(1);
  });
});

describe('LiveRegion', () => {
  it.each([
    ['polite', 'status'],
    ['assertive', 'alert'],
  ] as const)('exposes aria-live=%s with role=%s', (politeness, role) => {
    render(<LiveRegion message="Job queued" politeness={politeness} />);
    const region = screen.getByRole(role);
    expect(region.getAttribute('aria-live')).toBe(politeness);
    expect(region.textContent).toBe('Job queued');
  });

  it('renders the container even with nothing to say, so a later message is announced', () => {
    const { container } = render(<LiveRegion message="" />);
    expect(container.querySelector('[aria-live="polite"]')).not.toBeNull();
  });
});

describe('form fields', () => {
  it('labels a TextField with a real <label for>', async () => {
    const onChange = vi.fn();
    render(<TextField label="Question" value="" onChange={onChange} />);
    const field = screen.getByLabelText('Question');
    expect(field.tagName).toBe('INPUT');
    await userEvent.type(field, 'a');
    expect(onChange).toHaveBeenCalledWith('a');
  });

  it('wires help and error text with aria-describedby and aria-invalid', () => {
    render(
      <TextField
        label="Question"
        value=""
        onChange={() => undefined}
        help="Plain English is fine."
        error="Enter a question."
      />,
    );
    const field = screen.getByLabelText('Question');
    expect(field.getAttribute('aria-invalid')).toBe('true');
    const describedBy = field.getAttribute('aria-describedby') ?? '';
    const described = describedBy.split(' ').map((id) => document.getElementById(id)?.textContent);
    expect(described).toContain('Plain English is fine.');
    expect(described).toContain('Enter a question.');
  });

  it('labels a TextArea', () => {
    render(<TextArea label="Facts" value="" onChange={() => undefined} />);
    expect(screen.getByLabelText('Facts').tagName).toBe('TEXTAREA');
  });

  it('labels a DateField and round-trips ISO 8601 untouched', async () => {
    const onChange = vi.fn();
    render(<DateField label="Legal as at" value="2026-08-03" onChange={onChange} />);
    const field = screen.getByLabelText('Legal as at');
    expect(field.getAttribute('type')).toBe('date');
    expect((field as HTMLInputElement).value).toBe('2026-08-03');
  });

  it('labels a Select and reports the chosen value', async () => {
    const onChange = vi.fn();
    render(
      <Select
        label="Jurisdiction"
        value="AU-VIC"
        options={[
          { value: 'AU-VIC', label: 'Victoria' },
          { value: 'AU-NSW', label: 'New South Wales' },
        ]}
        onChange={onChange}
      />,
    );
    await userEvent.selectOptions(screen.getByLabelText('Jurisdiction'), 'AU-NSW');
    expect(onChange).toHaveBeenCalledWith('AU-NSW');
  });

  it('labels a Checkbox and toggles it', async () => {
    const onChange = vi.fn();
    render(<Checkbox label="Save to a record" checked={false} onChange={onChange} />);
    await userEvent.click(screen.getByLabelText('Save to a record'));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('groups a MultiSelect in a named fieldset and toggles members', async () => {
    const onChange = vi.fn();
    render(
      <MultiSelect
        label="Jurisdictions"
        values={['AU-VIC']}
        options={[
          { value: 'AU-VIC', label: 'Victoria' },
          { value: 'AU-NSW', label: 'New South Wales' },
        ]}
        onChange={onChange}
      />,
    );
    const group = screen.getByRole('group', { name: 'Jurisdictions' });
    await userEvent.click(within(group).getByLabelText('New South Wales'));
    expect(onChange).toHaveBeenCalledWith(['AU-VIC', 'AU-NSW']);
    await userEvent.click(within(group).getByRole('button', { name: 'Remove Victoria' }));
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it('navigates a RadioGroup with arrow keys, as the platform provides', async () => {
    function Harness(): ReactNode {
      const [value, setValue] = useState('SAVE');
      return (
        <RadioGroup
          label="Retention"
          value={value}
          options={[
            { value: 'SAVE', label: 'Save to a record' },
            { value: 'EPHEMERAL', label: 'Do not retain' },
          ]}
          onChange={setValue}
        />
      );
    }
    render(<Harness />);
    const group = screen.getByRole('group', { name: 'Retention' });
    const first = within(group).getByLabelText('Save to a record');
    first.focus();
    await userEvent.keyboard('{ArrowDown}');
    expect((within(group).getByLabelText('Do not retain') as HTMLInputElement).checked).toBe(true);
  });
});

describe('ErrorSummary', () => {
  it('exposes role="alert", is focusable, and links each entry to its field', async () => {
    render(
      <>
        <ErrorSummary
          entries={[{ fieldId: 'question', message: 'Enter a question.' }]}
        />
        <input id="question" aria-label="Question" />
      </>,
    );
    const summary = screen.getByRole('alert');
    expect(summary.getAttribute('tabindex')).toBe('-1');
    const entry = within(summary).getByRole('link', { name: 'Enter a question.' });
    expect(entry.getAttribute('href')).toBe('#question');
  });

  it('renders nothing at all when there are no errors', () => {
    const { container } = render(<ErrorSummary entries={[]} />);
    expect(container.innerHTML).toBe('');
  });
});

describe('Dialog', () => {
  function DialogHarness(): ReactNode {
    const [open, setOpen] = useState(false);
    return (
      <>
        <Button label="Open dialog" onClick={() => setOpen(true)} />
        <Dialog open={open} title="Confirm" onClose={() => setOpen(false)}>
          <Button label="Inner action" onClick={() => undefined} />
        </Dialog>
      </>
    );
  }

  it('moves focus in on open, traps Tab, closes on Escape and restores focus to the invoker', async () => {
    render(<DialogHarness />);
    const invoker = screen.getByRole('button', { name: 'Open dialog' });
    invoker.focus();
    await userEvent.click(invoker);

    const dialog = screen.getByRole('dialog', { name: 'Confirm' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    const cancel = within(dialog).getByRole('button', { name: 'Cancel' });
    const inner = within(dialog).getByRole('button', { name: 'Inner action' });
    // Focus lands on the first focusable element in DOM order, which is the dialog's own body.
    expect(document.activeElement).toBe(inner);

    await userEvent.tab();
    expect(document.activeElement).toBe(cancel);
    // Trapped: Tab past the last control wraps to the first rather than escaping to the page.
    await userEvent.tab();
    expect(document.activeElement).toBe(inner);
    await userEvent.tab({ shift: true });
    expect(document.activeElement).toBe(cancel);

    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(invoker);
  });
});

describe('Disclosure', () => {
  it('wires aria-expanded and aria-controls and toggles the region', async () => {
    render(
      <Disclosure summary="Licence limitations">
        <p>Reproduced under a source licence.</p>
      </Disclosure>,
    );
    const trigger = screen.getByRole('button', { name: 'Licence limitations' });
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    const regionId = trigger.getAttribute('aria-controls') ?? '';
    expect(document.getElementById(regionId)?.hasAttribute('hidden')).toBe(true);
    await userEvent.click(trigger);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(document.getElementById(regionId)?.hasAttribute('hidden')).toBe(false);
  });
});

describe('Tooltip', () => {
  it('describes its trigger, opens on focus and dismisses on Escape without losing focus', async () => {
    render(<Tooltip label="Freshness" text="How recently the source was verified." />);
    const trigger = screen.getByRole('button', { name: 'Freshness' });
    const textId = trigger.getAttribute('aria-describedby') ?? '';
    expect(document.getElementById(textId)?.textContent).toBe(
      'How recently the source was verified.',
    );
    await userEvent.tab();
    expect(document.activeElement).toBe(trigger);
    expect(document.getElementById(textId)?.getAttribute('data-open')).toBe('true');
    await userEvent.keyboard('{Escape}');
    expect(document.getElementById(textId)?.getAttribute('data-open')).toBe('false');
    expect(document.activeElement).toBe(trigger);
  });
});

describe('Tabs', () => {
  function TabsHarness(): ReactNode {
    const [selected, setSelected] = useState('a');
    return (
      <Tabs
        label="Detail"
        selectedId={selected}
        onSelect={setSelected}
        tabs={[
          { id: 'a', label: 'Timeline', content: <p>Timeline body</p> },
          { id: 'b', label: 'Limitations', content: <p>Limitations body</p> },
        ]}
      />
    );
  }

  it('exposes tablist/tab/tabpanel and moves focus with arrow keys (manual activation)', async () => {
    render(<TabsHarness />);
    const list = screen.getByRole('tablist', { name: 'Detail' });
    const first = within(list).getByRole('tab', { name: 'Timeline' });
    const second = within(list).getByRole('tab', { name: 'Limitations' });
    expect(first.getAttribute('aria-selected')).toBe('true');
    expect(second.getAttribute('tabindex')).toBe('-1');

    first.focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(document.activeElement).toBe(second);
    // Manual activation: arrowing moved focus but must NOT have swapped the panel.
    expect(screen.getByRole('tabpanel').textContent).toBe('Timeline body');

    await userEvent.keyboard('{Enter}');
    expect(screen.getByRole('tabpanel').textContent).toBe('Limitations body');
  });
});

describe('Table', () => {
  it('renders a caption and scoped column headers', () => {
    render(
      <Table
        caption="Versions"
        columns={[
          { key: 'label', header: 'Version', cell: (row: { label: string }) => row.label },
        ]}
        rows={[{ label: 'v1' }]}
        rowKey={(row) => row.label}
      />,
    );
    const table = screen.getByRole('table', { name: 'Versions' });
    expect(within(table).getByRole('columnheader', { name: 'Version' }).getAttribute('scope')).toBe(
      'col',
    );
  });

  it('says something rather than showing an empty body', () => {
    render(
      <Table
        caption="Versions"
        columns={[{ key: 'label', header: 'Version', cell: () => null }]}
        rows={[]}
        rowKey={() => 'x'}
        emptyMessage="No versions recorded."
      />,
    );
    expect(screen.getByText('No versions recorded.')).toBeTruthy();
  });
});

describe('Toolbar', () => {
  it('is a named group whose controls all remain tabbable', async () => {
    render(
      <Toolbar label="Result actions">
        <Button label="Save" onClick={() => undefined} />
        <Button label="Export" onClick={() => undefined} />
      </Toolbar>,
    );
    const toolbar = screen.getByRole('toolbar', { name: 'Result actions' });
    await userEvent.tab();
    expect(document.activeElement).toBe(within(toolbar).getByRole('button', { name: 'Save' }));
    await userEvent.tab();
    expect(document.activeElement).toBe(within(toolbar).getByRole('button', { name: 'Export' }));
  });
});

describe('CopyableId', () => {
  const ID = 'req_0192f8c1-6a3f-7c21-9c8e-0aa1b2c3d4e5';

  it('always shows the id as selectable text, so it is copyable without the Clipboard API', () => {
    render(<CopyableId label="Request ID" value={ID} />);
    expect(screen.getByText(ID)).toBeTruthy();
  });

  it('writes the exact id to the clipboard and announces success', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    try {
      render(<CopyableId label="Request ID" value={ID} />);
      await userEvent.click(screen.getByRole('button', { name: 'Copy Request ID' }));
      expect(writeText).toHaveBeenCalledWith(ID);
      expect(await screen.findByText('Request ID copied.')).toBeTruthy();
    } finally {
      Reflect.deleteProperty(navigator, 'clipboard');
    }
  });

  it('announces the failure rather than throwing when writeText rejects', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
    });
    try {
      render(<CopyableId label="Request ID" value={ID} />);
      await userEvent.click(screen.getByRole('button', { name: 'Copy Request ID' }));
      expect(await screen.findByText(/could not be copied/)).toBeTruthy();
    } finally {
      Reflect.deleteProperty(navigator, 'clipboard');
    }
  });

  it('does not throw when the Clipboard API is absent, and still shows the id', async () => {
    Reflect.deleteProperty(navigator, 'clipboard');
    render(<CopyableId label="Job ID" value={ID} />);
    await userEvent.click(screen.getByRole('button', { name: 'Copy Job ID' }));
    expect(await screen.findByText(/Copying is not available here/)).toBeTruthy();
    expect(screen.getByText(ID)).toBeTruthy();
  });
});
