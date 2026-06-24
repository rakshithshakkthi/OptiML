'use client';

import React, { useState } from 'react';
import { Table, Eye, Search, Settings } from 'lucide-react';

export default function DataPreview({ uploadInfo, onAnalyzeComplete }) {
  const [targetColumn, setTargetColumn] = useState(uploadInfo.default_target || uploadInfo.columns[uploadInfo.columns.length - 1] || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleAnalyze = async () => {
    setLoading(true);
    setError('');

    try {
      const response = await fetch('http://127.0.0.1:8000/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          job_id: uploadInfo.job_id,
          target_column: targetColumn,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Analysis profiling failed.');
      }

      const results = await response.json();
      onAnalyzeComplete(results, targetColumn);
    } catch (err) {
      setError(err.message || 'An error occurred during analysis.');
    } finally {
      setLoading(false);
    }
  };

  const featureColumns = uploadInfo.columns.filter(col => col !== targetColumn);

  return (
    <div className="grid-2" style={{ gridTemplateColumns: '1fr', gap: '1.5rem' }}>
      <div className="panel" style={{ border: '1px solid var(--border-color)' }}>
        <div className="panel-title-row" style={{ display: 'flex', flexDirection: 'column', gap: '1rem', alignItems: 'flex-start', marginBottom: '2rem' }}>
          <div>
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', fontWeight: '400', margin: '0 0 4px 0', color: 'var(--text-primary)' }}>
              Dataset Structure: {uploadInfo.filename}
            </h3>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
              Job ID: {uploadInfo.job_id}
            </span>
          </div>
          <button
            onClick={handleAnalyze}
            className="btn btn-primary"
            disabled={loading}
            style={{ padding: '12px 28px', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '14px', minHeight: '44px', width: '100%', maxWidth: '280px' }}
          >
            <Search size={16} />
            {loading ? 'Analyzing...' : 'Analyze Dataset Properties'}
          </button>
        </div>

        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '2rem',
          padding: '1.25rem',
          backgroundColor: 'var(--bg-tertiary)',
          border: '1px solid var(--border-beige-deep)',
          borderRadius: 'var(--radius-lg)',
          marginBottom: '1.5rem',
          alignItems: 'center'
        }}>
          <div>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', display: 'block', textTransform: 'uppercase', fontWeight: '600', letterSpacing: '0.05em' }}>
              Features Identified
            </span>
            <span style={{ fontSize: '1.75rem', fontWeight: '700', color: 'var(--text-primary)' }}>
              {featureColumns.length}
            </span>
          </div>
          <div>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', display: 'block', textTransform: 'uppercase', fontWeight: '600', letterSpacing: '0.05em' }}>
              Total Columns
            </span>
            <span style={{ fontSize: '1.75rem', fontWeight: '700', color: 'var(--text-primary)' }}>
              {uploadInfo.columns.length}
            </span>
          </div>
          <div style={{ flex: '1', minWidth: '200px' }}>
            <label 
              htmlFor="target-select"
              style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontWeight: '600', display: 'block', textTransform: 'uppercase', marginBottom: '0.25rem', letterSpacing: '0.05em' }}
            >
              Select Target Column (Y Label)
            </label>
            <select
              id="target-select"
              className="select-input"
              value={targetColumn}
              onChange={(e) => setTargetColumn(e.target.value)}
              style={{ fontWeight: '600', borderColor: 'var(--accent-color)', borderRadius: '8px' }}
            >
              {uploadInfo.columns.map((col) => (
                <option key={col} value={col}>{col}</option>
              ))}
            </select>
          </div>
        </div>

        <h4 style={{ marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '15px', color: 'var(--text-primary)', fontWeight: '600' }}>
          <Eye size={16} style={{ color: 'var(--accent-color)' }} />
          First 10 Rows Preview
        </h4>
        
        <div className="table-container" style={{ maxHeight: '240px', overflow: 'auto', border: '1px solid var(--border-color)' }}>
          <table className="data-table">
            <thead>
              <tr>
                {uploadInfo.columns.map((col) => (
                  <th 
                    key={col} 
                    style={{ 
                      backgroundColor: col === targetColumn ? 'var(--accent-light)' : 'var(--bg-cream-soft)',
                      color: col === targetColumn ? 'var(--accent-color)' : 'var(--text-secondary)',
                      fontWeight: col === targetColumn ? '700' : '500'
                    }}
                  >
                    {col} {col === targetColumn && ' (Target)'}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {uploadInfo.preview_data.map((row, idx) => (
                <tr key={idx}>
                  {uploadInfo.columns.map((col) => (
                    <td 
                      key={col} 
                      style={{ 
                        fontWeight: col === targetColumn ? '700' : 'normal',
                        backgroundColor: col === targetColumn ? 'rgba(255, 95, 31, 0.04)' : 'transparent',
                        color: col === targetColumn ? 'var(--accent-color)' : 'var(--text-primary)'
                      }}
                    >
                      {row[col] === null || row[col] === undefined ? (
                        <span style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontSize: '0.75rem' }}>null</span>
                      ) : (
                        row[col].toString()
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {error && (
          <div style={{
            marginTop: '1.25rem',
            padding: '0.75rem 1rem',
            backgroundColor: 'var(--danger-light)',
            color: 'var(--danger-color)',
            borderRadius: 'var(--radius-md)',
            fontSize: '0.825rem',
            border: '1px solid var(--danger-color)'
          }}>
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
