'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
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
  Plane,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Sparkles,
  TrendingDown,
  Wallet,
  X,
} from 'lucide-react';
import { airports, type Airport } from './data/airports';

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
  total_duration_minutes: number | null;
  extra_duration_minutes: number | null;
  extra_duration_hours: number | null;
  deal_url: string | null;
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
  total_duration_minutes: number | null;
  extra_duration_minutes: number | null;
  extra_duration_hours: number | null;
  deal_url: string | null;
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
type TimelineLabelMode = 'short' | 'monthDay' | 'full' | 'iso';
type WeekdayFilter = 'all' | '0' | '1' | '2' | '3' | '4' | '5' | '6';
type ScanStatus =
  | 'queued'
  | 'running'
  | 'completed'
  | 'failed'
  | 'rejected'
  | 'not_found'
  | null;

const API_BASE = 'http://127.0.0.1:8000';

const weekdayOptions: { label: string; value: WeekdayFilter }[] = [
  { label: 'Any Day', value: 'all' },
  { label: 'Sunday', value: '0' },
  { label: 'Monday', value: '1' },
  { label: 'Tuesday', value: '2' },
  { label: 'Wednesday', value: '3' },
  { label: 'Thursday', value: '4' },
  { label: 'Friday', value: '5' },
  { label: 'Saturday', value: '6' },
];

const chartColors = {
  blue: 'rgba(0, 122, 255, 1)',
  blueFill: 'rgba(0, 122, 255, 0.12)',
  emerald: 'rgba(52, 199, 89, 1)',
  emeraldFill: 'rgba(52, 199, 89, 0.13)',
  amber: 'rgba(255, 159, 10, 1)',
  amberFill: 'rgba(255, 159, 10, 0.14)',
  rose: 'rgba(255, 59, 48, 1)',
  roseFill: 'rgba(255, 59, 48, 0.12)',
  slate: 'rgba(107, 114, 128, 1)',
  grid: 'rgba(17, 24, 39, 0.08)',
  text: 'rgba(55, 65, 81, 0.88)',
};

function getCurrentYear() {
  return new Date().getFullYear();
}

function formatMoney(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return '-';
  return `$${Math.round(value).toLocaleString()}`;
}

