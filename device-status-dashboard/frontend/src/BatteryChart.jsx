import { useState, useEffect, useRef } from 'react';

const MAX_HISTORY = 1440; // 24 hours at 1-minute sampling
const SAMPLE_INTERVAL_MS = 60 * 1000; // Store one point per minute

function BatteryChart({ battery, isCharging, batteryCurrent, timestamp, initialHistory }) {
    const [history, setHistory] = useState([]);
    const lastTimestampRef = useRef(null);
    const lastStoredTimeRef = useRef(0);
    const initializedRef = useRef(false);

    // Initialize from server history (runs once when initialHistory arrives)
    useEffect(() => {
        if (initializedRef.current) return;
        if (initialHistory && initialHistory.length > 0) {
            setHistory(initialHistory);
            const lastEntry = initialHistory[initialHistory.length - 1];
            lastStoredTimeRef.current = lastEntry.time || 0;
            initializedRef.current = true;
        }
    }, [initialHistory]);

    // Append new real-time data points
    useEffect(() => {
        if (battery == null || timestamp == null) return;
        // Avoid duplicate entries for the same WebSocket timestamp
        if (lastTimestampRef.current === timestamp) return;
        lastTimestampRef.current = timestamp;

        // Only store a data point if enough time has passed (1 minute)
        const now = Date.now();
        if (lastStoredTimeRef.current !== 0 && now - lastStoredTimeRef.current < SAMPLE_INTERVAL_MS) {
            return;
        }
        lastStoredTimeRef.current = now;

        setHistory((prev) => {
            const next = [...prev, { battery, isCharging, time: timestamp }];
            if (next.length > MAX_HISTORY) {
                return next.slice(next.length - MAX_HISTORY);
            }
            return next;
        });
    }, [battery, isCharging, timestamp]);

    if (history.length < 2) {
        return (
            <div className="battery-chart-container">
                <div className="chart-header">
                    <span className="chart-title">Battery Trend</span>
                </div>
                <div className="chart-empty">Collecting data…</div>
            </div>
        );
    }

    // Chart dimensions
    const W = 400;
    const H = 120;
    const PAD_L = 36;
    const PAD_R = 12;
    const PAD_T = 8;
    const PAD_B = 24;
    const chartW = W - PAD_L - PAD_R;
    const chartH = H - PAD_T - PAD_B;

    // Y axis: 0–100 (battery %)
    const yMin = 0;
    const yMax = 100;
    const toY = (v) => PAD_T + chartH - ((v - yMin) / (yMax - yMin)) * chartH;
    const toX = (i) => PAD_L + (i / (history.length - 1)) * chartW;

    // Build polyline
    const points = history.map((d, i) => `${toX(i)},${toY(d.battery)}`).join(' ');
    // Closed area path for gradient fill
    const areaPath = [
        `M ${toX(0)},${toY(history[0].battery)}`,
        ...history.slice(1).map((d, i) => `L ${toX(i + 1)},${toY(d.battery)}`),
        `L ${toX(history.length - 1)},${PAD_T + chartH}`,
        `L ${toX(0)},${PAD_T + chartH}`,
        'Z',
    ].join(' ');

    // Time labels: first, middle, last
    const fmt = (ts) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const timeLabels = [
        { x: toX(0), label: fmt(history[0].time) },
        { x: toX(Math.floor(history.length / 2)), label: fmt(history[Math.floor(history.length / 2)].time) },
        { x: toX(history.length - 1), label: fmt(history[history.length - 1].time) },
    ];

    // Y axis labels
    const yLabels = [0, 25, 50, 75, 100];

    // Latest value
    const latest = history[history.length - 1];

    // Format current string
    let currentString = '';
    if (batteryCurrent != null) {
        const sign = batteryCurrent > 0 ? '+' : '';
        currentString = `( ${sign}${batteryCurrent}mA )`;
    }

    return (
        <div className="battery-chart-container">
            <div className="chart-header">
                <span className="chart-title">Battery Trend</span>
                <span className="chart-latest">
                    {latest.battery}% {currentString && <span className="chart-current">{currentString}</span>}
                </span>
            </div>
            <svg viewBox={`0 0 ${W} ${H}`} className="battery-chart-svg" preserveAspectRatio="none">
                <defs>
                    <linearGradient id="batteryGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={latest.battery > 20 ? '#10b981' : '#ef4444'} stopOpacity="0.4" />
                        <stop offset="100%" stopColor={latest.battery > 20 ? '#10b981' : '#ef4444'} stopOpacity="0.02" />
                    </linearGradient>
                </defs>

                {/* Horizontal grid lines */}
                {yLabels.map((v) => (
                    <line
                        key={v}
                        x1={PAD_L}
                        y1={toY(v)}
                        x2={W - PAD_R}
                        y2={toY(v)}
                        stroke="rgba(255,255,255,0.06)"
                        strokeWidth="1"
                    />
                ))}

                {/* Y axis labels */}
                {yLabels.map((v) => (
                    <text key={v} x={PAD_L - 6} y={toY(v) + 3} className="chart-axis-label" textAnchor="end">
                        {v}
                    </text>
                ))}

                {/* Area fill */}
                <path d={areaPath} fill="url(#batteryGrad)" />

                {/* Line */}
                <polyline
                    points={points}
                    fill="none"
                    stroke={latest.battery > 20 ? '#10b981' : '#ef4444'}
                    strokeWidth="2"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                />

                {/* Current value dot */}
                <circle
                    cx={toX(history.length - 1)}
                    cy={toY(latest.battery)}
                    r="3"
                    fill={latest.battery > 20 ? '#10b981' : '#ef4444'}
                    className="chart-dot-pulse"
                />

                {/* Time labels */}
                {timeLabels.map((t, i) => (
                    <text
                        key={i}
                        x={t.x}
                        y={H - 4}
                        className="chart-axis-label"
                        textAnchor={i === 0 ? 'start' : i === timeLabels.length - 1 ? 'end' : 'middle'}
                    >
                        {t.label}
                    </text>
                ))}
            </svg>
        </div>
    );
}

export default BatteryChart;
