import { useState, useEffect, useRef } from 'react';

const MAX_HISTORY = 60; // Keep 60 data points (~ 2 minutes at 2s intervals)

function BatteryChart({ battery, isCharging, timestamp }) {
    const [history, setHistory] = useState([]);
    const lastTimestampRef = useRef(null);

    useEffect(() => {
        if (battery == null || timestamp == null) return;
        // Avoid duplicate entries for the same timestamp
        if (lastTimestampRef.current === timestamp) return;
        lastTimestampRef.current = timestamp;

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
    const fmt = (ts) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const timeLabels = [
        { x: toX(0), label: fmt(history[0].time) },
        { x: toX(Math.floor(history.length / 2)), label: fmt(history[Math.floor(history.length / 2)].time) },
        { x: toX(history.length - 1), label: fmt(history[history.length - 1].time) },
    ];

    // Y axis labels
    const yLabels = [0, 25, 50, 75, 100];

    // Latest value
    const latest = history[history.length - 1];

    return (
        <div className="battery-chart-container">
            <div className="chart-header">
                <span className="chart-title">Battery Trend</span>
                <span className="chart-latest">{latest.battery}%</span>
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
