import { sensitivity as formatter } from "@/lib/format";

export function ResultCard({
  label, symbol, description, value, loading, failed,
}: {
  label: string;
  symbol: string;
  description: string;
  value?: number;
  loading: boolean;
  failed: boolean;
}) {
  return (
    <div className="greek-result">
      <div className="greek-heading"><h4>{label}</h4><span aria-hidden="true">{symbol}</span></div>
      <p className="greek-value" title={value?.toString()}>
        {loading ? <span className="skeleton" aria-label="Calculating" /> : value === undefined ? "—" : formatter.format(value)}
      </p>
      <p className="greek-description">{description}</p>
      {failed && <span className="result-unavailable">Unavailable</span>}
    </div>
  );
}
