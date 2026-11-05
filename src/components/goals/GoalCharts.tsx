import { cloneElement, type ReactElement } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { fmt } from "@/lib/goals";
import type { GoalChartData, WeeklyDonut } from "@/lib/goalCharts";

/* Plain colours, not CSS variables: the same charts are captured into the image and the PDF.
   The series colours are brand colours checked for colour-blind separation on the card surface. */
const SURFACE = "#fffdf7";
const INK = "#241b33";
const SOFT = "#6e6580";
const GRID = "#efe7d3";
const SERIES = "#8f6307";
const SLICES = ["#8f6307", "#4f8cff", "#6d28d9", "#be185d", "#f26b1d"];
/** "Still to go" and other not-yet parts stay quiet, so the done parts are what you see. */
const REMAINING = "#d6cce8";

const AXIS = { fontSize: 11, fill: SOFT };
/* The line stands taller so it fills the same row as the round chart and its legend. */
const HEIGHT = { bar: 200, line: 280, round: 180 };

function Frame({
  width,
  height,
  children,
}: {
  width?: number | undefined;
  height: number;
  children: ReactElement;
}) {
  // The download has a fixed width and must be drawn at once; the page follows its column.
  if (width) return cloneElement(children, { width, height } as object);
  return (
    <ResponsiveContainer width="100%" height={height}>
      {children}
    </ResponsiveContainer>
  );
}

function withUnit(value: number | string, unit: string): string {
  if (!unit) return String(value);
  return unit === "%" ? `${value}%` : `${value} ${unit}`;
}

function ChartTip({
  active,
  payload,
  label,
  unit,
  prefix,
}: {
  active?: boolean;
  payload?: { value?: number | null }[];
  label?: string;
  unit: string;
  prefix: string;
}) {
  const value = payload?.[0]?.value;
  if (!active || value === null || value === undefined) return null;
  return (
    <div className="rounded-lg border border-line bg-ivory px-2.5 py-1.5 text-[12px] shadow-sm">
      <p className="text-soft">{label === "Start" ? "Where you started" : `${prefix} ${label}`}</p>
      <p className="font-bold text-ink">{withUnit(fmt(value), unit)}</p>
    </div>
  );
}

/** A number on the last point only: the rest are on the axis and in the tooltip. */
function lastPointLabel(lastIndex: number) {
  return function LastPointLabel(props: {
    x?: number | string;
    y?: number | string;
    width?: number | string;
    height?: number | string;
    value?: number | string | null;
    index?: number;
  }) {
    if (props.index !== lastIndex || props.value === null || props.value === undefined) {
      return <g />;
    }
    // A bar below zero takes its number under its end, not inside the bar.
    const y = Number(props.y);
    const below = Number(props.value) < 0 && props.width;
    return (
      <text
        x={Number(props.x) + Number(props.width ?? 0) / 2}
        y={below ? Math.max(y, y + Number(props.height ?? 0)) + 14 : y - 8}
        textAnchor={props.width ? "middle" : "end"}
        fontSize={12}
        fontWeight={700}
        fill={INK}
      >
        {fmt(Number(props.value))}
      </text>
    );
  };
}

function WeeklyBars({ data, width }: { data: GoalChartData; width?: number | undefined }) {
  return (
    <Frame width={width} height={HEIGHT.bar}>
      <BarChart data={data.bars} margin={{ top: 22, right: 8, bottom: 0, left: -16 }}>
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} />
        <ReferenceLine y={0} stroke={SOFT} />
        <Tooltip
          cursor={{ fill: GRID, fillOpacity: 0.5 }}
          content={<ChartTip unit={data.barUnit} prefix="Week of" />}
        />
        <Bar
          dataKey="value"
          fill={SERIES}
          maxBarSize={24}
          radius={[4, 4, 0, 0]}
          isAnimationActive={false}
          label={lastPointLabel(data.bars.length - 1)}
        />
      </BarChart>
    </Frame>
  );
}

function ProgressLine({ data, width }: { data: GoalChartData; width?: number | undefined }) {
  return (
    <Frame width={width} height={HEIGHT.line}>
      <LineChart data={data.line} margin={{ top: 22, right: 16, bottom: 0, left: -16 }}>
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} />
        {/* Set scale: left to itself the axis stops at the data and the target falls off the chart. */}
        <YAxis
          tick={AXIS}
          tickLine={false}
          axisLine={false}
          ticks={data.lineTicks}
          domain={[data.lineTicks[0]!, data.lineTicks[data.lineTicks.length - 1]!]}
        />
        <ReferenceLine
          y={data.target}
          stroke={SOFT}
          strokeDasharray="4 4"
          label={{
            value: `Target ${fmt(data.target)}`,
            position: "insideTopLeft",
            fontSize: 11,
            fill: SOFT,
          }}
        />
        <Tooltip
          cursor={{ stroke: SOFT, strokeWidth: 1 }}
          content={<ChartTip unit={data.unit} prefix="Week of" />}
        />
        <Line
          type="linear"
          dataKey="value"
          stroke={SERIES}
          strokeWidth={2}
          dot={{ r: 4, fill: SERIES, stroke: SURFACE, strokeWidth: 2 }}
          activeDot={{ r: 5, fill: SERIES, stroke: SURFACE, strokeWidth: 2 }}
          isAnimationActive={false}
          label={lastPointLabel(data.line.length - 1)}
        />
      </LineChart>
    </Frame>
  );
}

