import pandas as pd
import numpy as np

def analyze_dataset(df: pd.DataFrame, target_column: str = None) -> dict:
    """
    Extracts structural information, feature types, missingness, skew,
    correlations, and a dataset personality score from the dataframe.
    """
    num_rows = int(df.shape[0])
    num_cols = int(df.shape[1])
    
    # Identify potential target column if not specified
    if not target_column:
        # Default to the last column
        target_column = df.columns[-1]
        
    # Exclude target from feature analysis
    feature_cols = [c for c in df.columns if c != target_column]
    
    # Identify column types
    numeric_cols = []
    categorical_cols = []
    text_cols = []
    
    for col in feature_cols:
        col_type = df[col].dtype
        if pd.api.types.is_numeric_dtype(df[col]):
            # If numeric but very few unique values, might be categorical (encoded)
            if df[col].nunique() < 5:
                categorical_cols.append(col)
            else:
                numeric_cols.append(col)
        elif pd.api.types.is_datetime64_any_dtype(df[col]):
            categorical_cols.append(col)
        else:
            # Check if it looks like free text or standard categories
            unique_ratio = df[col].nunique() / num_rows if num_rows > 0 else 0
            if unique_ratio > 0.5 and df[col].nunique() > 20:
                text_cols.append(col)
            else:
                categorical_cols.append(col)

    # Missing value ratio
    total_cells = num_rows * num_cols
    total_missing = int(df.isnull().sum().sum())
    missing_ratio = float(total_missing / total_cells) if total_cells > 0 else 0.0
    
    # Skewness (on numeric features only)
    skewness_list = []
    if numeric_cols:
        for col in numeric_cols:
            try:
                skew = df[col].skew()
                if not pd.isna(skew):
                    skewness_list.append(abs(skew))
            except:
                pass
    skewness_mean = float(np.mean(skewness_list)) if skewness_list else 0.0
    
    # Correlation structure (numeric features only)
    correlation_mean = 0.0
    if len(numeric_cols) > 1:
        try:
            # Filter out numeric columns with zero variance to avoid divide-by-zero nan correlations
            valid_numeric = [col for col in numeric_cols if df[col].var() > 0]
            if len(valid_numeric) > 1:
                corr_matrix = df[valid_numeric].corr().abs()
                # Get values in the upper triangle (exclude diagonal self-correlation)
                upper_tri = corr_matrix.where(np.triu(np.ones(corr_matrix.shape), k=1).astype(bool))
                corr_values = upper_tri.stack().values
                corr_values = corr_values[~np.isnan(corr_values)]
                correlation_mean = float(np.mean(corr_values)) if len(corr_values) > 0 else 0.0
        except Exception as corr_err:
            print(f"Error calculating correlation matrix: {corr_err}")
            
    # Safeguard against nan
    if np.isnan(correlation_mean):
        correlation_mean = 0.0
    if np.isnan(skewness_mean):
        skewness_mean = 0.0

    # Categorical ratio
    categorical_ratio = float(len(categorical_cols) / len(feature_cols)) if feature_cols else 0.0
    
    # Complexity Score calculation
    # Penalizes low sample-to-feature ratio, high missingness, high skew, high correlation
    dim_penalty = min(len(feature_cols) / max(num_rows, 1) * 10, 1.0)
    missing_penalty = min(missing_ratio * 2.0, 1.0)
    skew_penalty = min(skewness_mean / 3.0, 1.0)
    corr_penalty = correlation_mean
    
    complexity_score = float(
        0.3 * dim_penalty + 
        0.1 * missing_penalty + 
        0.3 * skew_penalty + 
        0.3 * corr_penalty
    )
    complexity_score = min(max(complexity_score, 0.05), 0.95) # Clip bounds

    # Option A: Dataset Personality Engine
    personality = generate_personality(
        num_rows, num_cols, missing_ratio, categorical_ratio, 
        skewness_mean, correlation_mean, complexity_score
    )

    # Get sample data for preview (first 10 rows, string formatted)
    preview_df = df.head(10).copy()
    # Replace NaN with None for JSON serialization
    preview_df = preview_df.where(pd.notnull(preview_df), None)
    
    # Quick target stats
    target_stats = {}
    if target_column in df.columns:
        target_stats["name"] = target_column
        target_stats["type"] = str(df[target_column].dtype)
        target_stats["unique_values"] = int(df[target_column].nunique())
        # value counts
        val_counts = df[target_column].value_counts().head(5)
        target_stats["distribution"] = {str(k): int(v) for k, v in val_counts.items()}
        # check balance (for classification)
        if len(val_counts) == 2:
            ratio = val_counts.values[0] / max(val_counts.sum(), 1)
            target_stats["class_balance"] = "Balanced" if 0.4 <= ratio <= 0.6 else "Imbalanced"
        else:
            target_stats["class_balance"] = "N/A"

    return {
        "num_rows": num_rows,
        "num_cols": num_cols,
        "num_features": len(feature_cols),
        "target_column": target_column,
        "target_stats": target_stats,
        "numeric_cols": numeric_cols,
        "categorical_cols": categorical_cols,
        "text_cols": text_cols,
        "missing_ratio": missing_ratio,
        "skewness_mean": skewness_mean,
        "correlation_mean": correlation_mean,
        "categorical_ratio": categorical_ratio,
        "complexity_score": complexity_score,
        "personality": personality,
        "columns": list(df.columns),
        "preview_data": preview_df.to_dict(orient="records")
    }

