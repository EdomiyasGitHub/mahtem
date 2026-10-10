import type { DocumentVerification } from '../../verify/index.ts';

export function VerdictBanner({ result, pending }: { result: DocumentVerification | null; pending: boolean }) {
  if (!result) {
    return (
      <div className="verdict-banner verdict-banner--pending" role="status">
        Checking…
      </div>
    );
  }
  const signer = result.path[0];
  const signerName = signer?.subject.find((a) => a.type === 'O')?.value ?? signer?.subject.find((a) => a.type === 'CN')?.value ?? 'the signer';
  const ok = result.verdict === 'verified';
  return (
    <div className={`verdict-banner verdict-banner--${ok ? 'pass' : 'fail'}${pending ? ' verdict-banner--stale' : ''}`} role="status" aria-live="polite">
      <svg className="verdict-banner__icon" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="10" />
        {ok ? <path d="m7.5 12.5 3 3 6-6.5" /> : <path d="m8.5 8.5 7 7M15.5 8.5l-7 7" />}
      </svg>
      <div>
        <p className="verdict-banner__title">{ok ? 'Verified' : `Verification failed at check ${result.firstFailure?.n ?? '?'}`}</p>
        <p className="verdict-banner__text">
          {ok
            ? `Signed by ${signerName}, unchanged since signing. The chain ends at a root you trust.`
            : result.firstFailure?.summary}
        </p>
      </div>
    </div>
  );
}
