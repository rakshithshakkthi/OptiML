import os
import sys
import pandas as pd
import numpy as np
from sklearn.datasets import make_classification

# Add current folder to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

import database
from ml.analysis import analyze_dataset
from ml.meta_learning import get_combined_recommendation
from ml.training import train_all_models
from ml.explanation import generate_report
from ml.report import generate_pdf_report

def run_verification():
    print("=== STARTING METAML ML ENGINE VERIFICATION ===")
    
    # 1. Initialize SQLite Database
    print("\n1. Initializing database and pre-seeding...")
    database.init_db()
    print("Database initialized successfully.")
    
    # Verify we can read seeded rows
    memory = database.get_meta_memory()
    print(f"Loaded {len(memory)} historical seeding records.")
    assert len(memory) >= 10, "Database seeding failed!"
    
    # 2. Generate a synthetic dataset
    print("\n2. Generating synthetic classification dataset...")
    X, y = make_classification(
        n_samples=500,
        n_features=8,
        n_informative=5,
        n_redundant=2,
        n_classes=2,
        weights=[0.6, 0.4], # slight class imbalance
        random_state=42
    )
    
    columns = [f"feature_{i}" for i in range(8)]
    df = pd.DataFrame(X, columns=columns)
    
    # Inject a categorical column
    df["region"] = np.random.choice(["East", "West", "North", "South"], size=500)
    
    # Inject some missing values
    mask = np.random.rand(*df.shape) < 0.02
    # Do not inject missing values into target or categorical column for this simple test
    for col in columns[:4]:
        df.loc[mask[:, df.columns.get_loc(col)], col] = np.nan
        
    df["target"] = y
    
    # Save to temp csv
    temp_csv = "temp_synthetic_dataset.csv"
    df.to_csv(temp_csv, index=False)
    print(f"Saved synthetic dataset of shape {df.shape} to {temp_csv}.")
    
    pdf_path = None
    try:
        # 3. Test Dataset Analysis
        print("\n3. Testing dataset analysis...")
        meta_results = analyze_dataset(df, target_column="target")
        print("Analysis completed successfully.")
        print(f"Num rows: {meta_results['num_rows']}, Num features: {meta_results['num_features']}")
        print(f"Missing ratio: {meta_results['missing_ratio']:.4f}")
        print(f"Skewness mean: {meta_results['skewness_mean']:.4f}")
        print(f"Correlation mean: {meta_results['correlation_mean']:.4f}")
        print(f"Complexity Score: {meta_results['complexity_score']:.4f}")
        print(f"Personality title: {meta_results['personality']['title']}")
        
        # 4. Test Meta-Learning Recommendation
        print("\n4. Testing meta-learning recommendation advisor...")
        rec = get_combined_recommendation(meta_results)
        print(f"Best model recommended: {rec['best_model']}")
        print(f"Confidence score: {rec['confidence_score']:.4f}")
        print(f"Justification: {rec['justification']}")
        
        # 5. Test Model Training
        print("\n5. Testing training and tuning pipeline for all 5 models...")
        training_results = train_all_models(
            job_id="test_run",
            df=df,
            target_col="target",
            progress_callback=lambda msg, pct: print(f"  [Callback {pct}%] {msg}")
        )
        
        print("\nTraining complete. Leaderboard results:")
        for idx, entry in enumerate(training_results["leaderboard"], 1):
            print(f"  {idx}. {entry['model']}: Accuracy={entry['accuracy']:.4f}, ROC-AUC={entry['roc_auc']:.4f}, Time={entry['train_time']:.2f}s")
            
        print("\nFeature importances:")
        for item in training_results["feature_importances"][:3]:
            print(f"  {item['feature']}: {item['importance']*100:.2f}%")
            
        # 6. Test AI Report Explanation
        print("\n6. Testing AI research-grade markdown report generation...")
        report = generate_report(meta_results, training_results)
        print("Report generated. Length of report text:", len(report))
        assert len(report) > 1000, "Report is too short!"
        
        # 7. Test PDF Generation
        print("\n7. Testing ReportLab PDF compilation...")
        pdf_path = "temp_report.pdf"
        generate_pdf_report(meta_results, training_results, pdf_path)
        print(f"PDF successfully compiled at: {pdf_path}")
        assert os.path.exists(pdf_path), "PDF file was not created!"
        print(f"PDF File size: {os.path.getsize(pdf_path)} bytes.")
        
        print("\n=== METAML ML ENGINE VERIFICATION SUCCESSFUL ===")
        
    finally:
        # Cleanup
        if os.path.exists(temp_csv):
            os.remove(temp_csv)
        if os.path.exists(pdf_path):
            os.remove(pdf_path)

if __name__ == "__main__":
    run_verification()
