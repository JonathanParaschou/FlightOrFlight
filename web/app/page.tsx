'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Tooltip as ChartTooltip,
  Legend,
  Filler,
} from 'chart.js';
import { Bar, Line, Doughnut } from 'react-chartjs-2';
import {
  AlertCircle,
  Activity,
  BarChart3,
  CalendarDays,
  ChevronDown,
  Clock,
  Database,
  Plane,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Wallet,
} from 'lucide-react';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  ChartTooltip,
  Legend,
  Filler
);

type FlightPrice = {
  id: number;
  scan_id: string;
  scanned_at: string;
  origin: string;
  destination: string;
  depart_date: string;
  return_date: string;
  trip_length_days: number;
  adults: number;
  cheapest_price_usd: number | null;
  status: string;
  created_at: string;
};

type CheapestWindow = {
  depart_date: string;
  return_date: string;
  origin: string;
  destination: string;
  trip_length_days: number;
  adults: number;
  cheapest_price_usd: number | null;
  last_scanned_at: string;
  observation_count: number;
};

type Summary = {
  total_observations: number;
  successful_observations: number;
  failed_observations: number;
  min_price: number | null;
  avg_price: number | null;
  max_price: number | null;
  last_scanned_at: string | null;
};

type ChartMetric = 'min' | 'avg' | 'median' | 'max';
type GroupByMode = 'month' | 'weekday';
type SortMode = 'price' | 'date' | 'savings';
type ViewMode = 'cards' | 'table';

const API_BASE = 'http://127.0.0.1:8000';

const chartColors = {
  blue: 'rgba(56, 189, 248, 1)',
  blueFill: 'rgba(56, 189, 248, 0.18)',
  emerald: 'rgba(52, 211, 153, 1)',
  emeraldFill: 'rgba(52, 211, 153, 0.18)',
  amber: 'rgba(251, 191, 36, 1)',
  amberFill: 'rgba(251, 191, 36, 0.2)',
  rose: 'rgba(251, 113, 133, 1)',
  roseFill: 'rgba(251, 113, 133, 0.18)',
  slate: 'rgba(148, 163, 184, 1)',
  grid: 'rgba(148, 163, 184, 0.12)',
  text: 'rgba(226, 232, 240, 0.85)',
};

function formatMoney(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return '-';
  return `$${Math.round(value).toLocaleString()}`;
}

function formatDate(value: string | null | undefined) {
  if (!value) return 'Unknown';
  const date = new Date(`${value}T00:00:00`);
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

function formatLongDate(value: string | null | undefined) {
  if (!value) return 'Unknown';
  const date = new Date(`${value}T00:00:00`);
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return 'Unknown';
  return new Date(value).toLocaleString();
}

function getMonthName(dateString: string) {
  const d = new Date(`${dateString}T00:00:00`);
  return d.toLocaleString('default', { month: 'short' });
}

function getMonthIndex(dateString: string) {
  return new Date(`${dateString}T00:00:00`).getMonth();
}

function getWeekdayName(dateString: string) {
  const d = new Date(`${dateString}T00:00:00`);
  return d.toLocaleString('default', { weekday: 'short' });
}

function getWeekdayIndex(dateString: string) {
  return new Date(`${dateString}T00:00:00`).getDay();
}

function median(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }

  return sorted[mid];
}

function percentile(values: number[], p: number) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, index))];
}

function standardDeviation(values: number[]) {
  if (values.length <= 1) return 0;
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  const variance =
    values.reduce((sum, value) => sum + Math.pow(value - avg, 2), 0) /
    values.length;

  return Math.sqrt(variance);
}

function chartOptions(yLabel = 'Price') {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'index' as const,
      intersect: false,
    },
    plugins: {
      legend: {
        labels: {
          color: chartColors.text,
          boxWidth: 12,
          usePointStyle: true,
        },
      },
      tooltip: {
        callbacks: {
          label: (context: any) => {
            const label = context.dataset.label || '';
            const value = context.raw;
            if (yLabel === 'Price') return `${label}: ${formatMoney(value)}`;
            return `${label}: ${value}`;
          },
        },
      },
    },
    scales: {
      x: {
        ticks: {
          color: chartColors.text,
          maxRotation: 0,
          autoSkip: true,
          maxTicksLimit: 10,
        },
        grid: {
          color: 'transparent',
        },
      },
      y: {
        ticks: {
          color: chartColors.text,
          callback: (value: any) =>
            yLabel === 'Price' ? `$${Number(value).toLocaleString()}` : value,
        },
        grid: {
          color: chartColors.grid,
        },
      },
    },
  };
}

