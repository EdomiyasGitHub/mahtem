import { useMemo, useState } from 'react';
import { LabProvider, useLab } from './state/LabProvider.tsx';
import { BenchView } from './ui/bench/BenchView.tsx';
import { ChainView } from './ui/chain/ChainView.tsx';
import { AttackBench, type AttackMemory } from './ui/attacks/AttackBench.tsx';
import type { AttackRun } from './state/attacks.ts';
import { Header, type View } from './ui/shell/Header.tsx';
import { VerifyView } from './ui/verify/VerifyView.tsx';
import type { Anchor, ReceivedBundle } from './ui/verify/types.ts';
import './ui/shell/shell.css';
import './ui/common/common.css';
import './ui/bench/bench.css';
import './ui/verify/verify.css';
import './ui/chain/chain.css';
import './ui/attacks/attacks.css';

function Lab() {
  const { state, reset } = useLab();
  const [view, setView] = useState<View>('bench');
  // An attack opened on the desk replaces the lab diploma there until the bench hands over a new one.
  const [attackOnDesk, setAttackOnDesk] = useState<{ id: number; run: AttackRun } | null>(null);
  const [attackMemory, setAttackMemory] = useState<AttackMemory>({ runs: {}, selected: null });

  // The hand-off to the verifier: certificates and bytes only, never a key pair.
  const handoff = useMemo((): { received: ReceivedBundle; anchors: Anchor[] } | null => {
    const { signed, university, ministry, root } = state;
    if (!signed || !university?.certificate || !ministry?.certificate || !root) return null;
    return {
      received: {
        original: signed.document,
        signature: signed.signature,
        signer: university.certificate,
        intermediates: [ministry.certificate],
        label: 'Received from Abay Valley University (lab bench)',
        signedDigest: signed.digest,
      },
      anchors: [{ certificate: root.certificate, trusted: true }],
    };
  }, [state]);

  const hasProgress = state.root !== null;

  return (
    <div className="shell">
      <Header view={view} onNavigate={setView} canReset={hasProgress && state.busy === null}
        onReset={() => { reset(); setAttackOnDesk(null); setAttackMemory({ runs: {}, selected: null }); setView('bench'); }} />
      <main className="shell__main" id="main">
        {view === 'bench' ? (
          <BenchView onOpenVerifier={() => { setAttackOnDesk(null); setView('verify'); }} />
        ) : view === 'chain' ? (
          <ChainView onOpenBench={() => setView('bench')} />
        ) : view === 'attacks' ? (
          <AttackBench onOpenBench={() => setView('bench')} memory={attackMemory} onMemory={setAttackMemory}
            onOpenDesk={(run) => { setAttackOnDesk({ id: Date.now(), run }); setView('verify'); }} />
        ) : attackOnDesk ? (
          <VerifyView key={`attack-${attackOnDesk.id}`} initial={{
            received: {
              original: attackOnDesk.run.built.bundle.document,
              signature: attackOnDesk.run.built.bundle.signature,
              signer: attackOnDesk.run.built.bundle.signer,
              intermediates: attackOnDesk.run.built.bundle.intermediates,
              label: `Scenario ${attackOnDesk.run.scenario.n}: ${attackOnDesk.run.scenario.title} (attack bench)`,
            },
            anchors: attackOnDesk.run.built.trustStore.anchors.map((c) => ({ certificate: c, trusted: true })),
          }} />
        ) : (
          <VerifyView key={handoff ? handoff.received.signature.join(',').slice(0, 64) : 'none'} initial={handoff} />
        )}
      </main>
    </div>
  );
}

export function App() {
  return (
    <LabProvider>
      <Lab />
    </LabProvider>
  );
}
