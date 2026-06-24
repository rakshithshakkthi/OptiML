import sqlite3
import json
import os

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "metaml.db")

def get_db_connection():
    conn = sqlite3.connect(DB_PATH, timeout=30.0)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Drop existing tables to start fresh every time the app initializes
    cursor.execute("DROP TABLE IF EXISTS jobs")
    cursor.execute("DROP TABLE IF EXISTS meta_memory")
    
    # Jobs / runs table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS jobs (
        job_id TEXT PRIMARY KEY,
        filename TEXT NOT NULL,
        num_rows INTEGER,
        num_cols INTEGER,
        missing_ratio REAL,
        categorical_ratio REAL,
        skewness_mean REAL,
        correlation_mean REAL,
        complexity_score REAL,
        best_model TEXT,
        best_score REAL,
        status TEXT NOT NULL,
        results TEXT, -- JSON string
        personality TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)
    
    # Meta-learning memory table (stores past dataset characteristics -> best model pairs)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS meta_memory (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        dataset_name TEXT,
        num_rows INTEGER,
        num_cols INTEGER,
        missing_ratio REAL,
        categorical_ratio REAL,
        skewness_mean REAL,
        correlation_mean REAL,
        complexity_score REAL,
        best_model TEXT NOT NULL,
        best_score REAL NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)
    
    conn.commit()
    conn.close()

def create_job(job_id, filename):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
    INSERT INTO jobs (job_id, filename, status)
    VALUES (?, ?, 'PENDING')
    """, (job_id, filename))
    conn.commit()
    conn.close()

def update_job_status(job_id, status, results_dict=None, personality=None, 
                      num_rows=None, num_cols=None, missing_ratio=None, 
                      categorical_ratio=None, skewness_mean=None, correlation_mean=None,
                      complexity_score=None, best_model=None, best_score=None):
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        
        if status == 'COMPLETED' and results_dict:
            results_str = json.dumps(results_dict)
            personality_str = json.dumps(personality) if isinstance(personality, dict) else personality
            
            # Fetch the filename from the database to avoid NameError
            cursor.execute("SELECT filename FROM jobs WHERE job_id = ?", (job_id,))
            filename_row = cursor.fetchone()
            filename = filename_row["filename"] if filename_row else "unknown_dataset.csv"
            
            cursor.execute("""
            UPDATE jobs
            SET status = ?, results = ?, personality = ?, num_rows = ?, num_cols = ?,
                missing_ratio = ?, categorical_ratio = ?, skewness_mean = ?, correlation_mean = ?,
                complexity_score = ?, best_model = ?, best_score = ?
            WHERE job_id = ?
            """, (status, results_str, personality_str, num_rows, num_cols, missing_ratio,
                  categorical_ratio, skewness_mean, correlation_mean, complexity_score,
                  best_model, best_score, job_id))
            
            # Also store this run in the meta-learning memory for future predictions!
            cursor.execute("""
            INSERT INTO meta_memory (
                dataset_name, num_rows, num_cols, missing_ratio, 
                categorical_ratio, skewness_mean, correlation_mean, 
                complexity_score, best_model, best_score
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (os.path.basename(filename), num_rows, num_cols, missing_ratio,
                  categorical_ratio, skewness_mean, correlation_mean, complexity_score,
                  best_model, best_score))
        else:
            results_str = json.dumps(results_dict) if results_dict else None
            if results_str:
                cursor.execute("""
                UPDATE jobs
                SET status = ?, results = ?
                WHERE job_id = ?
                """, (status, results_str, job_id))
            else:
                cursor.execute("""
                UPDATE jobs
                SET status = ?
                WHERE job_id = ?
                """, (status, job_id))
            
        conn.commit()
    finally:
        conn.close()

def get_job(job_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM jobs WHERE job_id = ?", (job_id,))
    row = cursor.fetchone()
    conn.close()
    if row:
        res = dict(row)
        if res["results"]:
            res["results"] = json.loads(res["results"])
        return res
    return None

def get_meta_memory():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM meta_memory")
    rows = cursor.fetchall()
    conn.close()
    return [dict(r) for r in rows]

def get_system_stats():
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Count of distinct datasets in meta_memory
    cursor.execute("SELECT COUNT(DISTINCT dataset_name) as count FROM meta_memory")
    total_datasets = cursor.fetchone()["count"]
    
    # Count of completed runs
    cursor.execute("SELECT COUNT(*) as count FROM jobs WHERE status = 'COMPLETED'")
    completed_jobs = cursor.fetchone()["count"]
    
    # Models trained (each completed job trains 5 models)
    total_models_trained = completed_jobs * 5
    
    # Average accuracy across all datasets in meta_memory
    cursor.execute("SELECT AVG(best_score) as avg_score FROM meta_memory")
    avg_score_row = cursor.fetchone()
    avg_accuracy = avg_score_row["avg_score"] if avg_score_row["avg_score"] is not None else 0.0
    
    # Get active runs
    cursor.execute("SELECT job_id, filename, results FROM jobs WHERE status = 'RUNNING'")
    active_jobs = []
    for r in cursor.fetchall():
        res_dict = {}
        if r["results"]:
            try:
                res_dict = json.loads(r["results"])
            except:
                pass
        active_jobs.append({
            "job_id": r["job_id"],
            "filename": r["filename"],
            "progress": res_dict.get("progress", 0),
            "current_log": res_dict.get("current_log", "")
        })
        
    # Get completed jobs leaderboard
    cursor.execute("SELECT job_id, filename, best_model, best_score, results FROM jobs WHERE status = 'COMPLETED' ORDER BY created_at DESC")
    past_jobs = []
    for r in cursor.fetchall():
        res_dict = {}
        if r["results"]:
            try:
                res_dict = json.loads(r["results"])
            except:
                pass
        past_jobs.append({
            "job_id": r["job_id"],
            "filename": r["filename"],
            "best_model": r["best_model"],
            "best_score": r["best_score"],
            "target_column": res_dict.get("meta_features", {}).get("target_stats", {}).get("name", "N/A"),
            "leaderboard": res_dict.get("leaderboard", [])
        })

    conn.close()
    
    return {
        "total_datasets": total_datasets,
        "total_models_trained": total_models_trained,
        "avg_accuracy": round(avg_accuracy * 100, 2),
        "active_jobs": active_jobs,
        "past_jobs": past_jobs
    }

