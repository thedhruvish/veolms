export function ProgressBar({
  value,
  completed = false,
}: {
  value: number;
  completed?: boolean;
}) {
  return (
    <span
      className={`learning-progress-track ${completed ? "is-complete" : ""}`}
      aria-hidden="true"
    >
      <span style={{ width: `${value}%` }} />
    </span>
  );
}