export default function Home() {
  const [origin, setOrigin] = useState('MSP');
  const [destination, setDestination] = useState('HNL');
  const [tripLengthDays, setTripLengthDays] = useState(4);
  const [adults, setAdults] = useState(1);
  const [cheapestLimit, setCheapestLimit] = useState(100);

  const [prices, setPrices] = useState<FlightPrice[]>([]);
  const [cheapest, setCheapest] = useState<CheapestWindow[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);

  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(true);

  const [chartMetric, setChartMetric] = useState<ChartMetric>('min');
  const [groupByMode, setGroupByMode] = useState<GroupByMode>('month');
  const [maxChartPoints, setMaxChartPoints] = useState(365);
  const [priceCap, setPriceCap] = useState<number>(0);
  const [sortMode, setSortMode] = useState<SortMode>('price');
  const [viewMode, setViewMode] = useState<ViewMode>('cards');

  async function loadData() {
    setLoading(true);
    setApiError(null);
    setHasSearched(true);

    const params = new URLSearchParams({
      origin: origin.trim().toUpperCase(),
      destination: destination.trim().toUpperCase(),
      trip_length_days: String(tripLengthDays),
      adults: String(adults),
    });

    try {
      const [pricesRes, cheapestRes, summaryRes] = await Promise.all([
        fetch(`${API_BASE}/prices?${params.toString()}&limit=5000`),
        fetch(
          `${API_BASE}/prices/cheapest?${params.toString()}&limit=${cheapestLimit}`
        ),
        fetch(`${API_BASE}/summary?${params.toString()}`),
      ]);

      if (!pricesRes.ok || !cheapestRes.ok || !summaryRes.ok) {
        throw new Error('API request failed.');
      }

      setPrices(await pricesRes.json());
      setCheapest(await cheapestRes.json());
      setSummary(await summaryRes.json());
    } catch (error) {
      console.error(error);
      setPrices([]);
      setCheapest([]);
      setSummary(null);
      setApiError(
        'Could not connect to the Flight Scanner API. Make sure FastAPI is running on port 8000.'
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const validPrices = useMemo(() => {
    return prices
      .filter((p) => p.status === 'success' && p.cheapest_price_usd !== null)
      .map((p) => ({
        ...p,
        cheapest_price_usd: p.cheapest_price_usd as number,
      }))
      .filter((p) => (priceCap > 0 ? p.cheapest_price_usd <= priceCap : true))
      .sort(
        (a, b) =>
          new Date(a.depart_date).getTime() - new Date(b.depart_date).getTime()
      );
  }, [prices, priceCap]);

  const priceValues = useMemo(() => {
    return validPrices.map((p) => p.cheapest_price_usd);
  }, [validPrices]);

  const analytics = useMemo(() => {
    const min = priceValues.length ? Math.min(...priceValues) : null;
    const max = priceValues.length ? Math.max(...priceValues) : null;
    const avg = priceValues.length
      ? priceValues.reduce((a, b) => a + b, 0) / priceValues.length
      : null;
    const med = median(priceValues);
    const p25 = percentile(priceValues, 25);
    const p75 = percentile(priceValues, 75);
    const std = standardDeviation(priceValues);
    const spread = min !== null && max !== null ? max - min : null;

    const dealThreshold =
      p25 !== null ? p25 : avg !== null ? avg * 0.9 : null;

    const dealCount =
      dealThreshold === null
        ? 0
        : priceValues.filter((value) => value <= dealThreshold).length;

    return {
      min,
      max,
      avg,
      med,
      p25,
      p75,
      std,
      spread,
      dealThreshold,
      dealCount,
      dealPct:
        priceValues.length > 0
          ? Math.round((dealCount / priceValues.length) * 100)
          : 0,
    };
  }, [priceValues]);

  const bestWindow = useMemo(() => {
    return cheapest
      .filter((row) => row.cheapest_price_usd !== null)
      .sort((a, b) => (a.cheapest_price_usd ?? 0) - (b.cheapest_price_usd ?? 0))[0];
  }, [cheapest]);

  const worstWindow = useMemo(() => {
    return [...validPrices].sort(
      (a, b) => b.cheapest_price_usd - a.cheapest_price_usd
    )[0];
  }, [validPrices]);

  const consumerAdvice = useMemo(() => {
    if (!bestWindow || analytics.avg === null || bestWindow.cheapest_price_usd === null) {
      return {
        headline: 'Not enough data yet',
        detail: 'Run more scans to compare windows and identify real deals.',
        tone: 'neutral' as const,
      };
    }

    const savings = analytics.avg - bestWindow.cheapest_price_usd;
    const savingsPct = Math.round((savings / analytics.avg) * 100);

    if (savingsPct >= 20) {
      return {
        headline: 'Strong deal found',
        detail: `${formatLongDate(bestWindow.depart_date)} is ${formatMoney(
          savings
        )} below the average observed fare.`,
        tone: 'good' as const,
      };
    }

    if (savingsPct >= 10) {
      return {
        headline: 'Decent price window',
        detail: `${formatLongDate(bestWindow.depart_date)} is about ${savingsPct}% below average.`,
        tone: 'good' as const,
      };
    }

    return {
      headline: 'Prices look tight',
      detail:
        'The best fare is not dramatically below average. More scans may help before booking.',
      tone: 'neutral' as const,
    };
  }, [bestWindow, analytics.avg]);

  const bestMonths = useMemo(() => {
    const grouped = new Map<
      string,
      {
        label: string;
        sortIndex: number;
        prices: number[];
      }
    >();

    for (const row of validPrices) {
      const label = getMonthName(row.depart_date);
      const sortIndex = getMonthIndex(row.depart_date);

      if (!grouped.has(label)) {
        grouped.set(label, {
          label,
          sortIndex,
          prices: [],
        });
      }

      grouped.get(label)!.prices.push(row.cheapest_price_usd);
    }

    return Array.from(grouped.values())
      .map((item) => ({
        label: item.label,
        sortIndex: item.sortIndex,
        min: Math.min(...item.prices),
        avg: Math.round(
          item.prices.reduce((sum, value) => sum + value, 0) / item.prices.length
        ),
        median: Math.round(median(item.prices) ?? 0),
        max: Math.max(...item.prices),
        count: item.prices.length,
      }))
      .sort((a, b) => a.sortIndex - b.sortIndex);
  }, [validPrices]);

  const groupAnalytics = useMemo(() => {
    const grouped = new Map<
      string,
      {
        label: string;
        sortIndex: number;
        prices: number[];
      }
    >();

    for (const row of validPrices) {
      const label =
        groupByMode === 'month'
          ? getMonthName(row.depart_date)
          : getWeekdayName(row.depart_date);

      const sortIndex =
        groupByMode === 'month'
          ? getMonthIndex(row.depart_date)
          : getWeekdayIndex(row.depart_date);

      if (!grouped.has(label)) {
        grouped.set(label, {
          label,
          sortIndex,
          prices: [],
        });
      }

      grouped.get(label)!.prices.push(row.cheapest_price_usd);
    }

    return Array.from(grouped.values())
      .map((item) => ({
        label: item.label,
        sortIndex: item.sortIndex,
        min: Math.min(...item.prices),
        avg: Math.round(
          item.prices.reduce((sum, value) => sum + value, 0) / item.prices.length
        ),
        median: Math.round(median(item.prices) ?? 0),
        max: Math.max(...item.prices),
        count: item.prices.length,
      }))
      .sort((a, b) => a.sortIndex - b.sortIndex);
  }, [validPrices, groupByMode]);

  const priceTimeline = useMemo(() => {
    return validPrices.slice(0, maxChartPoints).map((row) => ({
      label: formatDate(row.depart_date),
      price: row.cheapest_price_usd,
      departDate: row.depart_date,
      returnDate: row.return_date,
    }));
  }, [validPrices, maxChartPoints]);

  const priceBuckets = useMemo(() => {
    if (!priceValues.length) return [];

    const min = Math.floor(Math.min(...priceValues) / 100) * 100;
    const max = Math.ceil(Math.max(...priceValues) / 100) * 100;
    const bucketSize = Math.max(100, Math.ceil((max - min) / 8 / 50) * 50);

    const buckets: {
      label: string;
      min: number;
      max: number;
      count: number;
    }[] = [];

    for (let start = min; start <= max; start += bucketSize) {
      buckets.push({
        label: `${formatMoney(start)}-${formatMoney(start + bucketSize - 1)}`,
        min: start,
        max: start + bucketSize - 1,
        count: 0,
      });
    }

    for (const price of priceValues) {
      const bucket =
        buckets.find((item) => price >= item.min && price <= item.max) ??
        buckets[buckets.length - 1];

      if (bucket) bucket.count += 1;
    }

    return buckets.filter((bucket) => bucket.count > 0);
  }, [priceValues]);

  const sortedCheapest = useMemo(() => {
    const rows = cheapest.filter((row) => row.cheapest_price_usd !== null);

    return [...rows].sort((a, b) => {
      if (sortMode === 'date') {
        return (
          new Date(a.depart_date).getTime() - new Date(b.depart_date).getTime()
        );
      }

      if (sortMode === 'savings') {
        const avg = analytics.avg ?? 0;
        return (
          avg -
          (b.cheapest_price_usd ?? 0) -
          (avg - (a.cheapest_price_usd ?? 0))
        );
      }

      return (a.cheapest_price_usd ?? 0) - (b.cheapest_price_usd ?? 0);
    });
  }, [cheapest, sortMode, analytics.avg]);

  const timelineChartData = useMemo(() => {
    return {
      labels: priceTimeline.map((row) => row.label),
      datasets: [
        {
          label: 'Observed Fare',
          data: priceTimeline.map((row) => row.price),
          borderColor: chartColors.blue,
          backgroundColor: chartColors.blueFill,
          tension: 0.35,
          fill: true,
          pointRadius: 2,
          pointHoverRadius: 5,
        },
        ...(analytics.avg !== null
          ? [
              {
                label: 'Average',
                data: priceTimeline.map(() => Math.round(analytics.avg ?? 0)),
                borderColor: chartColors.slate,
                backgroundColor: 'transparent',
                borderDash: [6, 6],
                tension: 0,
                pointRadius: 0,
              },
            ]
          : []),
        ...(analytics.dealThreshold !== null
          ? [
              {
                label: 'Deal Threshold',
                data: priceTimeline.map(() =>
                  Math.round(analytics.dealThreshold ?? 0)
                ),
                borderColor: chartColors.emerald,
                backgroundColor: 'transparent',
                borderDash: [4, 4],
                tension: 0,
                pointRadius: 0,
              },
            ]
          : []),
      ],
    };
  }, [priceTimeline, analytics.avg, analytics.dealThreshold]);

  const groupChartData = useMemo(() => {
    return {
      labels: groupAnalytics.map((row) => row.label),
      datasets: [
        {
          label:
            chartMetric === 'min'
              ? 'Lowest Fare'
              : chartMetric === 'avg'
              ? 'Average Fare'
              : chartMetric === 'median'
              ? 'Median Fare'
              : 'Highest Fare',
          data: groupAnalytics.map((row) => row[chartMetric]),
          backgroundColor:
            chartMetric === 'min'
              ? chartColors.emeraldFill
              : chartMetric === 'max'
              ? chartColors.roseFill
              : chartColors.blueFill,
          borderColor:
            chartMetric === 'min'
              ? chartColors.emerald
              : chartMetric === 'max'
              ? chartColors.rose
              : chartColors.blue,
          borderWidth: 2,
          borderRadius: 12,
        },
      ],
    };
  }, [groupAnalytics, chartMetric]);

  const distributionChartData = useMemo(() => {
    return {
      labels: priceBuckets.map((bucket) => bucket.label),
      datasets: [
        {
          label: 'Travel Windows',
          data: priceBuckets.map((bucket) => bucket.count),
          backgroundColor: chartColors.amberFill,
          borderColor: chartColors.amber,
          borderWidth: 2,
          borderRadius: 12,
        },
      ],
    };
  }, [priceBuckets]);

  const monthRankChartData = useMemo(() => {
    const ranked = [...bestMonths].sort((a, b) => a.min - b.min).slice(0, 6);

    return {
      labels: ranked.map((row) => row.label),
      datasets: [
        {
          label: 'Lowest Fare',
          data: ranked.map((row) => row.min),
          backgroundColor: chartColors.emeraldFill,
          borderColor: chartColors.emerald,
          borderWidth: 2,
          borderRadius: 12,
        },
      ],
    };
  }, [bestMonths]);

  const fareMixChartData = useMemo(() => {
    const low =
      analytics.dealThreshold === null
        ? 0
        : priceValues.filter((price) => price <= analytics.dealThreshold!).length;

    const mid =
      analytics.dealThreshold === null || analytics.p75 === null
        ? 0
        : priceValues.filter(
            (price) => price > analytics.dealThreshold! && price <= analytics.p75!
          ).length;

    const high =
      analytics.p75 === null
        ? 0
        : priceValues.filter((price) => price > analytics.p75!).length;

    return {
      labels: ['Deals', 'Normal', 'Expensive'],
      datasets: [
        {
          label: 'Fare Mix',
          data: [low, mid, high],
          backgroundColor: [
            chartColors.emeraldFill,
            chartColors.blueFill,
            chartColors.roseFill,
          ],
          borderColor: [chartColors.emerald, chartColors.blue, chartColors.rose],
          borderWidth: 2,
        },
      ],
    };
  }, [priceValues, analytics.dealThreshold, analytics.p75]);

  const hasData = validPrices.length > 0;

  return (
    <main className="min-h-screen bg-[#08111f] px-4 py-6 text-white md:px-8">
      <div className="mx-auto max-w-[1500px] space-y-6">
        <header className="overflow-hidden rounded-[2rem] border border-white/10 bg-gradient-to-br from-slate-900 via-slate-950 to-sky-950 p-6 shadow-2xl md:p-8">
          <div className="flex flex-col justify-between gap-6 xl:flex-row xl:items-end">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-sky-400/30 bg-sky-400/10 px-4 py-2 text-sm font-semibold text-sky-200">
                <Plane size={18} />
                Flight Scanner
              </div>

              <h1 className="mt-5 max-w-4xl text-4xl font-black tracking-tight md:text-6xl">
                Find the best time to fly, not just the cheapest row.
              </h1>

              <p className="mt-4 max-w-3xl text-base leading-7 text-slate-300 md:text-lg">
                Compare route prices like a shopper: best dates, cheapest months,
                price spread, fare distribution, and deal thresholds for{' '}
                <span className="font-semibold text-white">
                  {origin.toUpperCase()} → {destination.toUpperCase()}
                </span>
                .
              </p>
            </div>

            <button
              onClick={loadData}
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white px-5 py-3 font-bold text-slate-950 shadow-xl transition hover:bg-sky-100"
            >
              <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
              {loading ? 'Refreshing...' : 'Refresh Data'}
            </button>
          </div>

          <section className="mt-8 rounded-3xl border border-white/10 bg-slate-950/65 p-4 backdrop-blur">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-7">
              <InputField
                label="From"
                value={origin}
                onChange={setOrigin}
                placeholder="MSP"
              />
              <InputField
                label="To"
                value={destination}
                onChange={setDestination}
                placeholder="HNL"
              />
              <NumberField
                label="Trip Days"
                value={tripLengthDays}
                onChange={setTripLengthDays}
                min={1}
              />
              <NumberField
                label="Adults"
                value={adults}
                onChange={setAdults}
                min={1}
              />
              <NumberField
                label="Cheapest Rows"
                value={cheapestLimit}
                onChange={setCheapestLimit}
                min={1}
              />
              <NumberField
                label="Price Cap"
                value={priceCap}
                onChange={setPriceCap}
                min={0}
                helper="0 = no cap"
              />

              <div className="flex items-end">
                <button
                  onClick={loadData}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-sky-400 px-5 py-3 font-black text-slate-950 shadow-lg shadow-sky-950/40 transition hover:bg-sky-300"
                >
                  <Search size={18} />
                  Search
                </button>
              </div>
            </div>
          </section>
        </header>

        {apiError && (
          <section className="rounded-3xl border border-red-500/30 bg-red-950/40 p-6 text-red-100">
            <div className="flex items-center gap-3">
              <AlertCircle />
              <p>{apiError}</p>
            </div>
          </section>
        )}

        {!loading && !apiError && hasSearched && !hasData && (
          <section className="rounded-3xl border border-white/10 bg-slate-900/80 p-10 text-center shadow-2xl">
            <p className="text-sm font-semibold uppercase tracking-[0.25em] text-sky-300">
              No Flight Data
            </p>
            <h2 className="mt-3 text-3xl font-bold">
              No stored scan data exists for this route.
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-slate-400">
              Run your scanner for {origin.toUpperCase()} →{' '}
              {destination.toUpperCase()} with a {tripLengthDays}-day trip and{' '}
              {adults} adult{adults === 1 ? '' : 's'}, then refresh this page.
            </p>
          </section>
        )}

        {hasData && (
          <>
            <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
              <StatCard
                label="Best Fare"
                value={formatMoney(analytics.min)}
                sublabel="Lowest observed"
                icon={<TrendingDown size={20} />}
                accent="emerald"
              />
              <StatCard
                label="Typical Fare"
                value={formatMoney(analytics.med)}
                sublabel="Median observed"
                icon={<Activity size={20} />}
                accent="sky"
              />
              <StatCard
                label="Average Fare"
                value={formatMoney(analytics.avg)}
                sublabel="Mean observed"
                icon={<BarChart3 size={20} />}
                accent="sky"
              />
              <StatCard
                label="Deal Windows"
                value={`${analytics.dealPct}%`}
                sublabel={`At or below ${formatMoney(analytics.dealThreshold)}`}
                icon={<Sparkles size={20} />}
                accent="amber"
              />
              <StatCard
                label="Price Spread"
                value={formatMoney(analytics.spread)}
                sublabel={`${formatMoney(analytics.min)} to ${formatMoney(
                  analytics.max
                )}`}
                icon={<Wallet size={20} />}
                accent="rose"
              />
            </section>

            <section className="grid grid-cols-1 gap-6 xl:grid-cols-3">
              <div className="xl:col-span-2">
                <DealHero
                  bestWindow={bestWindow}
                  analytics={analytics}
                  consumerAdvice={consumerAdvice}
                />
              </div>

              <div className="grid grid-cols-1 gap-4">
                <InfoPanel
                  title="Search Context"
                  rows={[
                    ['Route', `${origin.toUpperCase()} → ${destination.toUpperCase()}`],
                    ['Trip Length', `${tripLengthDays} days`],
                    ['Adults', `${adults}`],
                    ['Loaded Windows', `${validPrices.length}`],
                    ['Last Scan', formatDateTime(summary?.last_scanned_at)],
                  ]}
                />

                {worstWindow && (
                  <InfoPanel
                    title="Avoid Paying This"
                    rows={[
                      [
                        'Highest Fare',
                        formatMoney(worstWindow.cheapest_price_usd),
                      ],
                      [
                        'Dates',
                        `${formatLongDate(worstWindow.depart_date)} → ${formatLongDate(
                          worstWindow.return_date
                        )}`,
                      ],
                      ['Scanned', formatDateTime(worstWindow.scanned_at)],
                    ]}
                  />
                )}
              </div>
            </section>

            <section className="rounded-[2rem] border border-white/10 bg-slate-900/80 p-5 shadow-2xl">
              <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
                <div>
                  <div className="flex items-center gap-2 text-sky-300">
                    <SlidersHorizontal size={18} />
                    <p className="text-sm font-bold uppercase tracking-[0.2em]">
                      Chart Controls
                    </p>
                  </div>
                  <h2 className="mt-2 text-2xl font-black">
                    Configure the dashboard view
                  </h2>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <SelectField
                    label="Group By"
                    value={groupByMode}
                    onChange={(value) => setGroupByMode(value as GroupByMode)}
                    options={[
                      { label: 'Departure Month', value: 'month' },
                      { label: 'Departure Weekday', value: 'weekday' },
                    ]}
                  />
                  <SelectField
                    label="Chart Metric"
                    value={chartMetric}
                    onChange={(value) => setChartMetric(value as ChartMetric)}
                    options={[
                      { label: 'Lowest Fare', value: 'min' },
                      { label: 'Average Fare', value: 'avg' },
                      { label: 'Median Fare', value: 'median' },
                      { label: 'Highest Fare', value: 'max' },
                    ]}
                  />
                  <NumberField
                    label="Timeline Points"
                    value={maxChartPoints}
                    onChange={setMaxChartPoints}
                    min={10}
                  />
                </div>
              </div>
            </section>

            <section className="grid grid-cols-1 gap-6 xl:grid-cols-2">
              <ChartCard
                title="Fare Calendar Trend"
                description="Price by departure date with average and deal-threshold lines."
              >
                <div className="h-[390px]">
                  <Line data={timelineChartData} options={chartOptions('Price')} />
                </div>
              </ChartCard>

              <ChartCard
                title={
                  groupByMode === 'month'
                    ? 'Best Time of Year'
                    : 'Best Day of Week'
                }
                description="Use the controls above to compare min, average, median, or max fare."
              >
                <div className="h-[390px]">
                  <Bar data={groupChartData} options={chartOptions('Price')} />
                </div>
              </ChartCard>

              <ChartCard
                title="Fare Distribution"
                description="Shows how clustered prices are across all scanned travel windows."
              >
                <div className="h-[360px]">
                  <Bar
                    data={distributionChartData}
                    options={chartOptions('Windows')}
                  />
                </div>
              </ChartCard>

              <ChartCard
                title="Top Cheapest Months"
                description="Lowest observed fare by the strongest months in your scan data."
              >
                <div className="h-[360px]">
                  <Bar data={monthRankChartData} options={chartOptions('Price')} />
                </div>
              </ChartCard>
            </section>

            <section className="grid grid-cols-1 gap-6 xl:grid-cols-3">
              <ChartCard
                title="Fare Mix"
                description="Separates deal, normal, and expensive windows."
              >
                <div className="mx-auto h-[320px] max-w-[420px]">
                  <Doughnut
                    data={fareMixChartData}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      plugins: {
                        legend: {
                          position: 'bottom',
                          labels: {
                            color: chartColors.text,
                            boxWidth: 12,
                            usePointStyle: true,
                          },
                        },
                      },
                    }}
                  />
                </div>
              </ChartCard>

              <div className="xl:col-span-2 rounded-[2rem] border border-white/10 bg-slate-900/80 p-6 shadow-2xl">
                <div className="mb-5 flex flex-col justify-between gap-4 md:flex-row md:items-center">
                  <div>
                    <h2 className="text-2xl font-black">Best Travel Windows</h2>
                    <p className="mt-1 text-sm text-slate-400">
                      Shopper-friendly view of the cheapest dates found.
                    </p>
                  </div>

                  <div className="flex flex-col gap-3 sm:flex-row">
                    <SelectField
                      label="Sort"
                      value={sortMode}
                      onChange={(value) => setSortMode(value as SortMode)}
                      options={[
                        { label: 'Lowest Price', value: 'price' },
                        { label: 'Earliest Date', value: 'date' },
                        { label: 'Biggest Savings', value: 'savings' },
                      ]}
                    />
                    <SelectField
                      label="View"
                      value={viewMode}
                      onChange={(value) => setViewMode(value as ViewMode)}
                      options={[
                        { label: 'Cards', value: 'cards' },
                        { label: 'Table', value: 'table' },
                      ]}
                    />
                  </div>
                </div>

                {viewMode === 'cards' ? (
                  <div className="grid max-h-[620px] grid-cols-1 gap-3 overflow-auto pr-1 md:grid-cols-2">
                    {sortedCheapest.slice(0, cheapestLimit).map((row, index) => {
                      const savings =
                        analytics.avg !== null && row.cheapest_price_usd !== null
                          ? analytics.avg - row.cheapest_price_usd
                          : null;

                      return (
                        <DealCard
                          key={`${row.depart_date}-${row.return_date}-${row.cheapest_price_usd}`}
                          rank={index + 1}
                          row={row}
                          savings={savings}
                        />
                      );
                    })}
                  </div>
                ) : (
                  <div className="max-h-[620px] overflow-auto rounded-2xl border border-white/10">
                    <table className="w-full border-collapse text-left text-sm">
                      <thead className="sticky top-0 bg-slate-800 text-slate-200">
                        <tr>
                          <th className="px-4 py-3">Rank</th>
                          <th className="px-4 py-3">Depart</th>
                          <th className="px-4 py-3">Return</th>
                          <th className="px-4 py-3">Price</th>
                          <th className="px-4 py-3">Savings vs Avg</th>
                          <th className="px-4 py-3">Scans</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sortedCheapest
                          .slice(0, cheapestLimit)
                          .map((row, index) => {
                            const savings =
                              analytics.avg !== null &&
                              row.cheapest_price_usd !== null
                                ? analytics.avg - row.cheapest_price_usd
                                : null;

                            return (
                              <tr
                                key={`${row.depart_date}-${row.return_date}-${row.cheapest_price_usd}`}
                                className="border-t border-white/10"
                              >
                                <td className="px-4 py-3 text-slate-400">
                                  #{index + 1}
                                </td>
                                <td className="px-4 py-3">
                                  {formatLongDate(row.depart_date)}
                                </td>
                                <td className="px-4 py-3">
                                  {formatLongDate(row.return_date)}
                                </td>
                                <td className="px-4 py-3 font-black text-emerald-300">
                                  {formatMoney(row.cheapest_price_usd)}
                                </td>
                                <td className="px-4 py-3 text-sky-300">
                                  {savings !== null && savings > 0
                                    ? formatMoney(savings)
                                    : '-'}
                                </td>
                                <td className="px-4 py-3">
                                  {row.observation_count}
                                </td>
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </section>

            <section className="grid grid-cols-1 gap-6 xl:grid-cols-3">
              <InfoPanel
                title="Price Benchmarks"
                rows={[
                  ['25th Percentile', formatMoney(analytics.p25)],
                  ['Median', formatMoney(analytics.med)],
                  ['75th Percentile', formatMoney(analytics.p75)],
                  ['Std. Deviation', formatMoney(analytics.std)],
                ]}
              />

              <InfoPanel
                title="Scan Coverage"
                rows={[
                  ['Total Observations', `${summary?.total_observations ?? 0}`],
                  [
                    'Successful',
                    `${summary?.successful_observations ?? validPrices.length}`,
                  ],
                  ['Failed', `${summary?.failed_observations ?? 0}`],
                  ['Displayed After Filters', `${validPrices.length}`],
                ]}
              />

              <InfoPanel
                title="Consumer Notes"
                rows={[
                  ['Best Month', bestMonths.sort((a, b) => a.min - b.min)[0]?.label ?? '-'],
                  [
                    'Cheapest Threshold',
                    formatMoney(analytics.dealThreshold),
                  ],
                  [
                    'Good Deal Count',
                    `${analytics.dealCount} windows`,
                  ],
                  [
                    'Use Case',
                    'Compare date windows before booking',
                  ],
                ]}
              />
            </section>
          </>
        )}
      </div>
    </main>
  );
}

function DealHero({
  bestWindow,
  analytics,
  consumerAdvice,
}: {
  bestWindow: CheapestWindow | undefined;
  analytics: {
    avg: number | null;
    dealThreshold: number | null;
    min: number | null;
  };
  consumerAdvice: {
    headline: string;
    detail: string;
    tone: 'good' | 'neutral';
  };
}) {
  const savings =
    bestWindow?.cheapest_price_usd !== null &&
    bestWindow?.cheapest_price_usd !== undefined &&
    analytics.avg !== null
      ? analytics.avg - bestWindow.cheapest_price_usd
      : null;

  return (
    <section className="relative overflow-hidden rounded-[2rem] border border-emerald-400/20 bg-gradient-to-br from-emerald-950/80 via-slate-900 to-slate-950 p-6 shadow-2xl md:p-8">
      <div className="absolute right-0 top-0 h-48 w-48 rounded-full bg-emerald-400/10 blur-3xl" />
      <div className="relative">
        <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-start">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-4 py-2 text-sm font-bold text-emerald-200">
              <Sparkles size={17} />
              {consumerAdvice.headline}
            </div>

            <h2 className="mt-5 text-3xl font-black md:text-5xl">
              {bestWindow
                ? `${formatLongDate(bestWindow.depart_date)} → ${formatLongDate(
                    bestWindow.return_date
                  )}`
                : 'No best window yet'}
            </h2>

            <p className="mt-4 max-w-2xl text-slate-300">
              {consumerAdvice.detail}
            </p>
          </div>

          <div className="rounded-3xl border border-white/10 bg-slate-950/60 p-5 text-left lg:min-w-[260px]">
            <p className="text-sm font-bold uppercase tracking-[0.2em] text-slate-400">
              Best Price
            </p>
            <p className="mt-2 text-5xl font-black text-emerald-300">
              {formatMoney(bestWindow?.cheapest_price_usd)}
            </p>
            <p className="mt-3 text-sm text-slate-400">
              {savings !== null && savings > 0
                ? `${formatMoney(savings)} below average`
                : 'Compare against more scans'}
            </p>
          </div>
        </div>

        <div className="mt-8 grid grid-cols-1 gap-3 md:grid-cols-3">
          <MiniMetric
            label="Average Fare"
            value={formatMoney(analytics.avg)}
          />
          <MiniMetric
            label="Deal Threshold"
            value={formatMoney(analytics.dealThreshold)}
          />
          <MiniMetric
            label="Observed Count"
            value={`${bestWindow?.observation_count ?? 0} scan${
              bestWindow?.observation_count === 1 ? '' : 's'
            }`}
          />
        </div>
      </div>
    </section>
  );
}

function DealCard({
  rank,
  row,
  savings,
}: {
  rank: number;
  row: CheapestWindow;
  savings: number | null;
}) {
  return (
    <div className="rounded-3xl border border-white/10 bg-slate-950/80 p-5 transition hover:border-sky-400/40 hover:bg-slate-950">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-500">
            Option #{rank}
          </p>
          <h3 className="mt-2 text-lg font-black">
            {formatLongDate(row.depart_date)}
          </h3>
          <p className="mt-1 text-sm text-slate-400">
            Return {formatLongDate(row.return_date)}
          </p>
        </div>

        <p className="rounded-2xl bg-emerald-400/10 px-4 py-2 text-xl font-black text-emerald-300">
          {formatMoney(row.cheapest_price_usd)}
        </p>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <MiniMetric
          label="Savings"
          value={savings !== null && savings > 0 ? formatMoney(savings) : '-'}
        />
        <MiniMetric label="Scans" value={row.observation_count} />
      </div>

      <p className="mt-4 text-xs text-slate-500">
        Last scanned {formatDateTime(row.last_scanned_at)}
      </p>
    </div>
  );
}

function InputField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-slate-300">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value.toUpperCase())}
        placeholder={placeholder}
        className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 font-semibold text-white outline-none transition placeholder:text-slate-600 focus:border-sky-400"
      />
    </label>
  );
}

function NumberField({
  label,
  value,
  onChange,
  min,
  helper,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  helper?: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-slate-300">{label}</span>
      <input
        type="number"
        value={value}
        min={min}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 font-semibold text-white outline-none transition focus:border-sky-400"
      />
      {helper && <span className="mt-1 block text-xs text-slate-500">{helper}</span>}
    </label>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { label: string; value: string }[];
}) {
  return (
    <label className="block min-w-[180px]">
      <span className="text-sm font-semibold text-slate-300">{label}</span>
      <div className="relative mt-2">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full appearance-none rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 pr-10 font-semibold text-white outline-none transition focus:border-sky-400"
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown
          size={18}
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
        />
      </div>
    </label>
  );
}

function StatCard({
  label,
  value,
  sublabel,
  icon,
  accent,
}: {
  label: string;
  value: string | number;
  sublabel: string;
  icon: React.ReactNode;
  accent: 'emerald' | 'sky' | 'amber' | 'rose';
}) {
  const styles = {
    emerald: 'text-emerald-300 bg-emerald-400/10 border-emerald-400/20',
    sky: 'text-sky-300 bg-sky-400/10 border-sky-400/20',
    amber: 'text-amber-300 bg-amber-400/10 border-amber-400/20',
    rose: 'text-rose-300 bg-rose-400/10 border-rose-400/20',
  };

  return (
    <div className="rounded-[2rem] border border-white/10 bg-slate-900/80 p-5 shadow-2xl">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-slate-400">{label}</p>
        <div className={`rounded-2xl border p-2 ${styles[accent]}`}>{icon}</div>
      </div>
      <p className="mt-4 text-3xl font-black">{value}</p>
      <p className="mt-1 text-sm text-slate-500">{sublabel}</p>
    </div>
  );
}

function ChartCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[2rem] border border-white/10 bg-slate-900/80 p-6 shadow-2xl">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black">{title}</h2>
          <p className="mt-1 text-sm leading-6 text-slate-400">{description}</p>
        </div>
        <BarChart3 className="text-slate-500" />
      </div>
      {children}
    </section>
  );
}

function InfoPanel({
  title,
  rows,
}: {
  title: string;
  rows: [string, string][];
}) {
  return (
    <section className="rounded-[2rem] border border-white/10 bg-slate-900/80 p-6 shadow-2xl">
      <h2 className="text-xl font-black">{title}</h2>
      <div className="mt-5 space-y-3">
        {rows.map(([label, value]) => (
          <div
            key={label}
            className="flex items-start justify-between gap-4 border-b border-white/10 pb-3 last:border-0 last:pb-0"
          >
            <p className="text-sm text-slate-400">{label}</p>
            <p className="max-w-[60%] text-right text-sm font-bold text-slate-100">
              {value}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

function MiniMetric({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-4">
      <p className="text-xs font-bold uppercase tracking-[0.15em] text-slate-500">
        {label}
      </p>
      <p className="mt-2 font-black text-slate-100">{value}</p>
    </div>
  );
}