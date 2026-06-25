import os
import uuid
import json
import shutil
import pandas as pd
from fastapi import FastAPI, UploadFile, File, Form, BackgroundTasks, HTTPException, Response
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

# Load environment variables from .env
load_dotenv()

import database
import storage
from ml.analysis import analyze_dataset
from ml.meta_learning import get_combined_recommendation
from ml.training import train_all_models
from ml.explanation import generate_report
from ml.report import generate_pdf_report

app = FastAPI(title="OptiML API", version="1.0.1")

# Enable CORS for Next.js frontend (production Vercel and local development)
allowed_origins_str = os.getenv("ALLOWED_ORIGINS")
if allowed_origins_str:
    allowed_origins = [origin.strip().rstrip("/") for origin in allowed_origins_str.split(",") if origin.strip()]
    # Always allow local development origins to ensure seamless local client testing
    local_origins = ["http://localhost:3000", "http://127.0.0.1:3000", "http://localhost:3001", "http://127.0.0.1:3001"]
    for lo in local_origins:
        if lo not in allowed_origins:
            allowed_origins.append(lo)
else:
    allowed_origins = ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Set up local temp directories (will act as scratchpad /tmp equivalent)
UPLOAD_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "uploads")
PDF_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "reports")

# Ensure folders exist
os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(PDF_DIR, exist_ok=True)

# Initialize database
database.init_db()

class AnalyzeRequest(BaseModel):
    job_id: str
    target_column: str

class TrainRequest(BaseModel):
    job_id: str
    target_column: str

def async_training_pipeline(job_id: str, target_column: str):
    """
    Executes the dataset analysis, model training, report generation, and PDF export
    in a background thread, using Supabase Storage as file exchange medium.
    """
    local_csv_path = os.path.join(UPLOAD_DIR, f"{job_id}.csv")
    local_pdf_path = os.path.join(PDF_DIR, f"report_{job_id}.pdf")
    
    try:
        # 1. Download CSV from Supabase Storage
        storage.download_file("datasets", f"{job_id}.csv", local_csv_path)
        
        # Load dataset
        df = pd.read_csv(local_csv_path)
        
        # Update status to running & log progress
        def progress_tracker(message, percentage):
            progress_data = {
                "progress": percentage,
                "current_log": message
            }
            # Temporarily save progress metrics in the database
            database.update_job_status(
                job_id=job_id,
                status="RUNNING",
                results_dict=progress_data
            )
            
        progress_tracker("Extracting dataset structure and meta-features...", 10)
        
        # 2. Run analysis
        meta_results = analyze_dataset(df, target_column)
        
        progress_tracker("Calculating meta-learning recommendations...", 15)
        meta_learning_advice = get_combined_recommendation(meta_results)
        
        # 3. Train all models
        training_results = train_all_models(
            job_id=job_id,
            df=df,
            target_col=target_column,
            progress_callback=progress_tracker
        )
        
        progress_tracker("Generating AI Research Report explaining pipeline convergence...", 90)
        ai_report = generate_report(meta_results, training_results)
        
        # 4. Generate local PDF
        progress_tracker("Exporting document structure to publication PDF...", 95)
        generate_pdf_report(meta_results, training_results, local_pdf_path)
        
        # 5. Upload PDF to Supabase Storage
        storage.upload_file("reports", local_pdf_path, f"report_{job_id}.pdf", mime_type="application/pdf")
        
        # Compile everything
        final_results = {
            "meta_features": {
                "num_rows": meta_results["num_rows"],
                "num_cols": meta_results["num_cols"],
                "num_features": meta_results["num_features"],
                "missing_ratio": meta_results["missing_ratio"],
                "skewness_mean": meta_results["skewness_mean"],
                "correlation_mean": meta_results["correlation_mean"],
                "complexity_score": meta_results["complexity_score"],
                "target_stats": meta_results["target_stats"]
            },
            "meta_learning_advice": meta_learning_advice,
            "leaderboard": training_results["leaderboard"],
            "feature_importances": training_results["feature_importances"],
            "ai_report": ai_report,
            "pdf_path": f"reports/report_{job_id}.pdf"
        }
        
        # Update database with final successful run
        database.update_job_status(
            job_id=job_id,
            status="COMPLETED",
            results_dict=final_results,
            personality=meta_results["personality"],
            num_rows=meta_results["num_rows"],
            num_cols=meta_results["num_cols"],
            missing_ratio=meta_results["missing_ratio"],
            categorical_ratio=meta_results["categorical_ratio"],
            skewness_mean=meta_results["skewness_mean"],
            correlation_mean=meta_results["correlation_mean"],
            complexity_score=meta_results["complexity_score"],
            best_model=training_results["best_model"],
            best_score=training_results["best_score"]
        )
        print(f"Job {job_id} completed successfully!")
        
    except Exception as e:
        import traceback
        error_msg = f"Training pipeline failed: {str(e)}\n{traceback.format_exc()}"
        print(error_msg)
        database.update_job_status(
            job_id=job_id,
            status="FAILED",
            results_dict={"error": error_msg}
        )
    finally:
        # Clean up temporary local files to keep local disk usage at zero
        if os.path.exists(local_csv_path):
            try:
                os.remove(local_csv_path)
            except Exception as clean_err:
                print(f"Error removing temp CSV: {clean_err}")
        if os.path.exists(local_pdf_path):
            try:
                os.remove(local_pdf_path)
            except Exception as clean_err:
                print(f"Error removing temp PDF: {clean_err}")

