import Svg, { Circle, Defs, Line, LinearGradient, Path, Stop, Text as SvgText } from "react-native-svg";
import { View } from "react-native";
import { colors } from "../theme";

interface LineChartProps {
  values: number[];
  labels?: string[];
  width?: number;
  height?: number;
  color?: string;
}

// A small hand-rolled line chart (no charting library dependency): axes, a
// gradient-filled area under the line, a point per value, and min/max/date
// labels - enough to make a trend genuinely readable at a glance.
export default function LineChart({
  values,
  labels,
  width = 320,
  height = 160,
  color = colors.primary,
}: LineChartProps) {
  const paddingX = 12;
  const paddingTop = 20;
  const paddingBottom = 28;
  const gradientId = `chartFill-${color.replace("#", "")}`;

  if (values.length === 0) {
    return (
      <View>
        <Svg width={width} height={height}>
          <SvgText x={width / 2} y={height / 2} fontSize={12} fill={colors.textSecondary} textAnchor="middle">
            No data yet
          </SvgText>
        </Svg>
      </View>
    );
  }

  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;

  const innerWidth = width - paddingX * 2;
  const innerHeight = height - paddingTop - paddingBottom;
  const baselineY = height - paddingBottom;

  const points = values.map((v, i) => {
    const x = values.length === 1 ? paddingX : paddingX + (i / (values.length - 1)) * innerWidth;
    const y = paddingTop + innerHeight - ((v - min) / range) * innerHeight;
    return { x, y };
  });

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  const areaPath = `${linePath} L ${points[points.length - 1].x} ${baselineY} L ${points[0].x} ${baselineY} Z`;

  return (
    <Svg width={width} height={height}>
      <Defs>
        <LinearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={color} stopOpacity={0.35} />
          <Stop offset="1" stopColor={color} stopOpacity={0} />
        </LinearGradient>
      </Defs>

      <SvgText x={paddingX} y={paddingTop - 6} fontSize={11} fill={colors.textSecondary}>
        {Math.round(max).toLocaleString()}
      </SvgText>
      <SvgText x={paddingX} y={baselineY + 2} fontSize={11} fill={colors.textSecondary}>
        {Math.round(min).toLocaleString()}
      </SvgText>

      <Line x1={paddingX} y1={baselineY} x2={width - paddingX} y2={baselineY} stroke={colors.border} strokeWidth={1} />

      <Path d={areaPath} fill={`url(#${gradientId})`} stroke="none" />
      <Path d={linePath} fill="none" stroke={color} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />

      {points.map((p, i) => (
        <Circle key={i} cx={p.x} cy={p.y} r={i === points.length - 1 ? 4 : 2.5} fill={color} />
      ))}

      {labels && labels.length > 0 ? (
        <>
          <SvgText x={points[0].x} y={height - 8} fontSize={11} fill={colors.textSecondary}>
            {labels[0]}
          </SvgText>
          <SvgText
            x={points[points.length - 1].x}
            y={height - 8}
            fontSize={11}
            fill={colors.textSecondary}
            textAnchor="end"
          >
            {labels[labels.length - 1]}
          </SvgText>
        </>
      ) : null}
    </Svg>
  );
}
