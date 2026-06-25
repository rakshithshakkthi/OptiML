'use client';

import React, { useEffect, useRef } from 'react';
import { Swords, Play, CheckCircle, AlertTriangle, Shield, Award, Cpu, Zap, Eye, Binary } from 'lucide-react';

export default function ModelBattle({ jobProgress }) {
  const logEndRef = useRef(null);

  // Auto-scroll logs to bottom
  useEffect(() => {
    if (logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [jobProgress.logs]);

  // Model details matching the list
  const modelsList = [
    { name: "Logistic Regression", icon: <Binary size={24} />, desc: "Linear separator" },
    { name: "Random Forest", icon: <Shield size={24} />, desc: "Ensemble bagging" },
    { name: "XGBoost", icon: <Zap size={24} />, desc: "Gradient boosting" },
    { name: "SVM", icon: <Cpu size={24} />, desc: "Optimal margin kernel" },
    { name: "KNN", icon: <Swords size={24} />, desc: "Distance cluster density" }
  ];

  // Helper to determine status class
  const getModelStatus = (modelName) => {
    const status = jobProgress.status;
    const progress = jobProgress.progress || 0;
    const currentLog = jobProgress.current_log || "";
    
    // If complete, match leaderboard score
    if (status === "COMPLETED" && jobProgress.leaderboard) {
      const idx = jobProgress.leaderboard.findIndex(m => m.model === modelName);
      if (idx === 0) return "best";
      return "finished";
    }

    if (status === "FAILED") return "eliminated";

    // Approximate active model based on progress brackets or logs
    const isLRActive = progress > 15 && progress <= 35 && currentLog.includes("Logistic");
    const isRFActive = progress > 30 && progress <= 55 && currentLog.includes("Random");
    const isXGActive = progress > 50 && progress <= 75 && currentLog.includes("XGBoost");
    const isSVMActive = progress > 70 && progress <= 90 && currentLog.includes("SVM");
    const isKNNActive = progress > 85 && progress < 95 && currentLog.includes("KNN");

    if (modelName === "Logistic Regression" && isLRActive) return "active";
    if (modelName === "Random Forest" && isRFActive) return "active";
    if (modelName === "XGBoost" && isXGActive) return "active";
    if (modelName === "SVM" && isSVMActive) return "active";
    if (modelName === "KNN" && isKNNActive) return "active";

    // Completed models (already passed in progress sequence)
    const isLRDone = progress > 35;
    const isRFDone = progress > 55;
    const isXGDone = progress > 75;
    const isSVMDone = progress > 90;
    const isKNNDone = progress >= 95;

    if (modelName === "Logistic Regression" && isLRDone) return "finished";
    if (modelName === "Random Forest" && isRFDone) return "finished";
    if (modelName === "XGBoost" && isXGDone) return "finished";
    if (modelName === "SVM" && isSVMDone) return "finished";
    if (modelName === "KNN" && isKNNDone) return "finished";

    // Locked/Pending models
    return "pending";
  };

  const getModelScore = (modelName) => {
    if (jobProgress.status === "COMPLETED" && jobProgress.model_details) {
      return jobProgress.model_details[modelName]?.accuracy;
    }
    // Check if we can extract intermediate scores from logs (not needed for simple mock, but good)
    return null;
  };

  return (
    <div className="battle-container">
      <div className="panel" style={{ marginBottom: '0px', border: '1px solid var(--border-color)' }}>
        <div className="flex-between" style={{ marginBottom: '1.5rem' }}>
          <div>
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', fontWeight: '400', margin: 0 }}>
              Model Training Dashboard
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
              Monitoring hyperparameter optimization and cross-validated training loops in real time.
            </p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
            <span style={{ fontSize: '11px', fontWeight: '600', textTransform: 'uppercase', color: 'var(--accent-color)', letterSpacing: '0.05em' }}>
              Training Progress
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '4px' }}>
              <div style={{
                width: '120px',
                height: '6px',
                backgroundColor: 'var(--border-color)',
                borderRadius: '3px',
                overflow: 'hidden'
              }}>
                <div style={{
                  width: `${jobProgress.progress || 5}%`,
                  height: '100%',
                  backgroundColor: 'var(--accent-color)',
                  transition: 'width 0.4s ease'
                }} />
              </div>
              <span style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-primary)' }}>
                {jobProgress.progress || 5}%
              </span>
            </div>
          </div>
        </div>

        {/* Competitor Grid */}
        <div className="battle-arena" style={{ backgroundColor: 'var(--bg-cream-soft)', border: '1px solid var(--border-color)' }}>
          {modelsList.map((model) => {
            const status = getModelStatus(model.name);
            const score = getModelScore(model.name);
            
            return (
              <div 
                key={model.name} 
                className={`battle-card ${status}`}
                style={{
                  borderWidth: status === 'best' ? '2px' : '1px'
                }}
              >
                {status === "best" && (
                  <div style={{
                    position: 'absolute',
                    top: '-10px',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    backgroundColor: 'var(--accent-color)',
                    color: '#ffffff',
                    padding: '0.15rem 0.5rem',
                    borderRadius: '4px',
                    fontSize: '9px',
                    fontWeight: '800',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '2px',
                    boxShadow: 'var(--shadow-sm)',
                    letterSpacing: '0.05em'
                  }}>
                    <Award size={10} /> OPTIMAL
                  </div>
                )}
                
                <div style={{
                  color: status === 'active' ? 'var(--accent-color)' : status === 'best' ? 'var(--accent-color)' : 'var(--text-secondary)',
                  display: 'flex',
                  justifyContent: 'center',
                  marginBottom: '0.25rem'
                }}>
                  {model.icon}
                </div>

                <div className="battle-card-name" style={{ fontSize: '13px', fontWeight: '600' }}>{model.name}</div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{model.desc}</div>

                <div style={{ marginTop: 'auto', borderTop: '1px solid var(--border-color)', paddingTop: '0.5rem' }}>
                  {score !== null ? (
                    <div>
                      <div className="battle-card-score" style={{ fontWeight: '700' }}>{(score * 100).toFixed(1)}%</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>accuracy</div>
                    </div>
                  ) : status === "active" ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                      <div style={{
                        display: 'inline-block',
                        width: '12px',
                        height: '12px',
                        border: '2px solid var(--accent-color)',
                        borderTopColor: 'transparent',
                        borderRadius: '50%',
                        animation: 'spin 1s linear infinite'
                      }} />
                      <div className="battle-card-status" style={{ color: 'var(--accent-color)', fontSize: '11px', fontWeight: '600' }}>fitting...</div>
                    </div>
                  ) : status === "finished" ? (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '3px', color: 'var(--text-muted)' }}>
                      <CheckCircle size={10} style={{ color: 'var(--text-muted)' }} />
                      <span className="battle-card-status" style={{ fontSize: '11px' }}>completed</span>
                    </div>
                  ) : (
                    <span className="battle-card-status" style={{ fontSize: '11px' }}>queued</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Timeline Log Console */}
        <h4 style={{ marginTop: '1.75rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '14px', color: 'var(--text-primary)', fontWeight: '600' }}>
          <Eye size={14} style={{ color: 'var(--accent-color)' }} />
          Optimization & Training Execution Logs
        </h4>
        <div className="log-panel">
          {jobProgress.logs && jobProgress.logs.map((log, index) => (
            <div key={index} className="log-entry">
              <span className="log-timestamp">[{new Date(log.time).toLocaleTimeString()}]</span>
              <span className="log-text">{log.text}</span>
            </div>
          ))}
          <div ref={logEndRef} />
        </div>
      </div>

      <style jsx global>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
