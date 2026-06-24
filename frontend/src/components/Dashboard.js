'use client';

import React, { useState, useEffect, useRef } from 'react';
import { 
  Upload, Search, Swords, Trophy, Activity, ArrowRight, Play, 
  RefreshCw, Layers, Plus, Moon, Sun, ShieldAlert, CheckCircle2, 
  HelpCircle, Settings as SettingsIcon, Award, Cpu, Zap, Binary, 
  AlertTriangle, ChevronLeft, ChevronRight 
} from 'lucide-react';
import confetti from 'canvas-confetti';

import CsvUpload from './CsvUpload';
import DataPreview from './DataPreview';
import ModelBattle from './ModelBattle';
import Leaderboard from './Leaderboard';
import AiExplanation from './AiExplanation';
import { API_URL } from '../config';

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState('UPLOAD'); // OVERVIEW, UPLOAD, PREVIEW, BATTLE, RESULTS
  const [uploadInfo, setUploadInfo] = useState(null);
  const [analysisInfo, setAnalysisInfo] = useState(null);
  const [selectedTarget, setSelectedTarget] = useState('');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  
  // Theme and Backend Health States (moved from page.js to coordinate full page layout)
  const [theme, setTheme] = useState('dark');
  const [backendHealth, setBackendHealth] = useState('CHECKING'); // CHECKING, ONLINE, OFFLINE
  
  // Progress tracker state
  const [jobProgress, setJobProgress] = useState({
    status: 'PENDING',
    progress: 0,
    current_log: '',
    logs: []
  });
  
  const pollingRef = useRef(null);

  // System stats from backend database (replaces hardcoded visual metrics)
  const [systemStats, setSystemStats] = useState({
    total_datasets: 0,
    total_models_trained: 0,
    avg_accuracy: 0.0,
    active_jobs: [],
    past_jobs: []
  });

  const fetchSystemStats = async () => {
    try {
      const res = await fetch(`${API_URL}/system-stats`);
      if (res.ok) {
        const data = await res.json();
        setSystemStats(data);
      }
    } catch (err) {
      console.error('Error fetching system stats:', err);
    }
  };

  // Sync theme state on load
  useEffect(() => {
    const activeTheme = document.documentElement.getAttribute('data-theme') || 'dark';
    setTheme(activeTheme);
    checkBackendHealth();
  }, []);

  // Poll system stats periodically while training to reflect progress in Overview dynamically
  useEffect(() => {
    fetchSystemStats();
    let statsInterval = null;
    if (jobProgress.status === 'RUNNING') {
      statsInterval = setInterval(fetchSystemStats, 2000);
    }
    return () => {
      if (statsInterval) clearInterval(statsInterval);
    };
  }, [jobProgress.status]);

  const checkBackendHealth = async () => {
    setBackendHealth('CHECKING');
    try {
      const res = await fetch(`${API_URL}/results/ping-health-check`).catch(() => null);
      // If the server responds (even with 404 since ping-health-check is not an endpoint), it means it's ONLINE
      if (res && (res.status === 200 || res.status === 404)) {
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
    localStorage.setItem('metaml_theme', nextTheme);
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
            finalLogs.push({ time: Date.now(), text: 'All models optimized. AI explanations generated.' });
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
        console.error('Polling error:', err);
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
      case 'OVERVIEW': return 'Overview';
      case 'UPLOAD': return 'Upload Dataset';
      case 'PREVIEW': return 'Structure & Target';
      case 'BATTLE': return 'Model Battle Arena';
      case 'RESULTS': return 'Leaderboards & Reports';
      default: return 'Overview';
    }
  };

  // Find best performing model from past jobs
  const getBestPerformer = () => {
    if (!systemStats.past_jobs || systemStats.past_jobs.length === 0) return 'None';
    const sortedJobs = [...systemStats.past_jobs].sort((a, b) => b.best_score - a.best_score);
    return sortedJobs[0].best_model || 'None';
  };

  // Overview metrics pulled dynamically from backend
  const metrics = {
    bestPerformer: getBestPerformer(),
    modelsTrained: systemStats.total_models_trained,
    avgAccuracy: typeof systemStats.avg_accuracy === 'number' ? systemStats.avg_accuracy.toFixed(1) + '%' : '0.0%'
  };
  const isCompleted = jobProgress.status === 'COMPLETED';

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
            onClick={() => setActiveTab('OVERVIEW')}
            className={`aside-nav-link ${activeTab === 'OVERVIEW' ? 'active' : ''}`}
            style={{ 
              justifyContent: sidebarCollapsed ? 'center' : 'flex-start',
              padding: sidebarCollapsed ? '10px' : '10px 16px',
              width: sidebarCollapsed ? '42px' : '100%',
              borderRadius: '8px'
            }}
            title={sidebarCollapsed ? "Overview" : ""}
          >
            <Activity size={18} />
            {!sidebarCollapsed && <span>Overview</span>}
          </div>

          <div 
            onClick={() => {
              if (activeTab !== 'BATTLE') {
                if (uploadInfo) {
                  setActiveTab('PREVIEW');
                } else {
                  setActiveTab('UPLOAD');
                }
              }
            }}
            className={`aside-nav-link ${(activeTab === 'UPLOAD' || activeTab === 'PREVIEW') ? 'active' : ''} ${activeTab === 'BATTLE' ? 'opacity-50 cursor-not-allowed' : ''}`}
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
            onClick={() => analysisInfo && setActiveTab('BATTLE')}
            className={`aside-nav-link ${activeTab === 'BATTLE' ? 'active' : ''} ${!analysisInfo ? 'opacity-50 cursor-not-allowed' : ''}`}
            style={{ 
              justifyContent: sidebarCollapsed ? 'center' : 'flex-start',
              padding: sidebarCollapsed ? '10px' : '10px 16px',
              width: sidebarCollapsed ? '42px' : '100%',
              borderRadius: '8px'
            }}
            title={sidebarCollapsed ? (analysisInfo ? "Battle Arena" : "Upload and profile a dataset first") : ""}
          >
            <Swords size={18} />
            {!sidebarCollapsed && <span>Battle Arena</span>}
          </div>

          <div 
            onClick={() => jobProgress.status === 'COMPLETED' && setActiveTab('RESULTS')}
            className={`aside-nav-link ${activeTab === 'RESULTS' ? 'active' : ''} ${jobProgress.status !== 'COMPLETED' ? 'opacity-50 cursor-not-allowed' : ''}`}
            style={{ 
              justifyContent: sidebarCollapsed ? 'center' : 'flex-start',
              padding: sidebarCollapsed ? '10px' : '10px 16px',
              width: sidebarCollapsed ? '42px' : '100%',
              borderRadius: '8px'
            }}
            title={sidebarCollapsed ? (jobProgress.status === 'COMPLETED' ? "Leaderboards" : "Complete training to view results") : ""}
          >
            <Trophy size={18} />
            {!sidebarCollapsed && <span>Leaderboards</span>}
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

          {/* 1. OVERVIEW TAB VIEW */}
          {activeTab === 'OVERVIEW' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
              {/* High-level metrics */}
              <section className="grid-3" style={{ display: 'grid', gap: '20px' }}>
                <div className="metric-card">
                  <span className="metric-label">Best Performer</span>
                  <h2 className="metric-value" style={{ 
                    fontSize: metrics.bestPerformer.length > 12 ? '22px' : '36px', 
                    whiteSpace: 'nowrap', 
                    overflow: 'hidden', 
                    textOverflow: 'ellipsis' 
                  }} title={metrics.bestPerformer}>
                    {metrics.bestPerformer}
                  </h2>
                  <span className="metric-subtext">Highest accuracy model class</span>
                  <div style={{ position: 'absolute', right: '-10px', bottom: '-10px', opacity: 0.08, rotate: '12deg', color: 'var(--text-primary)' }}>
                    <Award size={80} />
                  </div>
                </div>

                <div className="metric-card">
                  <span className="metric-label">Models Trained</span>
                  <h2 className="metric-value">{metrics.modelsTrained}</h2>
                  <span className="metric-subtext">Total tuning configurations</span>
                  <div style={{ position: 'absolute', right: '-10px', bottom: '-10px', opacity: 0.08, rotate: '12deg', color: 'var(--text-primary)' }}>
                    <Cpu size={80} />
                  </div>
                </div>

                <div className="metric-card">
                  <span className="metric-label">Avg. Accuracy</span>
                  <h2 className="metric-value">{metrics.avgAccuracy}</h2>
                  <span className="metric-subtext">Stratified validation hold-outs</span>
                  <div style={{ position: 'absolute', right: '-10px', bottom: '-10px', opacity: 0.08, rotate: '12deg', color: 'var(--text-primary)' }}>
                    <Trophy size={80} />
                  </div>
                </div>
              </section>

              {/* Active Experiments */}
              <div className="panel" style={{ backgroundColor: 'var(--bg-tertiary)', border: '1px solid var(--border-beige-deep)', display: 'flex', flexDirection: 'column', padding: '24px' }}>
                <h3 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '20px' }}>Active Experiments</h3>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {/* Render active running jobs on server */}
                  {systemStats.active_jobs && systemStats.active_jobs.length > 0 ? (
                    systemStats.active_jobs.map((job) => (
                      <div key={job.job_id} style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)', padding: '16px', borderRadius: '8px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontWeight: '600', fontSize: '14px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={job.filename}>
                            {job.filename}
                          </span>
                          <span style={{ fontSize: '10px', fontWeight: '700', textTransform: 'uppercase', backgroundColor: 'rgba(255, 95, 31, 0.15)', color: 'var(--accent-color)', padding: '3px 8px', borderRadius: '4px' }}>
                            {job.progress}%
                          </span>
                        </div>
                        <div style={{ width: '100%', height: '4px', backgroundColor: 'var(--border-color)', borderRadius: '2px', overflow: 'hidden' }}>
                          <div style={{ width: `${job.progress}%`, height: '100%', backgroundColor: 'var(--accent-color)' }} />
                        </div>
                        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                          {job.current_log || 'Fitting pipelines...'}
                        </span>
                      </div>
                    ))
                  ) : jobProgress.status === 'RUNNING' ? (
                    <div style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)', padding: '16px', borderRadius: '8px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontWeight: '600', fontSize: '14px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {uploadInfo?.filename || 'Active_Job'}
                        </span>
                        <span style={{ fontSize: '10px', fontWeight: '700', textTransform: 'uppercase', backgroundColor: 'rgba(255, 95, 31, 0.15)', color: 'var(--accent-color)', padding: '3px 8px', borderRadius: '4px' }}>
                          Fitting
                        </span>
                      </div>
                      <div style={{ width: '100%', height: '4px', backgroundColor: 'var(--border-color)', borderRadius: '2px', overflow: 'hidden' }}>
                        <div style={{ width: `${jobProgress.progress}%`, height: '100%', backgroundColor: 'var(--accent-color)', animation: 'pulse 1.5s infinite' }} />
                      </div>
                      <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                        {jobProgress.progress}% &bull; {jobProgress.current_log || 'Fitting pipelines...'}
                      </span>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '32px 16px', border: '1px dashed var(--border-color)', borderRadius: '8px', color: 'var(--text-muted)', fontSize: '13px', backgroundColor: 'var(--bg-cream-soft)' }}>
                      No active background tasks.
                    </div>
                  )}
                </div>
                
                <button 
                  onClick={() => {
                    if (!uploadInfo) {
                      setActiveTab('UPLOAD');
                    } else if (!analysisInfo) {
                      setActiveTab('PREVIEW');
                    } else if (jobProgress.status === 'RUNNING') {
                      setActiveTab('BATTLE');
                    } else {
                      setActiveTab('RESULTS');
                    }
                  }}
                  className="btn btn-secondary" 
                  style={{ width: '100%', marginTop: '20px', fontSize: '13px', padding: '10px 16px' }}
                >
                  View Pipeline Interface
                </button>
              </div>

              {/* Performance Leaderboard */}
              <section className="panel" style={{ padding: 0, overflow: 'hidden' }}>
                <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border-color)', backgroundColor: 'var(--bg-cream-soft)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h3 style={{ fontSize: '20px', fontWeight: '600', margin: 0 }}>Performance Leaderboard</h3>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Benchmark comparisons</span>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table className="data-table" style={{ width: '100%' }}>
                    <thead>
                      <tr>
                        <th>Model Name</th>
                        <th>Dataset Source</th>
                        <th style={{ textAlign: 'center' }}>Target Parameter</th>
                        <th style={{ textAlign: 'right' }}>Top Accuracy</th>
                      </tr>
                    </thead>
                    <tbody>
                      {systemStats.past_jobs && systemStats.past_jobs.length > 0 ? (
                        systemStats.past_jobs.map((job, idx) => (
                          <tr key={job.job_id} style={{ backgroundColor: idx === 0 ? 'var(--accent-light)' : 'transparent' }}>
                            <td style={{ fontWeight: '700' }}>
                              {idx === 0 ? '🏆 ' : ''}{job.best_model}
                            </td>
                            <td style={{ maxWidth: '240px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={job.filename}>
                              {job.filename}
                            </td>
                            <td style={{ textAlign: 'center', fontFamily: 'var(--font-mono)' }}>
                              {job.target_column}
                            </td>
                            <td style={{ textAlign: 'right', fontWeight: '700', color: 'var(--accent-color)' }}>
                              {(job.best_score * 100).toFixed(2)}%
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan="4" style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '24px' }}>
                            No past experiments. Upload a dataset and train models to see them here!
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          )}

          {/* 2. UPLOAD VIEW */}
          {activeTab === 'UPLOAD' && (
            <CsvUpload onUploadSuccess={handleUploadSuccess} />
          )}

          {/* 3. PREVIEW VIEW */}
          {activeTab === 'PREVIEW' && uploadInfo && (
            <DataPreview 
              uploadInfo={uploadInfo} 
              onAnalyzeComplete={handleAnalyzeComplete} 
            />
          )}

          {/* 4. BATTLE VIEW */}
          {activeTab === 'BATTLE' && (
            <ModelBattle jobProgress={jobProgress} />
          )}

          {/* 5. RESULTS VIEW */}
          {activeTab === 'RESULTS' && jobProgress.status === 'COMPLETED' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              
              {/* Analysis Info and Advisor Card */}
              <div className="grid-2">
                {/* Advisor Card */}
                <div className="panel" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                    <Layers size={20} style={{ color: 'var(--accent-color)' }} />
                    <h4 style={{ margin: 0 }}>Meta-Learning Engine Recommendation</h4>
                  </div>
                  <p style={{ fontSize: '14px', marginBottom: '16px' }}>
                    Based on historical dataset profiles in SQLite database, our recommender advisor predicted:
                  </p>
                  
                  <div style={{
                    padding: '16px',
                    backgroundColor: 'var(--bg-cream-soft)',
                    borderRadius: '8px',
                    borderLeft: '4px solid var(--accent-color)',
                    marginBottom: '16px',
                    border: '1px solid var(--border-color)',
                    borderLeftWidth: '4px'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '4px' }}>
                      <strong style={{ fontSize: '18px', color: 'var(--text-primary)' }}>
                        {analysisInfo?.meta_learning_advice.best_model}
                      </strong>
                      <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                        Confidence: {(analysisInfo?.meta_learning_advice.confidence_score * 100).toFixed(0)}%
                      </span>
                    </div>
                    <p style={{ fontSize: '13px', margin: 0, color: 'var(--text-secondary)' }}>
                      {analysisInfo?.meta_learning_advice.justification}
                    </p>
                  </div>

                  <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                    <strong>Actual Winner: </strong> {jobProgress.best_model} (Accuracy: {(jobProgress.best_score * 100).toFixed(2)}%)
                  </div>
                </div>

                {/* Dataset Personality Box */}
                <div className="personality-box" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', margin: 0 }}>
                  <div className="personality-title" style={{ margin: '0 0 8px 0' }}>
                    <span>Dataset personality:</span>
                    <span className="personality-badge">
                      {analysisInfo?.personality.complexity_category} Complexity
                    </span>
                  </div>
                  <strong style={{ fontSize: '18px', color: 'var(--accent-color)', display: 'block', marginBottom: '8px', fontFamily: 'var(--font-display)', fontWeight: '400' }}>
                    {analysisInfo?.personality.title}
                  </strong>
                  <p style={{ fontSize: '13px', margin: 0, color: 'var(--text-secondary)' }}>
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

      <style jsx global>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  );
}
