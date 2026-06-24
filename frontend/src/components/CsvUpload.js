'use client';

import React, { useState, useRef } from 'react';
import { Upload, FileText, Database, ArrowRight, Play } from 'lucide-react';

export default function CsvUpload({ onUploadSuccess }) {
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);

  // Drag handlers
  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      validateAndSetFile(file);
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      validateAndSetFile(e.target.files[0]);
    }
  };

  const validateAndSetFile = (file) => {
    if (!file.name.endsWith('.csv')) {
      setError('Unsupported file type. Please upload a CSV dataset.');
      setSelectedFile(null);
      return;
    }
    setError('');
    setSelectedFile(file);
  };

  const uploadFile = async (fileToUpload) => {
    setLoading(true);
    setError('');
    
    const formData = new FormData();
    formData.append('file', fileToUpload);

    try {
      const response = await fetch('http://127.0.0.1:8000/upload-dataset', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to upload dataset.');
      }

      const data = await response.json();
      onUploadSuccess({
        job_id: data.job_id,
        filename: data.filename,
        columns: data.columns,
        default_target: data.default_target,
        preview_data: data.preview_data
      });
    } catch (err) {
      setError(err.message || 'An error occurred during upload.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!selectedFile) return;
    uploadFile(selectedFile);
  };

  const loadSyntheticDataset = () => {
    setLoading(true);
    // Generate synthetic classification CSV
    const rows = [];
    // Header
    rows.push('age,income,credit_score,savings,dependents,education_level,churn');
    
    // Classes
    const educations = ['High School', 'Bachelors', 'Masters', 'PhD'];
    
    for (let i = 0; i < 300; i++) {
      const age = Math.floor(Math.random() * 50) + 18;
      const creditScore = Math.floor(Math.random() * 450) + 400;
      const dependents = Math.floor(Math.random() * 4);
      const edu = educations[Math.floor(Math.random() * educations.length)];
      
      // Calculate a semi-logical churn target based on variables
      const income = Math.floor(Math.random() * 120000) + 20000;
      const savings = Math.floor(Math.random() * (income * 0.4));
      
      let score = (age / 80) * 0.2 - (savings / 50000) * 0.4 + (dependents / 4) * 0.3 + (edu === 'High School' ? 0.2 : 0.0);
      const churn = score > 0.1 ? 1 : 0;
      
      rows.push(`${age},${income},${creditScore},${savings},${dependents},${edu},${churn}`);
    }
    
    const csvContent = rows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const file = new File([blob], 'synthetic_customer_churn.csv', { type: 'text/csv' });
    
    uploadFile(file);
  };

  return (
    <div className="panel" style={{ maxWidth: '600px', margin: '2rem auto', border: '1px solid var(--border-beige-deep)' }}>
      <h3 style={{ marginBottom: '1rem', textAlign: 'center', fontFamily: 'var(--font-display)', fontSize: '2.25rem', fontWeight: '400' }}>
        Upload Your Dataset
      </h3>
      <p style={{ textAlign: 'center', marginBottom: '1.5rem', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
        Provide a CSV file for classification models. We will parse feature variables and guide your ML pipeline options.
      </p>

      <form onSubmit={handleSubmit} onDragEnter={handleDrag}>
        <div 
          className={`upload-zone ${dragActive ? 'dragging' : ''}`}
          onDragEnter={handleDrag}
          onDragOver={handleDrag}
          onDragLeave={handleDrag}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current.click()}
        >
          <input 
            ref={fileInputRef}
            type="file" 
            style={{ display: 'none' }} 
            onChange={handleFileChange}
            accept=".csv"
          />
          <Upload className="upload-icon" />
          {selectedFile ? (
            <div>
              <p style={{ fontWeight: '600', color: 'var(--text-primary)', marginBottom: '0.25rem', fontSize: '15px' }}>
                {selectedFile.name}
              </p>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                {(selectedFile.size / 1024).toFixed(1)} KB &bull; Click to swap file
              </p>
            </div>
          ) : (
            <div>
              <p style={{ fontWeight: '600', color: 'var(--text-primary)', marginBottom: '0.25rem', fontSize: '15px' }}>
                Drag and drop your CSV dataset here
              </p>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                or click to browse local files
              </p>
            </div>
          )}
        </div>

        {error && (
          <div style={{
            marginTop: '1rem',
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

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '1.5rem' }}>
          <button 
            type="submit" 
            className="btn btn-primary" 
            disabled={!selectedFile || loading}
            style={{ width: '100%' }}
          >
            {loading ? 'Uploading & Parsing...' : 'Initialize Analysis Pipeline'}
            <ArrowRight size={16} />
          </button>
          
          <div style={{ display: 'flex', alignItems: 'center', margin: '0.5rem 0', justifyContent: 'center' }}>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: '600', letterSpacing: '0.05em' }}>&mdash; OR &mdash;</span>
          </div>

          <button 
            type="button" 
            className="btn btn-secondary" 
            onClick={loadSyntheticDataset}
            disabled={loading}
            style={{ width: '100%', gap: '0.5rem' }}
          >
            <Database size={16} style={{ color: 'var(--accent-color)' }} />
            Load Synthetic Customer Churn Sample
          </button>
        </div>
      </form>
    </div>
  );
}