function formatDuration(minutes: number | null | undefined) {
  if (minutes === null || minutes === undefined || Number.isNaN(minutes)) {
    return '-';
  }

  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;

  if (hours === 0) return `${mins}m`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
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

function formatTimelineLabel(value: string, mode: TimelineLabelMode) {
  const date = new Date(`${value}T00:00:00`);

  if (mode === 'short') {
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    });
  }

  if (mode === 'monthDay') {
    return date.toLocaleDateString(undefined, {
      month: 'long',
      day: 'numeric',
    });
  }

  if (mode === 'full') {
    return date.toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }

  return value;
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
          maxTicksLimit: 12,
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
  const [originAirport, setOriginAirport] = useState<Airport | null>(null);
  const [destinationAirport, setDestinationAirport] =
    useState<Airport | null>(null);
  const [tripLengthDays, setTripLengthDays] = useState(4);
  const [adults, setAdults] = useState(1);
  const [cheapestLimit, setCheapestLimit] = useState(100);
  const [maxExtraHours, setMaxExtraHours] = useState(0);

  const [prices, setPrices] = useState<FlightPrice[]>([]);
  const [cheapest, setCheapest] = useState<CheapestWindow[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);

  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  const [chartMetric, setChartMetric] = useState<ChartMetric>('min');
  const [groupByMode, setGroupByMode] = useState<GroupByMode>('month');
  const [maxChartPoints, setMaxChartPoints] = useState(365);
  const [timelineLabelMode, setTimelineLabelMode] =
    useState<TimelineLabelMode>('full');
  const [priceCap, setPriceCap] = useState<number>(0);
  const [weekdayFilter, setWeekdayFilter] = useState<WeekdayFilter>('all');
  const [sortMode, setSortMode] = useState<SortMode>('price');
  const [viewMode, setViewMode] = useState<ViewMode>('cards');

  const [scanYear, setScanYear] = useState(getCurrentYear());
  const [scanMaxWindows, setScanMaxWindows] = useState(365);
  const [scanMaxWorkers, setScanMaxWorkers] = useState(2);
  const [scanHeadless, setScanHeadless] = useState(true);
  const [scanSlowMo, setScanSlowMo] = useState(0);
  const [scanStatus, setScanStatus] = useState<ScanStatus>(null);
  const [activeScanId, setActiveScanId] = useState<string | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanLoading, setScanLoading] = useState(false);

  const origin = originAirport?.code ?? '';
  const destination = destinationAirport?.code ?? '';
  const selectedRouteLabel =
    origin && destination ? `${origin} → ${destination}` : 'Select a route';
  const routeIsReady = Boolean(originAirport && destinationAirport);
  const selectedWeekdayLabel =
    weekdayOptions.find((option) => option.value === weekdayFilter)?.label ??
    'Any Day';

  async function loadData() {
    if (!originAirport || !destinationAirport) {
      setHasSearched(false);
      setApiError('Choose both origin and destination airports first.');
      return;
    }

    setLoading(true);
    setApiError(null);
    setHasSearched(true);

    const params = new URLSearchParams({
      origin: origin.trim().toUpperCase(),
      destination: destination.trim().toUpperCase(),
      trip_length_days: String(tripLengthDays),
      adults: String(adults),
    });

    if (maxExtraHours > 0) {
      params.set('max_extra_hours', String(maxExtraHours));
    }

    try {
      const [pricesRes, cheapestRes, summaryRes] = await Promise.all([
        fetch(`${API_BASE}/prices?${params.toString()}&limit=5000`),
        fetch(
          `${API_BASE}/prices/cheapest?${params.toString()}&limit=500`
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

  async function startScan() {
    if (!originAirport || !destinationAirport) {
      setScanError('Choose both origin and destination airports first.');
      return;
    }

    setScanLoading(true);
    setScanError(null);
    setScanStatus('queued');

    const destinationCode = destination.trim().toUpperCase();
    const originCode = origin.trim().toUpperCase();

    try {
      const response = await fetch(`${API_BASE}/scan/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          origin_code: originCode,
          origin_text: getAirportScannerText(originAirport),

          destination_code: destinationCode,
          destination_select_text: getAirportScannerText(destinationAirport),

          year: scanYear,
          trip_length_days: tripLengthDays,
          adults,

          max_windows: scanMaxWindows > 0 ? scanMaxWindows : null,
          max_workers: scanMaxWorkers,

          headless: scanHeadless,
          slow_mo: scanSlowMo,

          min_valid_price: 100,
          max_valid_price: 6000,

          debug_dir: 'flight_scanner_debug',
        }),
      });

      if (!response.ok) {
        throw new Error('Could not start scanner.');
      }

      const job = await response.json();

      if (job.status === 'rejected') {
        setScanStatus('rejected');
        setScanError(job.error ?? 'A scan is already running.');
        return;
      }

      setActiveScanId(job.scan_id);
      setScanStatus(job.status ?? 'queued');
    } catch (error) {
      console.error(error);
      setScanError('Could not start the scanner. Check the FastAPI server logs.');
      setScanStatus('failed');
    } finally {
      setScanLoading(false);
    }
  }

  useEffect(() => {
    if (!activeScanId) return;

    const interval = window.setInterval(async () => {
      try {
        const response = await fetch(`${API_BASE}/scan/status/${activeScanId}`);

        if (!response.ok) {
          throw new Error('Could not fetch scan status.');
        }

        const job = await response.json();
        setScanStatus(job.status);

        if (job.status === 'completed') {
          window.clearInterval(interval);
          setActiveScanId(null);
          await loadData();
        }

        if (job.status === 'failed') {
          window.clearInterval(interval);
          setActiveScanId(null);
          setScanError(job.error ?? 'Scanner failed.');
        }

        if (job.status === 'not_found') {
          window.clearInterval(interval);
          setActiveScanId(null);
          setScanError('Could not find the active scanner job.');
        }
      } catch (error) {
        console.error(error);
        window.clearInterval(interval);
        setActiveScanId(null);
        setScanStatus('failed');
        setScanError('Lost connection while checking scanner status.');
      }
    }, 3000);

    return () => window.clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeScanId]);

  const validPrices = useMemo(() => {
    return prices
      .filter((p) => p.status === 'success' && p.cheapest_price_usd !== null)
      .map((p) => ({
        ...p,
        cheapest_price_usd: p.cheapest_price_usd as number,
      }))
      .filter((p) =>
        weekdayFilter === 'all'
          ? true
          : getWeekdayIndex(p.depart_date) === Number(weekdayFilter)
      )
      .filter((p) => (priceCap > 0 ? p.cheapest_price_usd <= priceCap : true))
      .sort(
        (a, b) =>
          new Date(a.depart_date).getTime() - new Date(b.depart_date).getTime()
      );
  }, [prices, priceCap, weekdayFilter]);

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

    const volatilityDeal = avg !== null ? avg - 0.5 * std : null;

    const dealThreshold =
      p25 !== null && volatilityDeal !== null
        ? Math.min(p25, volatilityDeal)
        : p25 ?? volatilityDeal;

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
      .filter((row) =>
        weekdayFilter === 'all'
          ? true
          : getWeekdayIndex(row.depart_date) === Number(weekdayFilter)
      )
      .sort(
        (a, b) =>
          (a.cheapest_price_usd ?? 0) - (b.cheapest_price_usd ?? 0)
      )[0];
  }, [cheapest, weekdayFilter]);

  const worstWindow = useMemo(() => {
    return [...validPrices].sort(
      (a, b) => b.cheapest_price_usd - a.cheapest_price_usd
    )[0];
  }, [validPrices]);

  const consumerAdvice = useMemo(() => {
    if (
      !bestWindow ||
      analytics.avg === null ||
      bestWindow.cheapest_price_usd === null
    ) {
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
        detail: `${formatLongDate(
          bestWindow.depart_date
        )} is about ${savingsPct}% below average.`,
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
          item.prices.reduce((sum, value) => sum + value, 0) /
            item.prices.length
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
          item.prices.reduce((sum, value) => sum + value, 0) /
            item.prices.length
        ),
        median: Math.round(median(item.prices) ?? 0),
        max: Math.max(...item.prices),
        count: item.prices.length,
      }))
      .sort((a, b) => a.sortIndex - b.sortIndex);
  }, [validPrices, groupByMode]);

  const priceTimeline = useMemo(() => {
    return validPrices.slice(0, maxChartPoints).map((row) => ({
      label: formatTimelineLabel(row.depart_date, timelineLabelMode),
      price: row.cheapest_price_usd,
      departDate: row.depart_date,
      returnDate: row.return_date,
    }));
  }, [validPrices, maxChartPoints, timelineLabelMode]);

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
    const rows = cheapest
      .filter((row) => row.cheapest_price_usd !== null)
      .filter((row) =>
        weekdayFilter === 'all'
          ? true
          : getWeekdayIndex(row.depart_date) === Number(weekdayFilter)
      );

    return [...rows].sort((a, b) => {
      if (sortMode === 'date') {
        return (
          new Date(a.depart_date).getTime() -
          new Date(b.depart_date).getTime()
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
  }, [cheapest, sortMode, analytics.avg, weekdayFilter]);

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
        : priceValues.filter((price) => price <= analytics.dealThreshold!)
            .length;

    const mid =
      analytics.dealThreshold === null || analytics.p75 === null
        ? 0
        : priceValues.filter(
            (price) =>
              price > analytics.dealThreshold! && price <= analytics.p75!
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
          borderColor: [
            chartColors.emerald,
            chartColors.blue,
            chartColors.rose,
          ],
          borderWidth: 2,
        },
      ],
    };
  }, [priceValues, analytics.dealThreshold, analytics.p75]);

  const hasData = validPrices.length > 0;
  const scanIsActive =
    scanStatus === 'queued' || scanStatus === 'running' || scanLoading;

  return (
    <main className="min-h-screen px-4 py-5 text-slate-950 md:px-8">
      <div className="mx-auto max-w-[1500px] space-y-5">
        <header className="rounded-[28px] border border-white/80 bg-white/75 p-5 shadow-[0_24px_80px_rgba(15,23,42,0.10)] backdrop-blur-2xl md:p-7">
          <div className="flex flex-col justify-between gap-6 xl:flex-row xl:items-end">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50/80 px-3 py-1.5 text-sm font-semibold text-slate-700">
                <Plane size={18} />
                Flight Scanner
              </div>

              <h1 className="mt-5 max-w-4xl text-4xl font-semibold tracking-tight text-slate-950 md:text-6xl">
                Find the best time to fly, not just the cheapest row.
              </h1>

              <p className="mt-4 max-w-3xl text-base leading-7 text-slate-600 md:text-lg">
                Compare route prices like a shopper: best dates, cheapest months,
                price spread, fare distribution, and deal thresholds for{' '}
                <span className="font-semibold text-slate-950">
                  {selectedRouteLabel}
                </span>
                .
              </p>
            </div>

            <button
              onClick={loadData}
              disabled={!routeIsReady}
              className="inline-flex items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-900 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
              {loading ? 'Refreshing...' : 'Refresh Data'}
            </button>
          </div>

          <section className="relative z-10 mt-7 rounded-[22px] border border-slate-200/80 bg-slate-50/80 p-4">
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] lg:items-end">
              <div>
                <AirportAutocomplete
                  label="From"
                  selected={originAirport}
                  onSelect={setOriginAirport}
                  placeholder="Search airport, city, or code"
                />
              </div>
              <div>
                <AirportAutocomplete
                  label="To"
                  selected={destinationAirport}
                  onSelect={setDestinationAirport}
                  placeholder="Search airport, city, or code"
                />
              </div>
              <div className="flex items-start lg:min-w-[180px]">
                <button
                  onClick={loadData}
                  disabled={!routeIsReady}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#007aff] px-5 py-3 text-sm font-semibold text-white shadow-sm shadow-blue-500/20 transition hover:bg-[#006ee6] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Search size={18} />
                  Search
                </button>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
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
              <SelectField
                label="Depart Day"
                value={weekdayFilter}
                onChange={(value) => setWeekdayFilter(value as WeekdayFilter)}
                options={weekdayOptions}
              />
              <NumberField
                label="Price Cap"
                value={priceCap}
                onChange={setPriceCap}
                min={0}
                helper="0 = no cap"
              />
              <NumberField
                label="Max Extra Hrs"
                value={maxExtraHours}
                onChange={setMaxExtraHours}
                min={0}
                helper="0 = any"
              />
            </div>
          </section>
        </header>

        <section className="rounded-[28px] border border-white/80 bg-white/70 p-5 shadow-[0_18px_60px_rgba(15,23,42,0.08)] backdrop-blur-2xl">
          <div className="flex flex-col justify-between gap-5 xl:flex-row xl:items-end">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm font-semibold text-emerald-700">
                <Activity size={17} />
                Scanner Control
              </div>

              <h2 className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">Run a new fare scan</h2>

              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                Kick off the backend scanner for the selected route. The scanner
                writes to SQLite, and this dashboard refreshes automatically when
                the job completes.
              </p>
            </div>

            <div className="grid w-full grid-cols-1 gap-3 md:grid-cols-2 xl:max-w-4xl xl:grid-cols-5">
              <NumberField
                label="Scan Year"
                value={scanYear}
                onChange={setScanYear}
                min={2024}
              />
              <NumberField
                label="Max Windows"
                value={scanMaxWindows}
                onChange={setScanMaxWindows}
                min={0}
                helper="0 = all"
              />
              <NumberField
                label="Workers"
                value={scanMaxWorkers}
                onChange={setScanMaxWorkers}
                min={1}
                helper="2 is safer"
              />
              <NumberField
                label="Slow Mo"
                value={scanSlowMo}
                onChange={setScanSlowMo}
                min={0}
                helper="ms delay"
              />

              <div className="flex items-start pt-7">
                <button
                  onClick={startScan}
                  disabled={scanIsActive || !routeIsReady}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#34c759] px-5 py-3 text-sm font-semibold text-white shadow-sm shadow-emerald-500/20 transition hover:bg-[#2fb350] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <RefreshCw
                    size={18}
                    className={scanIsActive ? 'animate-spin' : ''}
                  />
                  {scanIsActive ? 'Scanner Running' : 'Start Scan'}
                </button>
              </div>
            </div>
          </div>

          <div className="mt-5 flex flex-col gap-3 rounded-[20px] border border-slate-200/80 bg-slate-50/80 p-4 md:flex-row md:items-center md:justify-between">
            <label className="flex items-center gap-3 text-sm font-semibold text-slate-700">
              <input
                type="checkbox"
                checked={scanHeadless}
                onChange={(e) => setScanHeadless(e.target.checked)}
                className="h-4 w-4 accent-[#34c759]"
              />
              Run headless
            </label>

            <div className="flex flex-col gap-1 md:items-end">
              <p className="text-sm text-slate-600">
                Status:{' '}
                <span className="font-semibold text-emerald-600">
                  {scanStatus ?? 'idle'}
                </span>
              </p>

              {activeScanId && (
                <p className="text-xs text-slate-500">Scan ID: {activeScanId}</p>
              )}

              {scanError && (
                <p className="text-sm font-semibold text-red-600">
                  {scanError}
                </p>
              )}
            </div>
          </div>
        </section>

        {apiError && (
          <section className="rounded-[24px] border border-red-200 bg-red-50 p-6 text-red-700 shadow-sm">
            <div className="flex items-center gap-3">
              <AlertCircle />
              <p>{apiError}</p>
            </div>
          </section>
        )}

        {!loading && !apiError && hasSearched && !hasData && (
          <section className="rounded-[28px] border border-white/80 bg-white/70 p-10 text-center shadow-[0_18px_60px_rgba(15,23,42,0.08)] backdrop-blur-2xl">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">
              No Flight Data
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
              No stored scan data exists for this route.
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-slate-600">
              Run your scanner for {selectedRouteLabel} with a {tripLengthDays}-day trip and{' '}
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
                    [
                      'Route',
                      selectedRouteLabel,
                    ],
                    ['Trip Length', `${tripLengthDays} days`],
                    ['Adults', `${adults}`],
                    ['Departure Day', selectedWeekdayLabel],
                    [
                      'Extra Time Filter',
                      maxExtraHours > 0 ? `${maxExtraHours} hours` : 'Any',
                    ],
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
                        `${formatLongDate(
                          worstWindow.depart_date
                        )} → ${formatLongDate(worstWindow.return_date)}`,
                      ],
                      ['Scanned', formatDateTime(worstWindow.scanned_at)],
                    ]}
                  />
                )}
              </div>
            </section>

            <section className="rounded-[28px] border border-white/80 bg-white/70 p-5 shadow-[0_18px_60px_rgba(15,23,42,0.08)] backdrop-blur-2xl">
              <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
                <div>
                  <div className="flex items-center gap-2 text-blue-600">
                    <SlidersHorizontal size={18} />
                    <p className="text-sm font-semibold uppercase tracking-[0.16em]">
                      Chart Controls
                    </p>
                  </div>
                  <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
                    Configure the dashboard view
                  </h2>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
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
                  <SelectField
                    label="Date Labels"
                    value={timelineLabelMode}
                    onChange={(value) =>
                      setTimelineLabelMode(value as TimelineLabelMode)
                    }
                    options={[
                      { label: 'Short: Jan 5', value: 'short' },
                      { label: 'Long: January 5', value: 'monthDay' },
                      { label: 'Full: Mon, Jan 5, 2026', value: 'full' },
                      { label: 'ISO: 2026-01-05', value: 'iso' },
                    ]}
                  />
                  <NumberField
                    label="Timeline Days"
                    value={maxChartPoints}
                    onChange={setMaxChartPoints}
                    min={30}
                  />
                </div>
              </div>
            </section>

            <section className="grid grid-cols-1 gap-6 xl:grid-cols-2">
              <ChartCard
                title="Rest-of-Year Fare Outlook"
                description="Price by departure date with average and deal-threshold lines."
              >
                <div className="h-[390px]">
                  <Line
                    data={timelineChartData}
                    options={chartOptions('Price')}
                  />
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
                  <Bar
                    data={monthRankChartData}
                    options={chartOptions('Price')}
                  />
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

              <div className="xl:col-span-2 rounded-[28px] border border-white/80 bg-white/70 p-6 shadow-[0_18px_60px_rgba(15,23,42,0.08)] backdrop-blur-2xl">
                <div className="mb-5 flex flex-col justify-between gap-4 md:flex-row md:items-center">
                  <div>
                    <h2 className="text-2xl font-semibold tracking-tight text-slate-950">Best Travel Windows</h2>
                    <p className="mt-1 text-sm text-slate-600">
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

                <div className="mb-4 flex justify-end">
                  <div className="w-full sm:w-[160px]">
                    <NumberField
                      label="Rows"
                      value={cheapestLimit}
                      onChange={setCheapestLimit}
                      min={1}
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
                  <div className="max-h-[620px] overflow-auto rounded-[18px] border border-slate-200 bg-white">
                    <table className="w-full border-collapse text-left text-sm">
                      <thead className="sticky top-0 bg-slate-50 text-slate-600">
                        <tr>
                          <th className="px-4 py-3">Rank</th>
                          <th className="px-4 py-3">Depart</th>
                          <th className="px-4 py-3">Return</th>
                          <th className="px-4 py-3">Duration</th>
                          <th className="px-4 py-3">Extra Time</th>
                          <th className="px-4 py-3">Price</th>
                          <th className="px-4 py-3">Savings vs Avg</th>
                          <th className="px-4 py-3">Scans</th>
                          <th className="px-4 py-3">Deal</th>
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
                                className="border-t border-slate-100"
                              >
                                <td className="px-4 py-3 text-slate-500">
                                  #{index + 1}
                                </td>
                                <td className="px-4 py-3">
                                  {formatLongDate(row.depart_date)}
                                </td>
                                <td className="px-4 py-3">
                                  {formatLongDate(row.return_date)}
                                </td>
                                <td className="px-4 py-3">
                                  {formatDuration(row.total_duration_minutes)}
                                </td>
                                <td className="px-4 py-3">
                                  {formatDuration(row.extra_duration_minutes)}
                                </td>
                                <td className="px-4 py-3 font-semibold text-emerald-600">
                                  {formatMoney(row.cheapest_price_usd)}
                                </td>
                                <td className="px-4 py-3 text-blue-600">
                                  {savings !== null && savings > 0
                                    ? formatMoney(savings)
                                    : '-'}
                                </td>
                                <td className="px-4 py-3">
                                  {row.observation_count}
                                </td>
                                <td className="px-4 py-3">
                                  {row.deal_url ? (
                                    <a
                                      href={row.deal_url}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="font-semibold text-blue-600 transition hover:text-blue-500"
                                    >
                                      Open
                                    </a>
                                  ) : (
                                    '-'
                                  )}
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
                  ['Departure Day Filter', selectedWeekdayLabel],
                  ['Displayed After Filters', `${validPrices.length}`],
                ]}
              />

              <InfoPanel
                title="Consumer Notes"
                rows={[
                  [
                    'Best Month',
                    [...bestMonths].sort((a, b) => a.min - b.min)[0]?.label ??
                      '-',
                  ],
                  ['Cheapest Threshold', formatMoney(analytics.dealThreshold)],
                  ['Good Deal Count', `${analytics.dealCount} windows`],
                  ['Use Case', 'Compare date windows before booking'],
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
    <section className="relative overflow-hidden rounded-[28px] border border-white/80 bg-white/75 p-6 shadow-[0_18px_60px_rgba(15,23,42,0.08)] backdrop-blur-2xl md:p-8">
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#34c759] via-[#007aff] to-[#ff9f0a]" />
      <div className="relative">
        <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-start">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm font-semibold text-emerald-700">
              <Sparkles size={17} />
              {consumerAdvice.headline}
            </div>

            <h2 className="mt-5 text-3xl font-semibold tracking-tight text-slate-950 md:text-5xl">
              {bestWindow
                ? `${formatLongDate(bestWindow.depart_date)} → ${formatLongDate(
                    bestWindow.return_date
                  )}`
                : 'No best window yet'}
            </h2>

            <p className="mt-4 max-w-2xl text-slate-600">
              {consumerAdvice.detail}
            </p>
          </div>

          <div className="rounded-[22px] border border-slate-200 bg-slate-50/85 p-5 text-left lg:min-w-[260px]">
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">
              Best Price
            </p>
            <p className="mt-2 text-5xl font-semibold tracking-tight text-emerald-600">
              {formatMoney(bestWindow?.cheapest_price_usd)}
            </p>
            <p className="mt-3 text-sm text-slate-500">
              {savings !== null && savings > 0
                ? `${formatMoney(savings)} below average`
                : 'Compare against more scans'}
            </p>
          </div>
        </div>

        <div className="mt-8 grid grid-cols-1 gap-3 md:grid-cols-3">
          <MiniMetric label="Average Fare" value={formatMoney(analytics.avg)} />
          <MiniMetric
            label="Travel Duration"
            value={formatDuration(bestWindow?.total_duration_minutes)}
          />
          <MiniMetric
            label="Extra Time"
            value={formatDuration(bestWindow?.extra_duration_minutes)}
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
    <div className="rounded-[22px] border border-slate-200 bg-white/85 p-5 shadow-sm transition hover:border-blue-200 hover:shadow-md">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            Option #{rank}
          </p>
          <h3 className="mt-2 text-lg font-semibold text-slate-950">
            {formatLongDate(row.depart_date)}
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            Return {formatLongDate(row.return_date)}
          </p>
        </div>

        <p className="rounded-full bg-emerald-50 px-4 py-2 text-xl font-semibold text-emerald-600">
          {formatMoney(row.cheapest_price_usd)}
        </p>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3">
        <MiniMetric
          label="Duration"
          value={formatDuration(row.total_duration_minutes)}
        />
        <MiniMetric
          label="Extra"
          value={formatDuration(row.extra_duration_minutes)}
        />
        <MiniMetric
          label="Savings"
          value={savings !== null && savings > 0 ? formatMoney(savings) : '-'}
        />
      </div>

      <p className="mt-4 text-xs text-slate-500">
        {row.observation_count} scan{row.observation_count === 1 ? '' : 's'}.
        Last scanned {formatDateTime(row.last_scanned_at)}
      </p>

      {row.deal_url && (
        <a
          href={row.deal_url}
          target="_blank"
          rel="noreferrer"
          className="mt-4 inline-flex w-full items-center justify-center rounded-full border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-600 transition hover:bg-blue-100"
        >
          Open Deal
        </a>
      )}
    </div>
  );
}

function formatAirportOption(airport: Airport) {
  const city = airport.city ? `${airport.city}, ` : '';
  return `${airport.code} - ${city}${airport.country}`;
}

function getAirportScannerText(airport: Airport) {
  const name = airport.name || airport.city || airport.code;
  return `${name} ${airport.code}`;
}

function AirportAutocomplete({
  label,
  selected,
  onSelect,
  placeholder,
}: {
  label: string;
  selected: Airport | null;
  onSelect: (airport: Airport | null) => void;
  placeholder: string;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<Record<string, number | string>>(
    {}
  );

  useEffect(() => {
    setQuery(selected ? selected.code : '');
  }, [selected]);

  function syncMenuPosition() {
    const input = inputRef.current;
    if (!input) return;

    const rect = input.getBoundingClientRect();
    const viewportPadding = 16;
    const preferredWidth = Math.max(rect.width, 360);
    const availableWidth = window.innerWidth - rect.left - viewportPadding;

    setMenuStyle({
      left: Math.max(viewportPadding, rect.left),
      top: rect.bottom + 8,
      width: Math.min(preferredWidth, availableWidth),
      maxHeight: Math.max(220, window.innerHeight - rect.bottom - 24),
    });
  }

  useEffect(() => {
    if (!isOpen) return;

    syncMenuPosition();
    window.addEventListener('resize', syncMenuPosition);
    window.addEventListener('scroll', syncMenuPosition, true);

    return () => {
      window.removeEventListener('resize', syncMenuPosition);
      window.removeEventListener('scroll', syncMenuPosition, true);
    };
  }, [isOpen, query]);

  const matches = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized || selected) return [];

    return airports
      .filter((airport) => {
        const haystack = [
          airport.code,
          airport.name,
          airport.city,
          airport.country,
          airport.type,
        ]
          .join(' ')
          .toLowerCase();

        return haystack.includes(normalized);
      })
      .sort((a, b) => {
        const upper = query.trim().toUpperCase();
        const aCodeMatch = a.code.startsWith(upper) ? 0 : 1;
        const bCodeMatch = b.code.startsWith(upper) ? 0 : 1;
        const aScheduled = a.scheduled ? 0 : 1;
        const bScheduled = b.scheduled ? 0 : 1;

        return (
          aCodeMatch - bCodeMatch ||
          aScheduled - bScheduled ||
          a.code.localeCompare(b.code)
        );
      })
      .slice(0, 10);
  }, [query, selected]);

  function updateQuery(value: string) {
    setQuery(value);
    setIsOpen(true);
    window.requestAnimationFrame(syncMenuPosition);
    onSelect(null);
  }

  function chooseAirport(airport: Airport) {
    onSelect(airport);
    setIsOpen(false);
  }

  return (
    <div className="relative">
      <label className="block">
        <span className="text-sm font-semibold text-slate-600">{label}</span>
        <input
          value={query}
          ref={inputRef}
          onChange={(e) => updateQuery(e.target.value)}
          onFocus={() => {
            setIsOpen(true);
            window.requestAnimationFrame(syncMenuPosition);
          }}
          onBlur={() => window.setTimeout(() => setIsOpen(false), 120)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && matches[0]) {
              event.preventDefault();
              chooseAirport(matches[0]);
            }
          }}
          placeholder={placeholder}
          className="mt-2 w-full rounded-[14px] border border-slate-200 bg-white px-4 py-3 font-semibold text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-[#007aff] focus:ring-4 focus:ring-blue-500/10"
        />
      </label>

      {selected && (
        <button
          type="button"
          onClick={() => onSelect(null)}
          className="absolute right-3 top-[38px] rounded-full p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
          aria-label={`Clear ${label}`}
        >
          <X size={16} />
        </button>
      )}

      {isOpen && matches.length > 0 && (
        <div
          style={menuStyle}
          className="fixed z-[9999] overflow-auto rounded-[18px] border border-slate-200 bg-white p-1 shadow-[0_18px_45px_rgba(15,23,42,0.14)]"
        >
          {matches.map((airport) => (
            <button
              key={airport.code}
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => chooseAirport(airport)}
              className="block w-full rounded-[14px] px-3 py-3 text-left transition hover:bg-slate-50"
            >
              <span className="flex items-center justify-between gap-3">
                <span className="text-sm font-semibold text-slate-950">
                  {airport.name}
                </span>
                <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-600">
                  {airport.code}
                </span>
              </span>
              <span className="mt-1 block text-xs text-slate-500">
                {formatAirportOption(airport)}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
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
      <span className="text-sm font-semibold text-slate-600">{label}</span>
      <input
        type="number"
        value={value}
        min={min}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-2 w-full rounded-[14px] border border-slate-200 bg-white px-4 py-3 font-semibold text-slate-950 outline-none transition focus:border-[#007aff] focus:ring-4 focus:ring-blue-500/10"
      />
      {helper && (
        <span className="mt-1 block text-xs text-slate-500">{helper}</span>
      )}
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
      <span className="text-sm font-semibold text-slate-600">{label}</span>
      <div className="relative mt-2">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full appearance-none rounded-[14px] border border-slate-200 bg-white px-4 py-3 pr-10 font-semibold text-slate-950 outline-none transition focus:border-[#007aff] focus:ring-4 focus:ring-blue-500/10"
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown
          size={18}
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-500"
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
    emerald: 'text-emerald-600 bg-emerald-50 border-emerald-100',
    sky: 'text-blue-600 bg-blue-50 border-blue-100',
    amber: 'text-amber-600 bg-amber-50 border-amber-100',
    rose: 'text-red-600 bg-red-50 border-red-100',
  };

  return (
    <div className="rounded-[24px] border border-white/80 bg-white/70 p-5 shadow-[0_14px_40px_rgba(15,23,42,0.07)] backdrop-blur-2xl">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-slate-500">{label}</p>
        <div className={`rounded-[14px] border p-2 ${styles[accent]}`}>{icon}</div>
      </div>
      <p className="mt-4 text-3xl font-semibold tracking-tight text-slate-950">{value}</p>
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
    <section className="rounded-[28px] border border-white/80 bg-white/70 p-6 shadow-[0_18px_60px_rgba(15,23,42,0.08)] backdrop-blur-2xl">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-slate-950">{title}</h2>
          <p className="mt-1 text-sm leading-6 text-slate-600">{description}</p>
        </div>
        <BarChart3 className="text-slate-400" />
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
    <section className="rounded-[28px] border border-white/80 bg-white/70 p-6 shadow-[0_18px_60px_rgba(15,23,42,0.08)] backdrop-blur-2xl">
      <h2 className="text-xl font-semibold tracking-tight text-slate-950">{title}</h2>
      <div className="mt-5 space-y-3">
        {rows.map(([label, value]) => (
          <div
            key={label}
            className="flex items-start justify-between gap-4 border-b border-slate-200/80 pb-3 last:border-0 last:pb-0"
          >
            <p className="text-sm text-slate-500">{label}</p>
            <p className="max-w-[60%] text-right text-sm font-semibold text-slate-900">
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
    <div className="rounded-[18px] border border-slate-200 bg-slate-50/85 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.13em] text-slate-500">
        {label}
      </p>
      <p className="mt-2 font-semibold text-slate-950">{value}</p>
    </div>
  );
}
