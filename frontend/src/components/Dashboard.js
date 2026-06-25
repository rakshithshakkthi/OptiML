'use client';

import React, { useState, useEffect, useRef } from 'react';
import { 
  Upload, Search, Activity, ArrowRight, Play, 
  RefreshCw, Layers, Plus, Moon, Sun, ShieldAlert, CheckCircle2, 
  HelpCircle, Settings as SettingsIcon, Award, Cpu, Zap, Binary, 
  AlertTriangle, ChevronLeft, ChevronRight, TrendingUp, Database 
} from 'lucide-react';
import confetti from 'canvas-confetti';

import CsvUpload from './CsvUpload';
import DataPreview from './DataPreview';
import ModelBattle from './ModelBattle';
import Leaderboard from './Leaderboard';
import AiExplanation from './AiExplanation';
import { API_URL } from '../config';

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState('UPLOAD'); // UPLOAD, PREVIEW, BATTLE, RESULTS
  const [uploadInfo, setUploadInfo] = useState(null);
  const [analysisInfo, setAnalysisInfo] = useState(null);
  const [selectedTarget, setSelectedTarget] = useState('');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  
  // Theme and Backend Health States (moved from page.js to coordinate full page layout)
  const [theme, setTheme] = useState('dark');
  const [backendHealth, setBackendHealth] = useState('CHECKING'); // CHECKING, ONLINE, OFFLINE
  
  // Modal alerts state for empty views
  const [showNoDatasetModal, setShowNoDatasetModal] = useState(false);
  const [modalMessage, setModalMessage] = useState('');

  // Progress tracker state
  const [jobProgress, setJobProgress] = useState({
    status: 'PENDING',
    progress: 0,
    current_log: '',
    logs: []
  });
  
  const pollingRef = useRef(null);

  // Sync theme state on load
  useEffect(() => {
    const activeTheme = document.documentElement.getAttribute('data-theme') || 'dark';
    setTheme(activeTheme);
    checkBackendHealth();
  }, []);

  const checkBackendHealth = async () => {
    setBackendHealth('CHECKING');
    try {
      const res = await fetch(`${API_URL}/health`).catch(() => null);
      // If the server responds successfully to our dedicated health check, it's ONLINE
      if (res && res.status === 200) {
        setBackendHealth('ONLINE');
      } else {
        setBackendHealth('OFFLINE');
      }
    } catch {
      setBackendHealth('OFFLINE');
    }
  };

  const toggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', nextTheme);
    localStorage.setItem('optiml_theme', nextTheme);
    setTheme(nextTheme);
  };

  const triggerConfetti = () => {
    confetti({
      particleCount: 150,
      spread: 80,
      origin: { y: 0.6 },
      colors: ['#ff5f1f', '#ff8c00', '#ffd700', '#ab3600']
    });
  };

  const handleUploadSuccess = (info) => {
    setUploadInfo(info);
    setSelectedTarget(info.default_target);
    setActiveTab('PREVIEW');
  };

  const handleAnalyzeComplete = (results, target) => {
    setAnalysisInfo(results);
    setSelectedTarget(target);
    setActiveTab('BATTLE');
    
    // Trigger model training job
    startTrainingJob(info => {
      setJobProgress({
        status: 'RUNNING',
        progress: 5,
        current_log: 'Enqueuing async jobs in scheduler...',
        logs: [{ time: Date.now(), text: 'Created training task pipeline. Enqueuing models...' }]
      });
    });
  };

  const startTrainingJob = async (onInit) => {
    onInit();
    try {
      const response = await fetch(`${API_URL}/train-models`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          job_id: uploadInfo.job_id,
          target_column: selectedTarget
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to start training.');
      }

      // Start polling
      pollJobResults(uploadInfo.job_id);
    } catch (err) {
      setJobProgress(prev => ({
        ...prev,
        status: 'FAILED',
        error: err.message
      }));
    }
  };

  const pollJobResults = (jobId) => {
    if (pollingRef.current) clearInterval(pollingRef.current);
    
    let lastLogMessage = '';
    
    pollingRef.current = setInterval(async () => {
      try {
        const response = await fetch(`${API_URL}/results/${jobId}`);
        if (!response.ok) throw new Error('Polling update failed.');
        
        const data = await response.json();
        
        if (data.status === 'COMPLETED') {
          clearInterval(pollingRef.current);
          
          setJobProgress(prev => {
            const finalLogs = [...prev.logs];
            if (data.current_log && data.current_log !== lastLogMessage) {
              finalLogs.push({ time: Date.now(), text: data.current_log });
            }
            finalLogs.push({ time: Date.now(), text: 'All model pipelines optimized. Evaluation and experiment reports successfully compiled.' });
            return {
              ...prev,
              status: 'COMPLETED',
              progress: 100,
              current_log: 'Training complete.',
              logs: finalLogs,
              leaderboard: data.leaderboard,
              feature_importances: data.feature_importances,
              ai_report: data.ai_report,
              model_details: data.model_details,
              best_model: data.best_model,
              best_score: data.best_score
            };
          });
          
          if (data.meta_features) {
            setAnalysisInfo({
              meta_features: data.meta_features,
              meta_learning_advice: data.meta_learning_advice,
              personality: data.personality
            });
          }
          
          triggerConfetti();
          
          // Delay tab switch slightly to let user see victory
          setTimeout(() => {
            setActiveTab('RESULTS');
          }, 1500);
          
        } else if (data.status === 'FAILED') {
          clearInterval(pollingRef.current);
          setJobProgress(prev => ({
            ...prev,
            status: 'FAILED',
            error: data.error,
            logs: [...prev.logs, { time: Date.now(), text: `CRITICAL ERROR: ${data.error}` }]
          }));
        } else if (data.status === 'RUNNING') {
          setJobProgress(prev => {
            const updatedLogs = [...prev.logs];
            if (data.current_log && data.current_log !== lastLogMessage) {
              updatedLogs.push({ time: Date.now(), text: data.current_log });
              lastLogMessage = data.current_log;
            }
            return {
              ...prev,
              progress: data.progress,
              current_log: data.current_log,
              logs: updatedLogs
            };
          });
        }
      } catch (err) {
        console.warn('Transient polling error:', err.message || err);
      }
    }, 1200);
  };

  useEffect(() => {
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, []);

  const handleReset = () => {
    if (pollingRef.current) clearInterval(pollingRef.current);
    setUploadInfo(null);
    setAnalysisInfo(null);
    setJobProgress({
      status: 'PENDING',
      progress: 0,
      current_log: '',
      logs: []
    });
    setActiveTab('UPLOAD');
  };

  // Breadcrumb helper matching current tab title
  const getBreadcrumbTitle = () => {
    switch (activeTab) {
      case 'UPLOAD': return 'Upload Dataset';
      case 'PREVIEW': return 'Structure & Target';
      case 'BATTLE': return 'Model Training Dashboard';
      case 'RESULTS': return 'Performance & Reports';
      default: return 'Upload Dataset';
    }
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', width: '100%' }}>
      {/* Sidebar Navigation */}
      <aside className="h-screen fixed left-0 top-0 bg-cream border-r border-hairline flex flex-col z-50" 
        style={{
          backgroundColor: 'var(--bg-tertiary)',
          borderRight: '1px solid var(--border-color)',
          display: 'flex',
          flexDirection: 'column',
          padding: sidebarCollapsed ? '24px 8px' : '24px 16px',
          height: '100vh',
          width: sidebarCollapsed ? '64px' : '256px',
          position: 'fixed',
          left: 0,
          top: 0,
          transition: 'width var(--transition-normal), padding var(--transition-normal)'
        }}
      >
        <div style={{ 
          marginBottom: '32px', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: sidebarCollapsed ? 'center' : 'space-between',
          paddingLeft: sidebarCollapsed ? '0' : '8px' 
        }}>
          {!sidebarCollapsed && (
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '28px', margin: 0, fontWeight: '400', color: 'var(--text-primary)' }}>
              OptiML
            </h1>
          )}
          {sidebarCollapsed && (
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '24px', margin: 0, fontWeight: '700', color: 'var(--accent-color)' }}>
              O
            </h1>
          )}
          <button 
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text-secondary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '6px',
              borderRadius: '4px',
              transition: 'background-color var(--transition-fast)'
            }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--border-color)'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
            title={sidebarCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
          >
            {sidebarCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          </button>
        </div>

        <nav style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px', alignItems: sidebarCollapsed ? 'center' : 'stretch' }}>
          <div 
            onClick={() => {
              if (uploadInfo) {
                setActiveTab('PREVIEW');
              } else {
                setActiveTab('UPLOAD');
              }
            }}
            className={`aside-nav-link ${(activeTab === 'UPLOAD' || activeTab === 'PREVIEW') ? 'active' : ''}`}
            style={{ 
              justifyContent: sidebarCollapsed ? 'center' : 'flex-start',
              padding: sidebarCollapsed ? '10px' : '10px 16px',
              width: sidebarCollapsed ? '42px' : '100%',
              borderRadius: '8px'
            }}
            title={sidebarCollapsed ? "Datasets" : ""}
          >
            <Upload size={18} />
            {!sidebarCollapsed && <span>Datasets</span>}
          </div>

          <div 
            onClick={() => {
              if (!uploadInfo) {
                setModalMessage("To access the Model Training Dashboard, you must upload a dataset and execute schema profiling first.");
                setShowNoDatasetModal(true);
              } else {
                setActiveTab('BATTLE');
              }
            }}
            className={`aside-nav-link ${activeTab === 'BATTLE' ? 'active' : ''}`}
            style={{ 
              justifyContent: sidebarCollapsed ? 'center' : 'flex-start',
              padding: sidebarCollapsed ? '10px' : '10px 16px',
              width: sidebarCollapsed ? '42px' : '100%',
              borderRadius: '8px'
            }}
            title={sidebarCollapsed ? "Model Training" : ""}
          >
            <Activity size={18} />
            {!sidebarCollapsed && <span>Model Training</span>}
          </div>

          <div 
            onClick={() => {
              if (jobProgress.status !== 'COMPLETED') {
                setModalMessage("Performance metrics and experiment reports will compile automatically once model optimization runs finish.");
                setShowNoDatasetModal(true);
              } else {
                setActiveTab('RESULTS');
              }
            }}
            className={`aside-nav-link ${activeTab === 'RESULTS' ? 'active' : ''}`}
            style={{ 
              justifyContent: sidebarCollapsed ? 'center' : 'flex-start',
              padding: sidebarCollapsed ? '10px' : '10px 16px',
              width: sidebarCollapsed ? '42px' : '100%',
              borderRadius: '8px'
            }}
            title={sidebarCollapsed ? "Performance & Reports" : ""}
          >
            <TrendingUp size={18} />
            {!sidebarCollapsed && <span>Performance & Reports</span>}
          </div>
        </nav>

        <div style={{ paddingTop: '16px', borderTop: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          {sidebarCollapsed ? (
            <button 
              onClick={handleReset}
              disabled={jobProgress.status === 'RUNNING'}
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '8px',
                border: 'none',
                backgroundColor: 'var(--text-primary)',
                color: 'var(--bg-secondary)',
                cursor: jobProgress.status === 'RUNNING' ? 'not-allowed' : 'pointer',
                opacity: jobProgress.status === 'RUNNING' ? 0.6 : 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
              title="New Experiment"
            >
              <Plus size={18} />
            </button>
          ) : (
            <button 
              onClick={handleReset}
              disabled={jobProgress.status === 'RUNNING'}
              className="btn btn-primary"
              style={{ 
                width: '100%', 
                backgroundColor: 'var(--text-primary)', 
                color: 'var(--bg-secondary)', 
                fontWeight: '500',
                padding: '12px 16px',
                borderRadius: '8px',
                border: 'none',
                cursor: jobProgress.status === 'RUNNING' ? 'not-allowed' : 'pointer',
                opacity: jobProgress.status === 'RUNNING' ? 0.6 : 1
              }}
            >
              New Experiment
            </button>
          )}
        </div>
      </aside>

      {/* Main Content Canvas */}
      <main style={{ 
        marginLeft: sidebarCollapsed ? '64px' : '256px', 
        minHeight: '100vh', 
        width: sidebarCollapsed ? 'calc(100% - 64px)' : 'calc(100% - 256px)', 
        display: 'flex', 
        flexDirection: 'column', 
        position: 'relative',
        transition: 'margin-left var(--transition-normal), width var(--transition-normal)'
      }}>
        {/* Breadcrumb Header */}
        <header className="header" style={{
          width: '100%',
          position: 'sticky',
          top: 0,
          backgroundColor: 'var(--bg-secondary)',
          borderBottom: '1px solid var(--border-color)',
          zIndex: 40,
          padding: '16px 24px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          backdropFilter: 'blur(10px)',
          opacity: 0.95
        }}>
          <div className="flex-row-gap" style={{ fontSize: '14px', fontWeight: '500' }}>
            <span style={{ color: 'var(--text-secondary)' }}>Dashboard</span>
            <span style={{ color: 'var(--border-color-strong)', opacity: 0.5 }}>/</span>
            <span style={{ color: 'var(--text-primary)', fontWeight: '600' }}>{getBreadcrumbTitle()}</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            {/* Search Bar */}
            <div style={{ position: 'relative' }}>
              <Search 
                size={18} 
                style={{ 
                  position: 'absolute', 
                  left: '12px', 
                  top: '50%', 
                  transform: 'translateY(-50%)', 
                  color: 'var(--text-muted)' 
                }} 
              />
              <input 
                className="select-input" 
                placeholder="Search experiments..." 
                type="text"
                style={{ 
                  paddingLeft: '38px', 
                  paddingRight: '16px', 
                  paddingTop: '6px', 
                  paddingBottom: '6px', 
                  width: '240px',
                  backgroundColor: 'var(--bg-cream-soft)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '8px'
                }}
              />
            </div>

            {/* Health check status indicator */}
            <div 
              onClick={checkBackendHealth}
              style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '6px', 
                fontSize: '12px', 
                padding: '6px 12px', 
                borderRadius: '20px', 
                backgroundColor: 'var(--bg-cream-soft)',
                cursor: 'pointer',
                border: '1px solid var(--border-color)',
                transition: 'background-color var(--transition-fast)'
              }}
            >
              {backendHealth === 'ONLINE' ? (
                <>
                  <CheckCircle2 size={12} style={{ color: 'var(--accent-color)' }} />
                  <span style={{ color: 'var(--text-secondary)' }}>Backend Connect</span>
                </>
              ) : backendHealth === 'CHECKING' ? (
                <>
                  <RefreshCw size={12} style={{ animation: 'spin 1s linear infinite' }} />
                  <span style={{ color: 'var(--text-muted)' }}>Pinging...</span>
                </>
              ) : (
                <>
                  <ShieldAlert size={12} style={{ color: 'var(--danger-color)' }} />
                  <span style={{ color: 'var(--danger-color)', fontWeight: '700' }}>Backend Offline</span>
                </>
              )}
            </div>

            {/* Theme Toggle */}
            <button 
              onClick={toggleTheme}
              className="btn btn-secondary"
              style={{ 
                borderRadius: '50%', 
                width: '38px', 
                height: '38px', 
                padding: '0', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                border: '1px solid var(--border-color)'
              }}
              title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            >
              {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            </button>

          </div>
        </header>

        {/* Content Canvas */}
        <div style={{ padding: '32px', flex: 1, maxWidth: '1200px', width: '100%', margin: '0 auto' }}>
          
          {backendHealth === 'OFFLINE' && (
            <div className="panel" style={{ borderLeft: '4px solid var(--danger-color)', backgroundColor: 'var(--danger-light)', marginBottom: '2rem' }}>
              <h4 style={{ color: 'var(--danger-color)', display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                <ShieldAlert size={18} />
                FastAPI Server Unreachable
              </h4>
              <p style={{ fontSize: '0.825rem', color: 'var(--text-secondary)', margin: '0' }}>
                OptiML requires the FastAPI backend to run model grid tuning and meta-learning predictions. 
                Please ensure you have started the backend API server locally (e.g. running <code>python backend/main.py</code> on port 8000).
              </p>
            </div>
          )}

          {/* 1. UPLOAD VIEW */}
          {activeTab === 'UPLOAD' && (
            <CsvUpload onUploadSuccess={handleUploadSuccess} />
          )}

          {/* 2. PREVIEW VIEW */}
          {activeTab === 'PREVIEW' && uploadInfo && (
            <DataPreview 
              uploadInfo={uploadInfo} 
              onAnalyzeComplete={handleAnalyzeComplete} 
            />
          )}

          {/* 3. BATTLE VIEW */}
          {activeTab === 'BATTLE' && (
            uploadInfo ? (
              <ModelBattle jobProgress={jobProgress} />
            ) : (
              <div className="panel" style={{ 
                textAlign: 'center', 
                padding: '64px 32px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: 'var(--bg-tertiary)',
                border: '1px solid var(--border-color)',
                borderRadius: '16px',
                maxWidth: '640px',
                margin: '40px auto'
              }}>
                <div style={{
                  width: '64px',
                  height: '64px',
                  borderRadius: '50%',
                  backgroundColor: 'rgba(255, 95, 31, 0.1)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: '20px',
                  color: 'var(--accent-color)'
                }}>
                  <Activity size={32} />
                </div>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '24px', fontWeight: '400', margin: '0 0 8px 0', color: 'var(--text-primary)' }}>
                  Model Training Dashboard Locked
                </h3>
                <p style={{ fontSize: '14px', color: 'var(--text-secondary)', maxWidth: '400px', margin: '0 auto 24px auto', lineHeight: '1.5' }}>
                  The model optimization and training logs are currently inactive. Ingest a CSV dataset to initialize validation splits and start the optimization run.
                </p>
                <button className="btn btn-primary" onClick={() => setActiveTab('UPLOAD')} style={{ backgroundColor: 'var(--text-primary)', color: 'var(--bg-secondary)', border: 'none', padding: '12px 24px', borderRadius: '8px', cursor: 'pointer' }}>
                  Upload a Dataset
                </button>
              </div>
            )
          )}

          {/* 4. RESULTS VIEW */}
          {activeTab === 'RESULTS' && (
            jobProgress.status === 'COMPLETED' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                
                {/* Dataset Profile Metrics Panel */}
                <div className="panel" style={{ border: '1px solid var(--border-color)', marginBottom: '0px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                    <Database size={20} style={{ color: 'var(--accent-color)' }} />
                    <h3 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: '1.75rem', fontWeight: '400' }}>
                      Dataset Characterization & Schema Profiling
                    </h3>
                  </div>
                  
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px' }}>
                    {/* Rows */}
                    <div style={{ backgroundColor: 'var(--bg-tertiary)', padding: '12px 16px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                      <span style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', textTransform: 'uppercase', fontWeight: '600', letterSpacing: '0.05em' }}>
                        Row Count (Sample Depth)
                      </span>
                      <strong style={{ fontSize: '20px', color: 'var(--text-primary)' }}>
                        {analysisInfo?.meta_features?.num_rows?.toLocaleString() || '0'}
                      </strong>
                    </div>

                    {/* Columns */}
                    <div style={{ backgroundColor: 'var(--bg-tertiary)', padding: '12px 16px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                      <span style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', textTransform: 'uppercase', fontWeight: '600', letterSpacing: '0.05em' }}>
                        Column Count (Feature Dimensionality)
                      </span>
                      <strong style={{ fontSize: '20px', color: 'var(--text-primary)' }}>
                        {analysisInfo?.meta_features?.num_cols || '0'}
                      </strong>
                    </div>

                    {/* Missing Values */}
                    <div style={{ backgroundColor: 'var(--bg-tertiary)', padding: '12px 16px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                      <span style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', textTransform: 'uppercase', fontWeight: '600', letterSpacing: '0.05em' }}>
                        Missing Value Ratio
                      </span>
                      <strong style={{ fontSize: '20px', color: 'var(--text-primary)' }}>
                        {((analysisInfo?.meta_features?.missing_ratio || 0) * 100).toFixed(2)}%
                      </strong>
                    </div>

                    {/* Feature Types */}
                    <div style={{ backgroundColor: 'var(--bg-tertiary)', padding: '12px 16px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                      <span style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', textTransform: 'uppercase', fontWeight: '600', letterSpacing: '0.05em' }}>
                        Feature Type Distribution
                      </span>
                      <div style={{ fontSize: '12px', marginTop: '4px', color: 'var(--text-primary)', fontWeight: '600' }}>
                        {analysisInfo?.meta_features?.num_features || 0} features 
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', fontWeight: 'normal' }}>
                          ({analysisInfo?.meta_features?.numeric_cols?.length || 0} numeric, {analysisInfo?.meta_features?.categorical_cols?.length || 0} categorical)
                        </span>
                      </div>
                    </div>

                    {/* Target Stats */}
                    <div style={{ backgroundColor: 'var(--bg-tertiary)', padding: '12px 16px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                      <span style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', textTransform: 'uppercase', fontWeight: '600', letterSpacing: '0.05em' }}>
                        Predictive Target (Y)
                      </span>
                      <strong style={{ fontSize: '14px', color: 'var(--accent-color)', display: 'block', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                        `{analysisInfo?.meta_features?.target_stats?.name || 'target'}`
                      </strong>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block' }}>
                        Balance: {analysisInfo?.meta_features?.target_stats?.class_balance || 'Balanced'}
                      </span>
                    </div>

                    {/* Correlation characteristics */}
                    <div style={{ backgroundColor: 'var(--bg-tertiary)', padding: '12px 16px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                      <span style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', textTransform: 'uppercase', fontWeight: '600', letterSpacing: '0.05em' }}>
                        Feature Correlation Mean
                      </span>
                      <strong style={{ fontSize: '20px', color: 'var(--text-primary)' }}>
                        {analysisInfo?.meta_features?.correlation_mean?.toFixed(4) || '0.0000'}
                      </strong>
                    </div>
                  </div>
                </div>

                {/* Analysis Info and Advisor Card */}
                <div className="grid-2">
                  {/* Advisor Card */}
                  <div className="panel" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                    {/* 1. Best Model & Evaluation Metrics */}
                    <div style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '12px', marginBottom: '16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                        <Award size={18} style={{ color: 'var(--accent-color)' }} />
                        <h4 style={{ margin: 0, fontSize: '14px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Optimal Candidate Selection</h4>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                        <span style={{ fontSize: '20px', fontWeight: '700', color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>
                          {jobProgress.best_model}
                        </span>
                        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                          <span style={{ fontSize: '14px', color: 'var(--accent-color)', fontWeight: '700' }}>
                            Validation Accuracy: {(jobProgress.best_score * 100).toFixed(2)}%
                          </span>
                          {/* 3. Training Duration */}
                          <span style={{ fontSize: '12px', color: 'var(--text-secondary)', backgroundColor: 'var(--bg-tertiary)', padding: '2px 8px', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
                            Fit Time: {jobProgress.model_details?.[jobProgress.best_model]?.train_time.toFixed(3) || '0.000'}s
                          </span>
                        </div>
                      </div>
                    </div>
                    
                    {/* 2. Algorithmic Feasibility Recommendation */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                      <Layers size={16} style={{ color: 'var(--accent-color)' }} />
                      <h4 style={{ margin: 0, fontSize: '13px', fontWeight: '600' }}>Algorithmic Feasibility Recommendation</h4>
                    </div>
                    <p style={{ fontSize: '12.5px', marginBottom: '12px', color: 'var(--text-secondary)' }}>
                      Based on metadata similarity computed against historical profiling metrics, the recommendation platform selected:
                    </p>
                    
                    <div style={{
                      padding: '14px',
                      backgroundColor: 'var(--bg-cream-soft)',
                      borderRadius: '8px',
                      borderLeft: '4px solid var(--accent-color)',
                      border: '1px solid var(--border-color)',
                      borderLeftWidth: '4px'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '6px' }}>
                        <strong style={{ fontSize: '16px', color: 'var(--text-primary)' }}>
                          {analysisInfo?.meta_learning_advice.best_model}
                        </strong>
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                          Confidence: {(analysisInfo?.meta_learning_advice.confidence_score * 100).toFixed(0)}%
                        </span>
                      </div>
                      <p style={{ fontSize: '12.5px', margin: '0 0 10px 0', color: 'var(--text-secondary)', fontStyle: 'italic', lineHeight: '1.4' }}>
                        {analysisInfo?.meta_learning_advice.justification}
                      </p>
                      
                      {analysisInfo?.meta_learning_advice.why_recommended && (
                        <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '10px', marginTop: '10px' }}>
                          <div style={{ fontSize: '12px', marginBottom: '6px', color: 'var(--text-primary)' }}>
                            <strong>Feasibility Justification:</strong> {analysisInfo.meta_learning_advice.why_recommended}
                          </div>
                          
                          <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                            <strong>Dataset Profile Parameters Used:</strong>
                            <ul style={{ margin: '2px 0 0 14px', padding: 0, listStyleType: 'disc' }}>
                              {analysisInfo.meta_learning_advice.dataset_characteristics.map((char, i) => (
                                <li key={i} style={{ marginBottom: '1px' }}>{char}</li>
                              ))}
                            </ul>
                          </div>
                          
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '11px', marginTop: '6px' }}>
                            <div>
                              <strong style={{ color: 'var(--accent-color)', display: 'block', marginBottom: '1px' }}>Advantages & Convergence Benefits:</strong>
                              <ul style={{ margin: '0 0 0 10px', padding: 0, listStyleType: 'circle', color: 'var(--text-secondary)' }}>
                                {analysisInfo.meta_learning_advice.advantages.map((adv, i) => (
                                  <li key={i} style={{ marginBottom: '1px' }}>{adv}</li>
                                ))}
                              </ul>
                            </div>
                            <div>
                              <strong style={{ color: '#d97706', display: 'block', marginBottom: '1px' }}>Tradeoffs & Computational Complexity:</strong>
                              <ul style={{ margin: '0 0 0 10px', padding: 0, listStyleType: 'circle', color: 'var(--text-secondary)' }}>
                                {analysisInfo.meta_learning_advice.tradeoffs.map((trade, i) => (
                                  <li key={i} style={{ marginBottom: '1px' }}>{trade}</li>
                                ))}
                              </ul>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Dataset Characterization Box */}
                  <div className="personality-box" style={{ display: 'flex', flexDirection: 'column', margin: 0, alignSelf: 'flex-start' }}>
                    <div className="personality-title" style={{ margin: '0 0 8px 0' }}>
                      <span>Dataset Characterization:</span>
                      <span className="personality-badge">
                        {analysisInfo?.personality.complexity_category} Complexity
                      </span>
                    </div>
                    <strong style={{ fontSize: '18px', color: 'var(--accent-color)', display: 'block', marginBottom: '8px', fontFamily: 'var(--font-display)', fontWeight: '400' }}>
                      {analysisInfo?.personality.title}
                    </strong>
                    <p style={{ fontSize: '13px', margin: 0, color: 'var(--text-secondary)', lineHeight: '1.5' }}>
                      {analysisInfo?.personality.summary}
                    </p>
                  </div>
                </div>

                {/* Model Rankings Leaderboard & Charts */}
                <Leaderboard 
                  leaderboard={jobProgress.leaderboard}
                  featureImportances={jobProgress.feature_importances}
                />

                {/* AI Explanation markdown report & Export */}
                <AiExplanation 
                  jobId={uploadInfo.job_id}
                  reportMarkdown={jobProgress.ai_report}
                />

                {/* Option to restart */}
                <div style={{ display: 'flex', justifyContent: 'center', marginTop: '16px' }}>
                  <button className="btn btn-secondary" onClick={handleReset} style={{ gap: '8px' }}>
                    <RefreshCw size={14} />
                    Process Another Dataset
                  </button>
                </div>
              </div>
            ) : (
              <div className="panel" style={{ 
                textAlign: 'center', 
                padding: '64px 32px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: 'var(--bg-tertiary)',
                border: '1px solid var(--border-color)',
                borderRadius: '16px',
                maxWidth: '640px',
                margin: '40px auto'
              }}>
                <div style={{
                  width: '64px',
                  height: '64px',
                  borderRadius: '50%',
                  backgroundColor: 'rgba(255, 95, 31, 0.1)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: '20px',
                  color: 'var(--accent-color)'
                }}>
                  <TrendingUp size={32} />
                </div>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '24px', fontWeight: '400', margin: '0 0 8px 0', color: 'var(--text-primary)' }}>
                  Performance Metrics Pending
                </h3>
                <p style={{ fontSize: '14px', color: 'var(--text-secondary)', maxWidth: '400px', margin: '0 auto 24px auto', lineHeight: '1.5' }}>
                  The model validation leaderboard, relative parameter comparisons, and compiled experiment reports will populate once the cross-validation optimization runs complete.
                </p>
                <button className="btn btn-primary" onClick={() => {
                  if (uploadInfo) {
                    if (analysisInfo) {
                      setActiveTab('BATTLE');
                    } else {
                      setActiveTab('PREVIEW');
                    }
                  } else {
                    setActiveTab('UPLOAD');
                  }
                }} style={{ backgroundColor: 'var(--text-primary)', color: 'var(--bg-secondary)', border: 'none', padding: '12px 24px', borderRadius: '8px', cursor: 'pointer' }}>
                  {uploadInfo ? (analysisInfo ? "Execute Parameter Optimization" : "Execute Schema Profiling") : "Ingest Dataset"}
                </button>
              </div>
            )
          )}

          {/* Handle failed training job */}
          {jobProgress.status === 'FAILED' && (
            <div className="panel" style={{ maxWidth: '600px', margin: '2rem auto', textAlign: 'center' }}>
              <div style={{ color: 'var(--danger-color)', marginBottom: '1rem' }}>
                <AlertTriangle size={48} style={{ margin: '0 auto 0.75rem auto' }} />
                <h4>Model Training Job Failed</h4>
              </div>
              <p style={{ fontSize: '0.875rem', marginBottom: '1.5rem' }}>
                {jobProgress.error || 'An unexpected error occurred while training pipelines.'}
              </p>
              <button className="btn btn-primary" onClick={handleReset}>
                Return to Upload
              </button>
            </div>
          )}
        </div>

        {/* Space for Footer Push */}
        <div style={{ marginTop: 'auto' }}>
          {/* Signature Sunset Stripe */}
          <div className="sunset-stripe" style={{ width: '100%' }}></div>
          {/* Footer */}
          <footer style={{ 
            width: '100%',
            backgroundColor: 'var(--bg-secondary)', 
            padding: '32px 24px', 
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '16px',
            borderTop: '1px solid var(--border-color)'
          }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '20px', color: 'var(--text-primary)' }}>OptiML</div>
            <p style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-muted)', margin: 0, opacity: 0.6 }}>
              &copy; 2026 OptiML Systems. Built for the frontier.
            </p>
          </footer>
        </div>
      </main>

      {/* Premium Alert Modal */}
      {showNoDatasetModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.6)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 999,
          padding: '20px',
          animation: 'fadeIn 0.2s ease'
        }}>
          <div style={{
            backgroundColor: 'var(--bg-secondary)',
            border: '1px solid var(--border-color)',
            borderRadius: '16px',
            maxWidth: '480px',
            width: '100%',
            padding: '32px',
            boxShadow: 'var(--shadow-lg)',
            position: 'relative',
            textAlign: 'center',
            animation: 'slideUp 0.25s cubic-bezier(0.16, 1, 0.3, 1)'
          }}>
            <div style={{
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              backgroundColor: 'rgba(255, 95, 31, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 20px auto',
              color: 'var(--accent-color)'
            }}>
              <AlertTriangle size={32} />
            </div>
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '24px', fontWeight: '400', margin: '0 0 12px 0', color: 'var(--text-primary)' }}>
              Action Required
            </h3>
            <p style={{ fontSize: '14px', color: 'var(--text-secondary)', margin: '0 0 24px 0', lineHeight: '1.5' }}>
              {modalMessage}
            </p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <button 
                className="btn btn-secondary"
                onClick={() => setShowNoDatasetModal(false)}
                style={{ padding: '10px 20px', fontSize: '13px', borderRadius: '8px', cursor: 'pointer' }}
              >
                Dismiss
              </button>
              <button 
                className="btn btn-primary"
                onClick={() => {
                  setShowNoDatasetModal(false);
                  setActiveTab('UPLOAD');
                }}
                style={{ padding: '10px 20px', fontSize: '13px', backgroundColor: 'var(--text-primary)', color: 'var(--bg-secondary)', border: 'none', borderRadius: '8px', cursor: 'pointer' }}
              >
                Upload Now
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx global>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideUp {
          from { transform: translateY(20px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
