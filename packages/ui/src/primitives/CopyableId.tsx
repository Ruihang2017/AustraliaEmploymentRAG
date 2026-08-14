/**
 * `CopyableId` (ticket Deliverable 6; PRD §41.1 "request/job/correction IDs are copyable from errors
 * and support panels").
 */
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

import { LiveRegion } from './basic.js';

export type CopyableIdProps = {
  /** What kind of id this is — "Request ID", "Job ID". Becomes the visible label. */
  readonly label: string;
  readonly value: string;
};

/**
 * The id is ALWAYS present as selectable text, so it is copyable by selection even with JavaScript
 * broken, the Clipboard API absent, or the page served over an insecure context. The copy button is
 * an accelerator on top of that, never the only path.
 *
 * `navigator.clipboard.writeText` returns a promise that can reject (denied permission, insecure
 * context, jsdom). Both outcomes are reported through a live region, and neither throws. A promise
 * that settles after unmount must not call `setState`, so every settle path is guarded by a mounted
 * ref (risk R8).
 */
export function CopyableId(props: CopyableIdProps): ReactNode {
  const [message, setMessage] = useState('');
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const announce = (text: string): void => {
    if (mounted.current) setMessage(text);
  };

  const copy = (): void => {
    const clipboard: { writeText?: (text: string) => Promise<void> } | undefined =
      navigator.clipboard;
    if (clipboard?.writeText === undefined) {
      announce(`Copying is not available here. Select the ${props.label} text to copy it.`);
      return;
    }
    clipboard.writeText(props.value).then(
      () => announce(`${props.label} copied.`),
      () => announce(`${props.label} could not be copied. Select the text to copy it.`),
    );
  };

  return (
    <span className="tui-copyable-id">
      <span className="tui-copyable-id__label">{props.label}: </span>
      <code className="tui-copyable-id__value">{props.value}</code>
      <button
        type="button"
        className="tui-copyable-id__button"
        onClick={copy}
      >{`Copy ${props.label}`}</button>
      <LiveRegion message={message} politeness="polite" />
    </span>
  );
}