def generate_personality(rows, cols, missing, cat_ratio, skew, corr, complexity) -> dict:
    """
    Creates a detailed, scientific personality profile of the dataset based on metrics.
    """
    title_terms = []
    
    # 1. Row/Col Ratio (Dimensionality)
    if cols > 100 and rows < 1000:
        title_terms.append("High-Dimensional")
        dim_desc = "high dimensional density where feature count dominates sample depth"
    elif rows > 10000 and cols < 10:
        title_terms.append("Tall-Narrow")
        dim_desc = "deep historical scale and low feature count"
    else:
        title_terms.append("Balanced-Scale")
        dim_desc = "balanced proportion of samples and variables"
        
    # 2. Skew / Complexity
    if skew > 1.5 or complexity > 0.6:
        title_terms.append("highly nonlinear chaotic system")
        comp_desc = "exhibits highly nonlinear structure and heavily skewed distributions, suggesting that linear models will suffer from heavy bias"
    elif complexity < 0.25:
        title_terms.append("near-linear separable space")
        comp_desc = "resembles a clean, near-linear separable manifold requiring minimal complexity to fit"
    else:
        title_terms.append("moderate stochastic system")
        comp_desc = "displays moderate complexity with stable distribution shapes and regular boundaries"

    # 3. Correlations
    if corr > 0.5:
        title_terms.append("strong feature coupling")
        corr_desc = "tight multi-collinear associations, where redundant information exists across dimensions"
    elif corr < 0.15 and cols > 5:
        title_terms.append("orthogonal independent dimensions")
        corr_desc = "high feature independence, with near-orthogonal dimensions and low informational redundancy"
    else:
        title_terms.append("standard covariance bonds")
        corr_desc = "nominal covariance links across features without excessive collinearity"

    # 4. Sparsity/Missingness
    if missing > 0.1:
        title_terms.append("sparse incomplete lattice")
        missing_desc = "high cellular missingness, creating a sparse, fragmented topological structure"
    else:
        title_terms.append("continuous dense matrix")
        missing_desc = "highly continuous, fully-populated dense grid with zero or negligible missing entries"

    # Format the title
    title = f"{title_terms[0]} {title_terms[1]} with {title_terms[2]} in a {title_terms[3]}".title()
    
    # Comprehensive paragraphs
    summary = (
        f"This dataset behaves like a {title.lower()}. Internally, it is characterized by a {dim_desc}, "
        f"paired with a {missing_desc}. The functional landscape {comp_desc}, backed by {corr_desc}."
    )
    
    implications = []
    if skew > 1.5 or complexity > 0.6:
        implications.append("Tree-based ensemble models (Random Forest, XGBoost) are strongly recommended due to their split-based partition capability which easily isolates nonlinear threshold jumps.")
    else:
        implications.append("Linear classifiers (Logistic Regression) or Support Vector Machines should provide a highly competitive and interpretable baseline.")
        
    if corr > 0.5:
        implications.append("High correlation suggests feature reduction (PCA) or regularization (L1/L2 penalty) is essential to prevent coefficient inflation or tree split degradation.")
    if missing > 0.1:
        implications.append("Significant missing data implies imputation strategy (median/mode or iterative imputer) will severely shape the model downstream boundary.")
    if cols > rows:
        implications.append("High dimensional ratio (n_features > n_samples) exposes the system to high variance and overfitting; linear models with aggressive L1 (Lasso) regularization should be prioritized.")
        
    return {
        "title": title,
        "summary": summary,
        "complexity_category": "High" if complexity > 0.6 else "Medium" if complexity >= 0.3 else "Low",
        "implications": implications
    }
