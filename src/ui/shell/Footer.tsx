import { REPOSITORY_URL, VERSION } from '../../version.ts';

/** Links to the project's public home. Plain navigation: the CSP allows following links, not fetching. */
export function Footer() {
  const external = { target: '_blank', rel: 'noopener noreferrer' } as const;
  return (
    <footer className="site-footer">
      <p className="site-footer__line">
        <span>Mahtem {VERSION}</span>
        <span>Built for CS486 Computer System Security at HiLCoE. All authorities and people in the lab are simulated.</span>
      </p>
      <p className="site-footer__line">
        <a href={REPOSITORY_URL} {...external}>Source code</a>
        <a href={`${REPOSITORY_URL}/blob/main/LICENSE`} {...external}>Apache 2.0 licence</a>
        <a href={`${REPOSITORY_URL}/issues/new/choose`} {...external}>Report a problem or suggest a lesson</a>
      </p>
    </footer>
  );
}