function sliceColour(donut: WeeklyDonut, index: number): string {
  // A number goal's last slice is what is still to go; every funnel slice is something that happened.
  const isRemaining = donut.slices[index]?.label === "Still to go";
  return isRemaining ? REMAINING : (SLICES[index] ?? SLICES[0]!);
}

function WeekRound({ donut, width }: { donut: WeeklyDonut; width?: number | undefined }) {
  return (
    <>
      <div className="relative">
        <Frame width={width} height={HEIGHT.round}>
          <PieChart>
            <Pie
              data={donut.slices}
              dataKey="value"
              nameKey="label"
              innerRadius="62%"
              outerRadius="92%"
              startAngle={90}
              endAngle={-270}
              stroke={SURFACE}
              strokeWidth={2}
              isAnimationActive={false}
            >
              {donut.slices.map((s, i) => (
                <Cell key={s.label} fill={sliceColour(donut, i)} />
              ))}
            </Pie>
          </PieChart>
        </Frame>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold text-ink">{donut.centreValue}</span>
          <span className="max-w-[6.5rem] text-center text-[11px] leading-tight text-soft">
            {donut.centreLabel}
          </span>
        </div>
      </div>
      <ul className="mt-2 space-y-1">
        {donut.slices.map((s, i) => (
          <li key={s.label} className="flex items-baseline gap-2 text-[12px]">
            <span
              aria-hidden
              className="h-2.5 w-2.5 shrink-0 translate-y-px rounded-full"
              style={{ background: sliceColour(donut, i) }}
            />
            <span className="min-w-0 flex-1 text-soft">{s.label}</span>
            <span className="font-bold text-ink">{fmt(s.value)}</span>
          </li>
        ))}
      </ul>
      {donut.note ? (
        <p className="mt-2 text-[12px] leading-snug font-semibold text-ink">{donut.note}</p>
      ) : null}
    </>
  );
}

function Panel({
  title,
  subtitle,
  summary,
  className,
  children,
}: {
  title: string;
  subtitle?: string | undefined;
  summary: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <figure className={`min-w-0 rounded-[12px] border border-line bg-ivory p-3 ${className ?? ""}`}>
      <figcaption>
        <p className="text-[13px] font-bold text-ink">{title}</p>
        {subtitle ? <p className="text-[12px] leading-snug text-soft">{subtitle}</p> : null}
      </figcaption>
      <div role="img" aria-label={summary} className="mt-2">
        {children}
      </div>
    </figure>
  );
}

function listed(points: { label: string; value: number | null }[], unit: string): string {
  return points
    .map((p) => `${p.label}: ${p.value === null ? "nothing logged" : withUnit(fmt(p.value), unit)}`)
    .join(", ");
}

/** Bar on top, the line with this week's round chart beside it. Stacked on a phone. */
export function GoalCharts({
  data,
  fixed,
}: {
  data: GoalChartData;
  /** draw at set sizes for the download, instead of following the page */
  fixed?: { bar: number; line: number; round: number } | undefined;
}) {
  return (
    <div className={fixed ? "grid grid-cols-5 gap-3" : "grid grid-cols-1 gap-3 sm:grid-cols-5"}>
      <Panel
        title={data.barTitle}
        summary={`${data.barTitle}. ${listed(data.bars, data.barUnit)}.`}
        className={fixed ? "col-span-5" : "sm:col-span-5"}
      >
        <WeeklyBars data={data} width={fixed?.bar} />
      </Panel>

      <Panel
        title={data.lineTitle}
        summary={`${data.lineTitle}, target ${fmt(data.target)}. ${listed(data.line, data.unit)}.`}
        className={fixed ? "col-span-3" : "sm:col-span-3"}
      >
        <ProgressLine data={data} width={fixed?.line} />
      </Panel>

      <Panel
        title="This week"
        subtitle={data.donut?.subtitle}
        summary={
          data.donut
            ? `This week. ${data.donut.slices.map((s) => `${s.label}: ${fmt(s.value)}`).join(", ")}.`
            : "Nothing logged this week yet."
        }
        className={fixed ? "col-span-2" : "sm:col-span-2"}
      >
        {data.donut ? (
          <WeekRound donut={data.donut} width={fixed?.round} />
        ) : (
          <p className="py-8 text-center text-[13px] text-soft">Nothing logged this week yet.</p>
        )}
      </Panel>
    </div>
  );
}
