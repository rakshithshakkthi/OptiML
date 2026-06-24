'use client';

import React, { useState } from 'react';
import { FileDown, Copy, Check, FileText } from 'lucide-react';

export default function AiExplanation({ jobId, reportMarkdown }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(reportMarkdown);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadPdf = () => {
    window.open(`http://127.0.0.1:8000/results/${jobId}/pdf`, '_blank');
  };

  // Custom simple markdown parser to render report safely and cleanly
  const renderMarkdown = (text) => {
    if (!text) return null;

    const lines = text.split('\n');
    const elements = [];
    let listItems = [];
    let tableRows = [];
    let inQuote = false;
    let quoteText = [];

    const flushList = (key) => {
      if (listItems.length > 0) {
        elements.push(
          <ul key={`ul-${key}`} style={{ marginBottom: '1.25rem', paddingLeft: '1.5rem' }}>
            {listItems.map((item, idx) => <li key={idx} style={{ marginBottom: '0.4rem' }}>{item}</li>)}
          </ul>
        );
        listItems = [];
      }
    };

    const flushQuote = (key) => {
      if (inQuote && quoteText.length > 0) {
        elements.push(
          <blockquote key={`bq-${key}`} className="report-quote" style={{
            borderLeft: '4px solid var(--accent-color)',
            backgroundColor: 'var(--bg-tertiary)',
            padding: '0.75rem 1.25rem',
            margin: '0 0 1.25rem 0',
            fontStyle: 'italic',
            borderRadius: '0 var(--radius-sm) var(--radius-sm) 0'
          }}>
            {quoteText.join(' ')}
          </blockquote>
        );
        quoteText = [];
        inQuote = false;
      }
    };

    const flushTable = (key) => {
      if (tableRows.length > 0) {
        // Simple parser
        const headers = tableRows[0].split('|').map(x => x.trim()).filter(x => x !== '');
        const dataRows = tableRows.slice(2).map(row => 
          row.split('|').map(x => x.trim()).filter(x => x !== '')
        );

        elements.push(
          <div key={`table-${key}`} className="table-container" style={{ marginBottom: '1.5rem' }}>
            <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {headers.map((h, i) => (
                    <th key={i} style={{ padding: '0.5rem 0.75rem', backgroundColor: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', fontWeight: '700' }}>
                      {h.replace(/\*\*/g, '')}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {dataRows.filter(row => row.length > 0).map((row, i) => (
                  <tr key={i}>
                    {row.map((cell, j) => (
                      <td key={j} style={{ padding: '0.5rem 0.75rem', border: '1px solid var(--border-color)' }}>
                        {cell.replace(/\*\*/g, '')}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
        tableRows = [];
      }
    };

    for (let i = 0; i < lines.length; i++) {
      let line = lines[i].trim();
      
      // Handle Tables
      if (line.startsWith('|')) {
        flushList(i);
        flushQuote(i);
        tableRows.push(lines[i]); // Keep spacing raw
        continue;
      } else {
        flushTable(i);
      }

      // Handle Quotes
      if (line.startsWith('>')) {
        flushList(i);
        inQuote = true;
        quoteText.push(line.substring(1).trim().replace(/^"(.*)"$/, '$1'));
        continue;
      } else {
        flushQuote(i);
      }

      // Handle Bullet Lists
      if (line.startsWith('* ') || line.startsWith('- ')) {
        const text = line.substring(2).trim();
        // bold parser wrapper
        listItems.push(parseInlineMarkdown(text));
        continue;
      } else {
        flushList(i);
      }

      // Headers
      if (line.startsWith('# ')) {
        elements.push(<h2 key={i} style={{ fontSize: '1.75rem', marginTop: '1.5rem', marginBottom: '0.75rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.3rem' }}>{line.substring(2)}</h2>);
      } else if (line.startsWith('## ')) {
        elements.push(<h3 key={i} style={{ fontSize: '1.35rem', marginTop: '1.5rem', marginBottom: '0.5rem' }}>{line.substring(3)}</h3>);
      } else if (line.startsWith('### ')) {
        elements.push(<h4 key={i} style={{ fontSize: '1.1rem', marginTop: '1.25rem', marginBottom: '0.5rem' }}>{line.substring(4)}</h4>);
      } else if (line === '---') {
        elements.push(<hr key={i} style={{ border: 'none', borderTop: '1px solid var(--border-color)', margin: '1.5rem 0' }} />);
      } else if (line === '') {
        // Skip empty lines
      } else {
        elements.push(<p key={i} style={{ marginBottom: '1rem', color: 'var(--text-secondary)' }}>{parseInlineMarkdown(line)}</p>);
      }
    }

    // Flush remaining
    flushList(lines.length);
    flushQuote(lines.length);
    flushTable(lines.length);

    return elements;
  };

  // Helper to parse basic bold text (**text**) and equations
  const parseInlineMarkdown = (text) => {
    const parts = text.split(/(\*\*.*?\*\*)/g);
    return parts.map((part, index) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={index} style={{ color: 'var(--text-primary)' }}>{part.slice(2, -2)}</strong>;
      }
      return part;
    });
  };

  return (
    <div className="panel" style={{ border: '1px solid var(--border-color)' }}>
      <div className="panel-title-row" style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem', marginBottom: '1.5rem' }}>
        <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: '0', fontFamily: 'var(--font-display)', fontSize: '2.0rem', fontWeight: '400' }}>
          <FileText size={20} style={{ color: 'var(--accent-color)' }} />
          AI Decision & Report Compiler
        </h3>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button 
            className="btn btn-secondary" 
            onClick={handleCopy}
            style={{ padding: '0.5rem 0.75rem', fontSize: '0.75rem', borderRadius: '8px' }}
          >
            {copied ? <Check size={14} style={{ color: 'var(--accent-color)' }} /> : <Copy size={14} />}
            {copied ? 'Copied Markdown' : 'Copy Report'}
          </button>
          <button 
            className="btn btn-primary" 
            onClick={handleDownloadPdf}
            style={{ padding: '0.5rem 1rem', fontSize: '0.75rem', gap: '0.4rem', borderRadius: '8px' }}
          >
            <FileDown size={14} />
            Download PDF Report
          </button>
        </div>
      </div>

      <div className="report-content" style={{ maxHeight: '600px', overflowY: 'auto', paddingRight: '10px' }} className="custom-scrollbar">
        {renderMarkdown(reportMarkdown)}
      </div>
    </div>
  );
}
