/* RECHARTS, wrapped once: every chart takes its card's width, reads its
   colours from the theme's tokens (an SVG attribute takes `var()`), halves its
   ticks on a phone, and carries its numbers as a table for a screen reader. */
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine,
} from "recharts";
import { num } from "./ui.jsx";

export const COLORS = ["var(--c1)", "var(--c2)", "var(--c3)", "var(--c4)", "var(--c5)", "var(--c6)"];
const narrow = () => typeof window !== "undefined" && window.innerWidth < 640;

const axis = { stroke: "var(--ink-faint)", fontSize: 11, tickLine: false, axisLine: false };
const tip = {
  contentStyle: { background: "var(--surface)", border: "1px solid var(--line-firm)", borderRadius: 10, color: "var(--ink)", fontSize: 12 },
  labelStyle: { color: "var(--ink-soft)", marginBottom: 4 },
  cursor: { fill: "var(--glow)", stroke: "var(--line-firm)" },
};

/* A series over time: `kind` area, bar or line; `stack` stacks bars or
   areas; `refs` draws reference lines (a rank's floor). */
export function Trend({ data, x = "day", series, kind = "area", stack = false, height = 240, xFmt, yFmt = num, refs = [], caption }) {
  const Chart = kind === "bar" ? BarChart : kind === "line" ? LineChart : AreaChart;
  const many = series.length > 1;
  return (
    <figure className="chart">
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <Chart data={data} margin={{ top: 6, right: 8, left: -8, bottom: 0 }}>
            <CartesianGrid stroke="var(--line)" vertical={false} />
            <XAxis dataKey={x} {...axis} tickFormatter={xFmt} minTickGap={narrow() ? 28 : 14} />
            <YAxis {...axis} tickFormatter={yFmt} allowDecimals={false} width={44} />
            <Tooltip {...tip} labelFormatter={xFmt} formatter={(v, name) => [yFmt(v), name]} />
            {many && <Legend wrapperStyle={{ fontSize: 12, color: "var(--ink-soft)" }} iconType="circle" iconSize={8} />}
            {refs.map((r) => (
              <ReferenceLine key={r.x ?? r.y} x={r.x} y={r.y} stroke={r.color ?? "var(--line-firm)"} strokeDasharray="4 4"
                label={{ value: r.label, position: "insideTopLeft", fill: "var(--ink-faint)", fontSize: 10 }} />
            ))}
            {series.map((s, i) => {
              const color = s.color ?? COLORS[i % COLORS.length];
              const common = { dataKey: s.key, name: s.name, isAnimationActive: false };
              if (kind === "bar") return <Bar key={s.key} {...common} fill={color} stackId={stack ? "a" : undefined} radius={stack ? 0 : [4, 4, 0, 0]} maxBarSize={28} />;
              if (kind === "line") return <Line key={s.key} {...common} stroke={color} strokeWidth={2} dot={false} type="monotone" />;
              return <Area key={s.key} {...common} stroke={color} fill={color} fillOpacity={many && !stack ? 0.08 : 0.22} strokeWidth={2} type="monotone" stackId={stack ? "a" : undefined} />;
            })}
          </Chart>
        </ResponsiveContainer>
      </div>
      <details className="numbers">
        <summary>{caption ?? "Numbers"}</summary>
        <table className="tbl mini">
          <thead><tr><th>{x}</th>{series.map((s) => <th key={s.key} className="n">{s.name}</th>)}</tr></thead>
          <tbody>
            {data.map((d, i) => (
              <tr key={i}><td>{xFmt ? xFmt(d[x]) : d[x]}</td>{series.map((s) => <td key={s.key} className="n">{yFmt(d[s.key])}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}

// A histogram is a bar trend over bins.
export const Hist = ({ bins, name = "Trainers", color, height = 220, refs }) => (
  <Trend data={bins} x="label" kind="bar" series={[{ key: "n", name, color }]} height={height} refs={refs} />
);
