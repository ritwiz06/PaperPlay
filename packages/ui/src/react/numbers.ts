/**
 * Numbers as the fork's chart writes them: a value whole and with its separators in the thousands
 * and more, "13,568,700"; a tick short enough for the axis, "20M" for 20,000,000.
 */
export const chartLabel = (value: number): string =>
  Math.abs(value) >= 1000 ? Math.round(value).toLocaleString("en-GB") : Number.isInteger(value) ? String(value) : value.toFixed(value < 1 ? 2 : 1);

export const chartTick = (value: number): string => (Math.abs(value) >= 10_000 ? new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value) : chartLabel(value));
