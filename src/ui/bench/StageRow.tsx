import type { ReactNode } from 'react';
import { Provenance } from '../common/Provenance.tsx';

export type StageStatus = 'done' | 'current' | 'locked';

const STATUS_TEXT: Record<StageStatus, string> = { done: 'Done', current: 'Next', locked: 'Waiting' };

export function StageRow(props: {
  n: number;
  title: string;
  provenance: string;
  status: StageStatus;
  /** One line describing the step, shown in every state. */
  intro: string;
  children?: ReactNode;
}) {
  const { n, title, provenance, status, intro, children } = props;
  return (
    <li className={`stage stage--${status}`} aria-current={status === 'current' ? 'step' : undefined}>
      <span className="stage__n" aria-hidden="true">
        {String(n).padStart(2, '0')}
      </span>
      <div className="stage__main">
        <div className="stage__head">
          <h2 className="stage__title">{title}</h2>
          <Provenance source={provenance} />
          <span className="stage__status">{STATUS_TEXT[status]}</span>
        </div>
        <p className="stage__intro">{intro}</p>
        {status !== 'locked' && children}
      </div>
    </li>
  );
}