@app.post("/upload-dataset")
async def upload_dataset(file: UploadFile = File(...)):
    """
    Receives CSV file, generates a Job ID, saves the file temporarily to parse,
    uploads to Supabase Storage, parses columns for default selections, and returns metadata.
    """
    if not file.filename.endswith('.csv'):
        raise HTTPException(status_code=400, detail="Only CSV datasets are supported.")
        
    job_id = str(uuid.uuid4())
    temp_filepath = os.path.join(UPLOAD_DIR, f"{job_id}.csv")
    
    # Save file temporarily locally
    with open(temp_filepath, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    try:
        # Clear storage and database for user privacy before saving/creating anything new
        storage.clear_all_storage()
        database.clear_all_jobs_and_memory()

        # 1. Upload CSV to Supabase Storage
        storage.upload_file("datasets", temp_filepath, f"{job_id}.csv", mime_type="text/csv")
        
        # Load preview
        df = pd.read_csv(temp_filepath, nrows=100)
        columns = list(df.columns)
        
        # Default target is last column
        default_target = columns[-1] if columns else ""
        
        # Save placeholder job in database
        database.create_job(job_id, file.filename)
        
        # Quick sample data preview
        preview_data = df.head(10).where(pd.notnull(df), None).to_dict(orient="records")
        
        return {
            "job_id": job_id,
            "filename": file.filename,
            "columns": columns,
            "default_target": default_target,
            "preview_data": preview_data,
            "num_rows_sample": len(df)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing CSV: {str(e)}")
    finally:
        # Delete local temp CSV
        if os.path.exists(temp_filepath):
            try:
                os.remove(temp_filepath)
            except Exception as clean_err:
                print(f"Error removing temp CSV: {clean_err}")

@app.post("/analyze")
async def analyze(request: AnalyzeRequest):
    """
    Synchronously downloads dataset from Supabase Storage, runs meta-feature extraction,
    generates recommendations, and cleans up local temp file.
    """
    job_id = request.job_id
    target_column = request.target_column
    
    job = database.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found.")
        
    temp_filepath = os.path.join(UPLOAD_DIR, f"{job_id}.csv")
    
    try:
        # Download from Supabase
        storage.download_file("datasets", f"{job_id}.csv", temp_filepath)
        
        df = pd.read_csv(temp_filepath)
        meta_results = analyze_dataset(df, target_column)
        meta_learning_advice = get_combined_recommendation(meta_results)
        
        return {
            "meta_features": {
                "num_rows": meta_results["num_rows"],
                "num_cols": meta_results["num_cols"],
                "num_features": meta_results["num_features"],
                "missing_ratio": meta_results["missing_ratio"],
                "skewness_mean": meta_results["skewness_mean"],
                "correlation_mean": meta_results["correlation_mean"],
                "complexity_score": meta_results["complexity_score"],
                "target_stats": meta_results["target_stats"]
            },
            "personality": meta_results["personality"],
            "meta_learning_advice": meta_learning_advice
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")
    finally:
        # Clean up temp local file
        if os.path.exists(temp_filepath):
            try:
                os.remove(temp_filepath)
            except Exception as clean_err:
                print(f"Error removing temp CSV: {clean_err}")

@app.post("/train-models")
async def train_models(request: TrainRequest, background_tasks: BackgroundTasks):
    """
    Submits an async training job. Returns job_id immediately while pipeline
    processes models in background.
    """
    job_id = request.job_id
    target_column = request.target_column
    
    job = database.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job ID not found.")
        
    # Queue background task (the task will pull CSV from Supabase Storage autonomously)
    background_tasks.add_task(async_training_pipeline, job_id, target_column)
    
    # Update job state in database to show it is queued
    database.update_job_status(
        job_id, 
        "RUNNING", 
        results_dict={"progress": 2, "current_log": "Queued training job..."}
    )
    
    return {"job_id": job_id, "status": "QUEUED"}

@app.get("/results/{job_id}")
async def get_results(job_id: str):
    """
    Retrieves current state of training, leaderboard scores, or errors.
    """
    job = database.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job ID not found.")
        
    # Format return
    response_data = {
        "job_id": job["job_id"],
        "filename": job["filename"],
        "status": job["status"],
        "created_at": job["created_at"]
    }
    
    if job["status"] == "COMPLETED":
        results = job["results"]
        response_data.update({
            "meta_features": results.get("meta_features"),
            "meta_learning_advice": results.get("meta_learning_advice"),
            "leaderboard": results.get("leaderboard"),
            "feature_importances": results.get("feature_importances"),
            "ai_report": results.get("ai_report"),
            "personality": job["personality"],
            "best_model": job["best_model"],
            "best_score": job["best_score"]
        })
    elif job["status"] == "RUNNING":
        progress_info = job["results"] if isinstance(job["results"], dict) else {}
        response_data.update({
            "progress": progress_info.get("progress", 0),
            "current_log": progress_info.get("current_log", "Initializing...")
        })
    elif job["status"] == "FAILED":
        error_info = job["results"] if isinstance(job["results"], dict) else {}
        response_data.update({
            "error": error_info.get("error", "An unknown error occurred during training.")
        })
        
    return response_data

@app.get("/results/{job_id}/pdf")
async def get_pdf(job_id: str):
    """
    Serves the generated PDF report download from Supabase Storage.
    """
    try:
        pdf_bytes = storage.get_file_bytes("reports", f"report_{job_id}.pdf")
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={
                "Content-Disposition": f"attachment; filename=OptiML_Report_{job_id}.pdf"
            }
        )
    except Exception as e:
        raise HTTPException(status_code=404, detail="PDF report not found. Wait for training to complete.")

@app.get("/system-stats")
async def get_system_stats_endpoint():
    """
    Retrieves system-wide metrics (total datasets, models trained, average accuracy)
    and list of active/completed jobs dynamically.
    """
    try:
        stats = database.get_system_stats()
        return stats
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch system stats: {str(e)}")

@app.get("/")
async def root():
    """
    Friendly root endpoint with system diagnostics.
    """
    diagnostics = {}
    
    # 1. Test database connection
    try:
        from sqlalchemy import text
        db = database.SessionLocal()
        db.execute(text("SELECT 1"))
        diagnostics["database"] = "Connected successfully"
        db.close()
    except Exception as db_err:
        diagnostics["database"] = f"Failed: {str(db_err)}"
        
    # 2. Test Supabase Client & Storage
    if storage.supabase_client:
        diagnostics["supabase_url"] = storage.SUPABASE_URL
        try:
            buckets = storage.supabase_client.storage.list_buckets()
            diagnostics["supabase_storage"] = {
                "status": "Connected successfully",
                "buckets": [b.name for b in buckets]
            }
        except Exception as storage_err:
            diagnostics["supabase_storage"] = {
                "status": f"Failed with error: {str(storage_err)}"
            }
            # Execute raw HTTP request using httpx to pinpoint exact API status/body
            try:
                import httpx
                headers = {
                    "Authorization": f"Bearer {storage.SUPABASE_KEY}",
                    "apikey": storage.SUPABASE_KEY
                }
                # Storage v1 buckets endpoint
                url = f"{storage.SUPABASE_URL}/storage/v1/bucket"
                response = httpx.get(url, headers=headers, timeout=5.0)
                diagnostics["supabase_storage_raw_api"] = {
                    "url": url,
                    "status_code": response.status_code,
                    "response_body": response.text[:500]
                }
            except Exception as raw_err:
                diagnostics["supabase_storage_raw_api"] = {
                    "error": f"Failed raw API diagnostic: {str(raw_err)}"
                }
    else:
        diagnostics["supabase_client"] = "Not initialized (missing environment variables)"
        
    return {
        "status": "healthy",
        "message": "Welcome to the OptiML Backend API!",
        "diagnostics": diagnostics,
        "docs": "/docs",
        "health": "/health",
        "allowed_origins": allowed_origins,
    }

@app.get("/health")
async def health_check():
    """
    Service health-check endpoint for Render / AWS load balancers.
    """
    return {"status": "ok"}

if __name__ == "__main__":
    import uvicorn
    # Read port from Render's port environment variable or default to 8000
    port = int(os.getenv("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=False)
