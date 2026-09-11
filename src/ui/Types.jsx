/* A row of type badges.

   A type is the one piece of information in this game that always means the
   same thing, so it should always look the same: a coloured chip, never prose.
   It was printed as plain text in three places and as a badge in two, which
   made the map tag and the travel list read as captions rather than as data. */

export default function Types({ of = [], className = "" }) {
  if (!of.length) return null;
  return (
    <span className={`types ${className}`.trim()}>
      {of.map((t) => (
        <span key={t} className={`type t-${t}`}>{t.toUpperCase()}</span>
      ))}
    </span>
  );
}
