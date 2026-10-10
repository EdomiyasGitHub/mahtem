/** Where a step comes from: a course section, or an extension beyond the practical. */
export function Provenance({ source }: { source: string }) {
  const extension = /extension/i.test(source);
  return <span className={extension ? 'provenance provenance--extension' : 'provenance'}>{extension ? 'Extension' : source}</span>;
}
