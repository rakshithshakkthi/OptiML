import pandas as pd
import numpy as np
import time
from sklearn.model_selection import train_test_split, GridSearchCV, StratifiedKFold
from sklearn.compose import ColumnTransformer
from sklearn.pipeline import Pipeline
from sklearn.impute import SimpleImputer
from sklearn.preprocessing import StandardScaler, OneHotEncoder, LabelEncoder, OrdinalEncoder
from sklearn.metrics import accuracy_score, f1_score, roc_auc_score, precision_score, recall_score
from sklearn.inspection import permutation_importance

# Import models
from sklearn.linear_model import LogisticRegression
from sklearn.ensemble import RandomForestClassifier
from xgboost import XGBClassifier
from sklearn.svm import SVC
from sklearn.neighbors import KNeighborsClassifier

import database

def train_all_models(job_id: str, df: pd.DataFrame, target_col: str, progress_callback=None):
    """
    Runs the full preprocessing, model training, grid search, evaluation,
    and feature importance pipeline. Saves updates to database.
    """
    def log_progress(msg, pct):
        print(f"[{pct}%] {msg}")
        if progress_callback:
            progress_callback(msg, pct)
            
    log_progress("Initializing model training pipeline and cross-validation layers...", 5)
    
    # 1. Drop rows where target is missing
    df = df.dropna(subset=[target_col]).copy()
    if df.empty:
        raise ValueError("Dataset is empty after dropping missing target rows.")
        
    X = df.drop(columns=[target_col])
    y = df[target_col]
    
    # Encode target if it is categorical
    le = LabelEncoder()
    y_encoded = le.fit_transform(y)
    num_classes = len(le.classes_)
    is_binary = num_classes == 2
    
    log_progress(f"Target label '{target_col}' successfully mapped and encoded. Class counts: {num_classes}.", 10)
    
    # Identify numerical, low-cardinality, and high-cardinality columns
    numeric_features = []
    low_card_categorical = []
    high_card_categorical = []
    dropped_features = []
    
    for col in X.columns:
        if pd.api.types.is_numeric_dtype(X[col]):
            if X[col].nunique() >= 5:
                numeric_features.append(col)
            else:
                low_card_categorical.append(col)
        else:
            cardinality = X[col].nunique()
            unique_ratio = cardinality / len(X) if len(X) > 0 else 0
            
            # Drop unique identifiers (UUIDs, hashes, incremental IDs)
            if unique_ratio > 0.9 and cardinality > 100:
                dropped_features.append(col)
            elif cardinality <= 100:
                low_card_categorical.append(col)
            else:
                high_card_categorical.append(col)
                
    if dropped_features:
        log_progress(f"Excluded high-cardinality/identifier columns from the training partition: {dropped_features}", 11)
    if high_card_categorical:
        log_progress(f"Applying OrdinalEncoder transformations to high-cardinality variables: {high_card_categorical}", 12)
        
    # 2. Build preprocessing pipeline
    numeric_transformer = Pipeline(steps=[
        ('imputer', SimpleImputer(strategy='median')),
        ('scaler', StandardScaler())
    ])
    
    transformers = [
        ('num', numeric_transformer, numeric_features)
    ]
    
    if low_card_categorical:
        cat_low_transformer = Pipeline(steps=[
            ('imputer', SimpleImputer(strategy='most_frequent')),
            ('onehot', OneHotEncoder(handle_unknown='ignore', sparse_output=False))
        ])
        transformers.append(('cat_low', cat_low_transformer, low_card_categorical))
        
    if high_card_categorical:
        cat_high_transformer = Pipeline(steps=[
            ('imputer', SimpleImputer(strategy='most_frequent')),
            ('ordinal', OrdinalEncoder(handle_unknown='use_encoded_value', unknown_value=-1))
        ])
        transformers.append(('cat_high', cat_high_transformer, high_card_categorical))
        
    preprocessor = ColumnTransformer(
        transformers=transformers,
        remainder='drop'
    )
    
    # Stratified split
    # Handle small class counts: if class size is too small, do standard split
    min_class_size = np.min(np.bincount(y_encoded))
    if min_class_size >= 2:
        X_train, X_test, y_train, y_test = train_test_split(
            X, y_encoded, test_size=0.2, random_state=42, stratify=y_encoded
        )
    else:
        X_train, X_test, y_train, y_test = train_test_split(
            X, y_encoded, test_size=0.2, random_state=42
        )
        
    log_progress(f"Hold-out verification split completed. Training matrix shape: {X_train.shape}.", 15)
    
    # Preprocess train/test features to extract feature importances later
    X_train_preprocessed = preprocessor.fit_transform(X_train)
    X_test_preprocessed = preprocessor.transform(X_test)
    
    # Reconstruct preprocessed feature names
    preprocessed_feature_names = []
    preprocessed_feature_names.extend(numeric_features)
    
    ohe_names = []
    if low_card_categorical:
        try:
            ohe = preprocessor.named_transformers_['cat_low'].named_steps['onehot']
            ohe_names = list(ohe.get_feature_names_out(low_card_categorical))
            preprocessed_feature_names.extend(ohe_names)
        except:
            num_ohe = X_train_preprocessed.shape[1] - len(numeric_features) - len(high_card_categorical)
            ohe_names = [f"cat_low_{i}" for i in range(num_ohe)]
            preprocessed_feature_names.extend(ohe_names)
            
    preprocessed_feature_names.extend(high_card_categorical)
    
    # Define models, hyperparameter grids
    cv = StratifiedKFold(n_splits=min(3, min_class_size), shuffle=True, random_state=42) if min_class_size >= 3 else 3
    
    models_config = {
        "Logistic Regression": {
            "model": LogisticRegression(max_iter=1000, random_state=42),
            "params": {"model__C": [0.1, 1.0, 10.0]},
            "weight": 20
        },
        "Random Forest": {
            "model": RandomForestClassifier(random_state=42),
            "params": {
                "model__n_estimators": [50, 100],
                "model__max_depth": [5, 10, None]
            },
            "weight": 35
        },
        "XGBoost": {
            "model": XGBClassifier(random_state=42, eval_metric='logloss'),
            "params": {
                "model__n_estimators": [50, 100],
                "model__learning_rate": [0.05, 0.1, 0.2]
            },
            "weight": 55
        },
        "SVM": {
            "model": SVC(probability=True, random_state=42),
            "params": {
                "model__C": [0.1, 1.0, 10.0],
                "model__kernel": ['rbf', 'linear']
            },
            "weight": 75
        },
        "KNN": {
            "model": KNeighborsClassifier(),
            "params": {"model__n_neighbors": [3, 5, 7]},
            "weight": 90
        }
    }
    
    results = {}
    best_overall_score = -1.0
    best_overall_model = None
    best_overall_pipeline = None
    
    # Train each model
    for model_name, cfg in models_config.items():
        log_progress(f"Executing hyperparameter grid search optimization and stratified CV loops for {model_name}...", cfg["weight"])
        start_time = time.time()
        
        pipeline = Pipeline(steps=[
            ('preprocessor', preprocessor),
            ('model', cfg["model"])
        ])
        
        # Subsample for extremely slow models if dataset is large to prevent hanging
        X_train_model, y_train_model = X_train, y_train
        if len(X_train) > 10000:
            try:
                # Attempt stratified subsampling
                X_train_model, _, y_train_model, _ = train_test_split(
                    X_train, y_train, train_size=10000/len(X_train), random_state=42, stratify=y_train
                )
            except Exception:
                # Fallback to random downsampling
                np.random.seed(42)
                indices = np.random.choice(len(X_train), size=10000, replace=False)
                X_train_model = X_train.iloc[indices]
                y_train_model = y_train[indices]
                
        # Determine CV dynamically to avoid errors on rare classes or small subsets
        try:
            model_class_counts = np.bincount(y_train_model)
            model_min_class_size = np.min(model_class_counts[model_class_counts > 0])
        except Exception:
            model_min_class_size = 0
            
        if model_min_class_size >= 3:
            model_cv = StratifiedKFold(n_splits=3, shuffle=True, random_state=42)
        else:
            from sklearn.model_selection import KFold
            model_cv = KFold(n_splits=3, shuffle=True, random_state=42)
            
        # Grid search
        grid = GridSearchCV(pipeline, cfg["params"], cv=model_cv, scoring='accuracy', n_jobs=-1)
        grid.fit(X_train_model, y_train_model)
        
        best_pipeline = grid.best_estimator_
        train_time = time.time() - start_time
        
        # Evaluate
        y_pred = best_pipeline.predict(X_test)
        
        # Probabilities for ROC-AUC
        try:
            y_proba = best_pipeline.predict_proba(X_test)
            if is_binary:
                roc_auc = float(roc_auc_score(y_test, y_proba[:, 1]))
            else:
                roc_auc = float(roc_auc_score(y_test, y_proba, multi_class='ovr'))
        except Exception as e:
            # Fallback if predict_proba fails
            roc_auc = 0.5
            
        accuracy = float(accuracy_score(y_test, y_pred))
        f1 = float(f1_score(y_test, y_pred, average='weighted'))
        precision = float(precision_score(y_test, y_pred, average='weighted', zero_division=0))
        recall = float(recall_score(y_test, y_pred, average='weighted', zero_division=0))
        
        # Extract feature importances
        importances = {}
        try:
            model_obj = best_pipeline.named_steps['model']
            if hasattr(model_obj, 'feature_importances_'):
                # RF, XGBoost
                raw_importances = model_obj.feature_importances_
            elif hasattr(model_obj, 'coef_'):
                # Logistic Regression, Linear SVM
                if model_obj.coef_.ndim == 2:
                    raw_importances = np.mean(np.abs(model_obj.coef_), axis=0)
                else:
                    raw_importances = np.abs(model_obj.coef_)
            else:
                # SVC RBF, KNN - use permutation importance on a subset of the test set if it is large
                X_test_sub, y_test_sub = X_test, y_test
                if len(X_test) > 2000:
                    try:
                        X_test_sub, _, y_test_sub, _ = train_test_split(
                            X_test, y_test, train_size=2000/len(X_test), random_state=42, stratify=y_test
                        )
                    except Exception:
                        np.random.seed(42)
                        indices = np.random.choice(len(X_test), size=2000, replace=False)
                        X_test_sub = X_test.iloc[indices]
                        y_test_sub = y_test[indices]
                
                perm_imp = permutation_importance(best_pipeline, X_test_sub, y_test_sub, n_repeats=3, random_state=42)
                raw_importances = perm_imp.importances_mean
                
            # Normalize and pair with preprocessed feature names
            raw_importances = np.array(raw_importances)
            total_imp = np.sum(raw_importances)
            if total_imp > 0:
                raw_importances = raw_importances / total_imp
                
            # Align importances to the original features to keep visualization clean
            # We map preprocessed features back to original columns
            original_feature_importances = {col: 0.0 for col in X.columns}
            
            # 1. Map numeric directly
            for i, col in enumerate(numeric_features):
                if i < len(raw_importances):
                    original_feature_importances[col] += float(raw_importances[i])
                    
            # 2. Map low-cardinality one-hot features
            num_numeric = len(numeric_features)
            for i, name in enumerate(ohe_names):
                raw_idx = num_numeric + i
                if raw_idx < len(raw_importances):
                    for orig_col in low_card_categorical:
                        if name.startswith(orig_col):
                            original_feature_importances[orig_col] += float(raw_importances[raw_idx])
                            break
                            
            # 3. Map high-cardinality ordinal features
            num_prev = num_numeric + len(ohe_names)
            for i, col in enumerate(high_card_categorical):
                raw_idx = num_prev + i
                if raw_idx < len(raw_importances):
                    original_feature_importances[col] += float(raw_importances[raw_idx])
                            
            importances = original_feature_importances
        except Exception as e:
            print(f"Error extracting feature importances for {model_name}: {e}")
            importances = {col: 1.0/len(X.columns) for col in X.columns}
            
        results[model_name] = {
            "accuracy": accuracy,
            "f1": f1,
            "roc_auc": roc_auc,
            "precision": precision,
            "recall": recall,
            "train_time": float(train_time),
            "best_params": {k.replace("model__", ""): v for k, v in grid.best_params_.items()},
            "feature_importances": importances
        }
        
        # Track best overall model
        if accuracy > best_overall_score:
            best_overall_score = accuracy
            best_overall_model = model_name
            best_overall_pipeline = best_pipeline
            
    log_progress("Cross-validation grid search completed. Starting feature attribution weights extraction...", 95)
    
    # Sort leaderboard by accuracy descending
    leaderboard = []
    for model_name, metrics in results.items():
        leaderboard.append({
            "model": model_name,
            "accuracy": metrics["accuracy"],
            "f1": metrics["f1"],
            "roc_auc": metrics["roc_auc"],
            "train_time": metrics["train_time"],
            "best_params": metrics["best_params"]
        })
    leaderboard.sort(key=lambda x: x["accuracy"], reverse=True)
    
    # Aggregate feature importance across the best performing model
    best_model_details = results[best_overall_model]
    best_importances = best_model_details["feature_importances"]
    
    # Format sorted importances
    sorted_importances = sorted(best_importances.items(), key=lambda x: x[1], reverse=True)
    feature_importance_list = [{"feature": f, "importance": round(imp, 4)} for f, imp in sorted_importances]
    
    log_progress("Optimization pipeline successfully finalized. Compiling evaluation artifact payload...", 100)
    
    return {
        "leaderboard": leaderboard,
        "feature_importances": feature_importance_list,
        "model_details": results,
        "best_model": best_overall_model,
        "best_score": best_overall_score,
        "best_pipeline": best_overall_pipeline
    }
