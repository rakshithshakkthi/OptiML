import os
import json
from sqlalchemy import create_engine, Column, String, Integer, Float, Text, DateTime, func
from sqlalchemy.orm import declarative_base, sessionmaker

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    # Use SQLite fallback
    DB_DIR = os.path.dirname(os.path.abspath(__file__))
    DATABASE_URL = f"sqlite:///{os.path.join(DB_DIR, 'metaml.db')}"
    print(f"DATABASE_URL not found. Falling back to local SQLite database: {DATABASE_URL}")
else:
    # Handle Render/Heroku postgresql:// vs postgres:// URL scheme mismatch
    if DATABASE_URL.startswith("postgres://"):
        DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)
    print("Connecting to external database...")

# SQLite requires different arguments for thread safety
connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}

engine = create_engine(DATABASE_URL, connect_args=connect_args, pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

class Job(Base):
    __tablename__ = "jobs"
    
    job_id = Column(String, primary_key=True)
    filename = Column(String, nullable=False)
    num_rows = Column(Integer)
    num_cols = Column(Integer)
    missing_ratio = Column(Float)
    categorical_ratio = Column(Float)
    skewness_mean = Column(Float)
    correlation_mean = Column(Float)
    complexity_score = Column(Float)
    best_model = Column(String)
    best_score = Column(Float)
    status = Column(String, nullable=False)
    results = Column(Text) # JSON string
    personality = Column(Text)
    created_at = Column(DateTime, default=func.now())

class MetaMemory(Base):
    __tablename__ = "meta_memory"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    dataset_name = Column(String)
    num_rows = Column(Integer)
    num_cols = Column(Integer)
    missing_ratio = Column(Float)
    categorical_ratio = Column(Float)
    skewness_mean = Column(Float)
    correlation_mean = Column(Float)
    complexity_score = Column(Float)
    best_model = Column(String, nullable=False)
    best_score = Column(Float, nullable=False)
    created_at = Column(DateTime, default=func.now())

def init_db():
    RESET_DB = os.getenv("RESET_DB_ON_STARTUP", "false").lower() == "true"
    
    if RESET_DB:
        print("Resetting database tables...")
        Base.metadata.drop_all(bind=engine)
        
    Base.metadata.create_all(bind=engine)
    print("Database tables initialized.")

def create_job(job_id, filename):
    db = SessionLocal()
    try:
        job = Job(job_id=job_id, filename=filename, status="PENDING")
        db.add(job)
        db.commit()
    finally:
        db.close()

def update_job_status(job_id, status, results_dict=None, personality=None, 
                      num_rows=None, num_cols=None, missing_ratio=None, 
                      categorical_ratio=None, skewness_mean=None, correlation_mean=None,
                      complexity_score=None, best_model=None, best_score=None):
    db = SessionLocal()
    try:
        job = db.query(Job).filter(Job.job_id == job_id).first()
        if not job:
            return
            
        job.status = status
        
        if status == 'COMPLETED' and results_dict:
            results_str = json.dumps(results_dict)
            personality_str = json.dumps(personality) if isinstance(personality, dict) else personality
            
            job.results = results_str
            job.personality = personality_str
            job.num_rows = num_rows
            job.num_cols = num_cols
            job.missing_ratio = missing_ratio
            job.categorical_ratio = categorical_ratio
            job.skewness_mean = skewness_mean
            job.correlation_mean = correlation_mean
            job.complexity_score = complexity_score
            job.best_model = best_model
            job.best_score = best_score
            
            # Also store this run in the meta-learning memory
            memory = MetaMemory(
                dataset_name=os.path.basename(job.filename),
                num_rows=num_rows,
                num_cols=num_cols,
                missing_ratio=missing_ratio,
                categorical_ratio=categorical_ratio,
                skewness_mean=skewness_mean,
                correlation_mean=correlation_mean,
                complexity_score=complexity_score,
                best_model=best_model,
                best_score=best_score
            )
            db.add(memory)
        else:
            if results_dict:
                job.results = json.dumps(results_dict)
                
        db.commit()
    finally:
        db.close()

def get_job(job_id):
    db = SessionLocal()
    try:
        job = db.query(Job).filter(Job.job_id == job_id).first()
        if job:
            res = {
                "job_id": job.job_id,
                "filename": job.filename,
                "num_rows": job.num_rows,
                "num_cols": job.num_cols,
                "missing_ratio": job.missing_ratio,
                "categorical_ratio": job.categorical_ratio,
                "skewness_mean": job.skewness_mean,
                "correlation_mean": job.correlation_mean,
                "complexity_score": job.complexity_score,
                "best_model": job.best_model,
                "best_score": job.best_score,
                "status": job.status,
                "results": json.loads(job.results) if job.results else None,
                "personality": job.personality,
                "created_at": job.created_at.isoformat() if job.created_at else None
            }
            return res
        return None
    finally:
        db.close()

def get_meta_memory():
    db = SessionLocal()
    try:
        rows = db.query(MetaMemory).all()
        result = []
        for r in rows:
            result.append({
                "id": r.id,
                "dataset_name": r.dataset_name,
                "num_rows": r.num_rows,
                "num_cols": r.num_cols,
                "missing_ratio": r.missing_ratio,
                "categorical_ratio": r.categorical_ratio,
                "skewness_mean": r.skewness_mean,
                "correlation_mean": r.correlation_mean,
                "complexity_score": r.complexity_score,
                "best_model": r.best_model,
                "best_score": r.best_score,
                "created_at": r.created_at.isoformat() if r.created_at else None
            })
        return result
    finally:
        db.close()

def get_system_stats():
    db = SessionLocal()
    try:
        # Count of distinct datasets in meta_memory
        total_datasets = db.query(func.count(func.distinct(MetaMemory.dataset_name))).scalar() or 0
        
        # Count of completed runs
        completed_jobs = db.query(func.count(Job.job_id)).filter(Job.status == "COMPLETED").scalar() or 0
        
        # Models trained
        total_models_trained = completed_jobs * 5
        
        # Average accuracy
        avg_accuracy = db.query(func.avg(MetaMemory.best_score)).scalar() or 0.0
        
        # Get active runs
        active_rows = db.query(Job).filter(Job.status == "RUNNING").all()
        active_jobs = []
        for r in active_rows:
            res_dict = {}
            if r.results:
                try:
                    res_dict = json.loads(r.results)
                except:
                    pass
            active_jobs.append({
                "job_id": r.job_id,
                "filename": r.filename,
                "progress": res_dict.get("progress", 0),
                "current_log": res_dict.get("current_log", "")
            })
            
        # Get completed jobs leaderboard
        past_rows = db.query(Job).filter(Job.status == "COMPLETED").order_by(Job.created_at.desc()).all()
        past_jobs = []
        for r in past_rows:
            res_dict = {}
            if r.results:
                try:
                    res_dict = json.loads(r.results)
                except:
                    pass
            past_jobs.append({
                "job_id": r.job_id,
                "filename": r.filename,
                "best_model": r.best_model,
                "best_score": r.best_score,
                "target_column": res_dict.get("meta_features", {}).get("target_stats", {}).get("name", "N/A"),
                "leaderboard": res_dict.get("leaderboard", [])
            })
            
        return {
            "total_datasets": total_datasets,
            "total_models_trained": total_models_trained,
            "avg_accuracy": round(float(avg_accuracy) * 100, 2),
            "active_jobs": active_jobs,
            "past_jobs": past_jobs
        }
    finally:
        db.close()
