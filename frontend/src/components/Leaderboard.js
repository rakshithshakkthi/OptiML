'use client';

import React, { useState, useEffect } from 'react';
import { Award, BarChart4, Trophy, TrendingUp, Info } from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer,
  Cell
} from 'recharts';

export default function Leaderboard({ leaderboard, featureImportances }) {
  const [mounted, setMounted] = useState(false);

  // Prevent SSR issues with Recharts
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <div style={{ height: '300px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Loading Charts...</div>;
  }

  // Pre-seed chart data
  const accuracyChartData = leaderboard.map(item => ({
    name: item.model,
    Accuracy: parseFloat((item.accuracy * 100).toFixed(2)),
    F1: parseFloat((item.f1 * 100).toFixed(2)),
    AUC: parseFloat((item.roc_auc * 100).toFixed(2))
  }));

  const importanceChartData = featureImportances.slice(0, 10).map(item => ({
    name: item.feature,
    Attribution: parseFloat((item.importance * 100).toFixed(2))
  }));

  return (
    <div className="grid-2">
      {/* Ranked Table */}
      <div className="panel" style={{ gridColumn: 'span 2', border: '1px solid var(--border-color)' }}>
        <div className="panel-title-row">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontFamily: 'var(--font-display)', fontSize: '2rem', fontWeight: '400', margin: 0 }}>
            <Trophy size={20} style={{ color: 'var(--accent-color)' }} />
            Performance Leaderboard & Evaluation Metrics
          </h3>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
            Ranked by stratified hold-out cross-validation accuracy
          </span>
        </div>

        <div className="table-container" style={{ border: '1px solid var(--border-color)' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: '60px' }}>Rank</th>
                <th>Model Architecture</th>
                <th>Validation Accuracy</th>
                <th>Weighted F1-Score</th>
                <th>ROC-AUC Score</th>
                <th>Fit Time (Seconds)</th>
              </tr>
            </thead>
            <tbody>
              {leaderboard.map((model, idx) => (
                <tr 
                  key={model.model}
                  style={{
                    backgroundColor: idx === 0 ? 'var(--accent-light)' : 'transparent',
                    borderLeft: idx === 0 ? '4px solid var(--accent-color)' : 'none'
                  }}
                >
                  <td style={{ fontWeight: '700', paddingLeft: idx === 0 ? '0.75rem' : '1rem', color: idx === 0 ? 'var(--accent-color)' : 'var(--text-primary)' }}>
                    {idx + 1}
                  </td>
                  <td style={{ fontWeight: idx === 0 ? '700' : '500', color: 'var(--text-primary)' }}>
                    {model.model} {idx === 0 && <span style={{ fontSize: '9px', backgroundColor: 'var(--accent-color)', color: '#ffffff', padding: '2px 6px', borderRadius: '4px', marginLeft: '0.5rem', fontWeight: '700', letterSpacing: '0.05em' }}>OPTIMAL PIPELINE</span>}
                  </td>
                  <td style={{ fontWeight: '700', color: idx === 0 ? 'var(--accent-color)' : 'var(--text-primary)' }}>
                    {(model.accuracy * 100).toFixed(2)}%
                  </td>
                  <td>{(model.f1 * 100).toFixed(2)}%</td>
                  <td>{(model.roc_auc * 100).toFixed(2)}%</td>
                  <td style={{ color: 'var(--text-muted)' }}>{model.train_time.toFixed(3)}s</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Accuracy Comparison Chart */}
      <div className="panel" style={{ border: '1px solid var(--border-color)' }}>
        <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.75rem', fontWeight: '400', margin: 0 }}>Model Evaluation Metrics Comparison</h3>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '1.25rem', marginTop: '4px' }}>
          Comparative evaluation across hold-out validation set metrics.
        </p>

        <div className="chart-box">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={accuracyChartData}
              margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
              <XAxis dataKey="name" stroke="var(--text-secondary)" fontSize={10} tickLine={false} />
              <YAxis stroke="var(--text-secondary)" fontSize={10} domain={[0, 100]} />
              <Tooltip 
                contentStyle={{
                  backgroundColor: 'var(--bg-secondary)',
                  borderColor: 'var(--border-color)',
                  color: 'var(--text-primary)',
                  borderRadius: '8px'
                }}
              />
              <Legend verticalAlign="top" height={36} wrapperStyle={{ fontSize: '11px', fontWeight: '600' }} />
              <Bar dataKey="Accuracy" fill="var(--accent-color)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="F1" fill="#FF8C00" radius={[4, 4, 0, 0]} />
              <Bar dataKey="AUC" fill="#FFB347" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Feature Importance Chart */}
      <div className="panel" style={{ border: '1px solid var(--border-color)' }}>
        <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontFamily: 'var(--font-display)', fontSize: '1.75rem', fontWeight: '400', margin: 0 }}>
          <TrendingUp size={18} style={{ color: 'var(--accent-color)' }} />
          Feature Attribution Weightings
        </h3>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '1.25rem', marginTop: '4px' }}>
          Normalized feature importance scores extracted from the best-performing pipeline configuration.
        </p>

        <div className="chart-box">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={importanceChartData}
              layout="vertical"
              margin={{ top: 10, right: 15, left: 10, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" horizontal={false} />
              <XAxis type="number" stroke="var(--text-secondary)" fontSize={10} domain={[0, 'auto']} />
              <YAxis dataKey="name" type="category" stroke="var(--text-secondary)" fontSize={10} width={80} tickLine={false} />
              <Tooltip 
                contentStyle={{
                  backgroundColor: 'var(--bg-secondary)',
                  borderColor: 'var(--border-color)',
                  color: 'var(--text-primary)',
                  borderRadius: '8px'
                }}
                formatter={(value) => [`${value}%`, 'Attribution']}
              />
              <Bar dataKey="Attribution" fill="var(--accent-color)" radius={[0, 4, 4, 0]}>
                {importanceChartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={index === 0 ? 'var(--accent-color)' : '#FFB347'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
