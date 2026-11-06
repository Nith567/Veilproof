import type { Check } from "../lib/proof";

export function CheckList({ checks }: { checks: Check[] }) {
  return (
    <ul className="checks">
      {checks.map((check) => (
        <li
          key={check.id}
          className={check.ok ? "check check-ok" : "check check-bad"}
        >
          <span className="check-mark" aria-hidden="true">
            {check.ok ? "✓" : "×"}
          </span>
          <span className="check-text">
            <strong>{check.label}</strong>
            <span>{check.detail}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
