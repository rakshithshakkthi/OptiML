import os
import uuid
import json
import shutil
import pandas as pd
from fastapi import FastAPI, UploadFile, File, Form, BackgroundTasks, HTTPException
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

import database
from ml.analysis import analyze_dataset
from ml.meta_learning import get_combined_recommendation
from ml.training import train_all_models
from ml.explanation import generate_report
from ml.report import generate_pdf_report

app = FastAPI(title="OptiML API", version="1.0.0")

# Enable CORS for Next.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "uploads")
PDF_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "reports")

# Clear existing uploads and reports folders on startup to maintain zero persistent memory
if os.path.exists(UPLOAD_DIR):
    shutil.rmtree(UPLOAD_DIR)
if os.path.exists(PDF_DIR):
    shutil.rmtree(PDF_DIR)

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

def async_training_pipeline(job_id: str, filepath: str, target_column: str):
    """
    Executes the dataset analysis, model training, report generation, and PDF export
    in a background thread.
    """
    try:
        # Load dataset
        df = pd.read_csv(filepath)
        
        # 1. Update status to running & log progress
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
        
        # 4. Generate PDF
        pdf_filename = f"report_{job_id}.pdf"
        pdf_path = os.path.join(PDF_DIR, pdf_filename)
        progress_tracker("Exporting document structure to publication PDF...", 95)
        generate_pdf_report(meta_results, training_results, pdf_path)
        
        # 5. Compile everything
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
            "pdf_path": pdf_path
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

@app.post("/upload-dataset")
async def upload_dataset(file: UploadFile = File(...)):
    """
    Receives CSV file, generates a Job ID, saves the file,
    parses columns to suggest categorical/numerical classes, and target candidate.
    """
    if not file.filename.endswith('.csv'):
        raise HTTPException(status_code=400, detail="Only CSV datasets are supported.")
        
    job_id = str(uuid.uuid4())
    filepath = os.path.join(UPLOAD_DIR, f"{job_id}.csv")
    
    # Save file
    with open(filepath, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    try:
        # Load preview
        df = pd.read_csv(filepath, nrows=100)
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
        if os.path.exists(filepath):
            os.remove(filepath)
        raise HTTPException(status_code=500, detail=f"Error reading CSV: {str(e)}")

@app.post("/analyze")
async def analyze(request: AnalyzeRequest):
    """
    Synchronously runs meta-feature extraction and generates advisor recommendations.
    Usually very fast, runs before full training model battle.
    """
    job_id = request.job_id
    target_column = request.target_column
    
    job = database.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found.")
        
    filepath = os.path.join(UPLOAD_DIR, f"{job_id}.csv")
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="Dataset file not found.")
        
    try:
        df = pd.read_csv(filepath)
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
        
    filepath = os.path.join(UPLOAD_DIR, f"{job_id}.csv")
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="Dataset file not found.")
        
    # Queue background task
    background_tasks.add_task(async_training_pipeline, job_id, filepath, target_column)
    
    # Update job state in database to show it is queued
    database.update_job_status(job_id, "RUNNING", results_dict={"progress": 2, "current_log": "Queued training job..."})
    
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
        # Return progress percentage and logs
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
    Serves the generated PDF report download.
    """
    pdf_path = os.path.join(PDF_DIR, f"report_{job_id}.pdf")
    if not os.path.exists(pdf_path):
        raise HTTPException(status_code=404, detail="PDF report not found. Wait for training to complete.")
        
    return FileResponse(
        path=pdf_path,
        media_type="application/pdf",
        filename=f"OptiML_Report_{job_id}.pdf"
    )

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

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)

