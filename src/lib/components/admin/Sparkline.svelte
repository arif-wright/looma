<script lang="ts">
  export type SparkPoint = { date: string; count: number };
  export let data: SparkPoint[] = [];
  export let stroke = '#34d399';
  export let fill = 'none';
  export let height = 68;

  const width = 160;

  const buildPoints = (series: SparkPoint[]) => {
    if (!series?.length) {
      return `0,${height}`;
    }
    const max = Math.max(...series.map((point) => point.count), 1);
    const denominator = Math.max(series.length - 1, 1);

    return series
      .map((point, index) => {
        const x = (index / denominator) * width;
        const y = height - (point.count / max) * height;
        return `${x.toFixed(2)},${Number.isFinite(y) ? y.toFixed(2) : height}`;
      })
      .join(' ');
  };

  $: points = buildPoints(data);
</script>

<svg
  class="sparkline"
  viewBox={`0 0 ${width} ${height}`}
  preserveAspectRatio="none"
  role="img"
  aria-label="sparkline"
>
  <polyline points={points} stroke={stroke} fill={fill} vector-effect="non-scaling-stroke" />
</svg>

<style>
  .sparkline {
    width: 100%;
    height: auto;
  }

  polyline {
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
</style>
