export type View = 'learn' | 'bench' | 'chain' | 'attacks' | 'verify' | 'exercises';

export function Header(props: {
  view: View;
  onNavigate: (v: View) => void;
  canReset: boolean;
  onReset: () => void;
  projector: boolean;
  onProjector: (on: boolean) => void;
}) {
  const { view, onNavigate, canReset, onReset, projector, onProjector } = props;
  const tab = (v: View, label: string) => (
    <button type="button" className="nav__tab" aria-current={view === v ? 'page' : undefined} onClick={() => onNavigate(v)}>
      {label}
    </button>
  );
  return (
    <header className="masthead">
      <a className="masthead__skip visually-hidden-until-focus" href="#main">
        Skip to content
      </a>
      <div className="masthead__brand">
        <span className="masthead__name">Mahtem</span>
        <span className="masthead__ethiopic" lang="am">ማኅተም</span>
        <span className="masthead__role">PKI laboratory</span>
      </div>
      <nav className="nav" aria-label="Sections">
        {tab('learn', 'Learn')}
        {tab('bench', 'Lab bench')}
        {tab('chain', 'Trust chain')}
        {tab('attacks', 'Attack bench')}
        {tab('verify', 'Verifier desk')}
        {tab('exercises', 'Exercises')}
      </nav>
      <div className="masthead__end">
        <p className="masthead__custody">Keys stay in this tab and are never sent anywhere.</p>
        <button type="button" className="button button--quiet projector-toggle" aria-pressed={projector} onClick={() => onProjector(!projector)}
          title="Enlarge everything for a projector">
          Projector
        </button>
        <button type="button" className="button button--quiet" disabled={!canReset}
          onClick={() => {
            if (window.confirm('Reset the lab? All keys, certificates and the diploma are discarded.')) onReset();
          }}>
          Reset lab
        </button>
      </div>
    </header>
  );
}
