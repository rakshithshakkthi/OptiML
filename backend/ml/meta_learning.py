import numpy as np
from database import get_meta_memory

def recommend_model_rules(meta: dict) -> dict:
    """
    Generates rule-based recommendation scores for Logistic Regression,
    Random Forest, XGBoost, SVM, and KNN.
    """
    rows = meta["num_rows"]
    cols = meta["num_cols"]
    skew = meta["skewness_mean"]
    corr = meta["correlation_mean"]
    missing = meta["missing_ratio"]
    cat_ratio = meta["categorical_ratio"]
    complexity = meta["complexity_score"]
    
    # Base scores for each model
    scores = {
        "Logistic Regression": 0.5,
        "Random Forest": 0.5,
        "XGBoost": 0.5,
        "SVM": 0.5,
        "KNN": 0.5
    }
    
    # 1. Dataset Size (Rows)
    if rows < 1000:
        # Small dataset: prefer simpler models that don't overfit
        scores["Logistic Regression"] += 0.2
        scores["SVM"] += 0.2
        scores["KNN"] += 0.1
        scores["XGBoost"] -= 0.1 # XGBoost can overfit small data easily
    elif rows > 10000:
        # Large dataset: boosting and tree models perform very well, SVM is slow
        scores["XGBoost"] += 0.3
        scores["Random Forest"] += 0.2
        scores["SVM"] -= 0.3 # SVM scale complexity is O(N^3) or O(N^2)
        scores["KNN"] -= 0.2 # KNN query scale is slow
        
    # 2. Dimensionality (Cols/Rows ratio)
    if cols / rows > 0.1:
        # High dimensional: prefer linear models
        scores["Logistic Regression"] += 0.3
        scores["SVM"] += 0.2
        scores["KNN"] -= 0.2 # Distance metrics degrade in high dimensions
        scores["Random Forest"] -= 0.1
    
    # 3. Complexity & Nonlinearity
    if skew > 1.5 or complexity > 0.6:
        # High complexity / nonlinear: tree and ensemble models excel
        scores["Random Forest"] += 0.3
        scores["XGBoost"] += 0.3
        scores["Logistic Regression"] -= 0.2
        scores["SVM"] -= 0.1
    elif complexity < 0.3:
        # Simple, linear: linear and distance models
        scores["Logistic Regression"] += 0.25
        scores["SVM"] += 0.2
        scores["KNN"] += 0.15
        
    # 4. Multicollinearity (Correlation)
    if corr > 0.5:
        # High correlation: Logistic regression (with L2) or tree models
        scores["Logistic Regression"] += 0.1
        scores["Random Forest"] += 0.1
        scores["KNN"] -= 0.15 # Correlated coordinates skew distance metrics
        
    # 5. Missingness
    if missing > 0.1:
        # Trees handle missing values better (XGBoost handles native, others require imputation)
        scores["XGBoost"] += 0.2
        scores["Random Forest"] += 0.1
        scores["SVM"] -= 0.1
        
    # Ensure scores are within normal ranges
    for k in scores:
        scores[k] = max(min(scores[k], 1.0), 0.0)
        
    # Normalize to relative probabilities
    total = sum(scores.values())
    if total > 0:
        for k in scores:
            scores[k] = round(scores[k] / total, 3)
            
    return scores

def recommend_model_learned(meta: dict) -> dict:
    """
    Queries past dataset metrics from SQLite database, computes Euclidean distance
    in meta-feature space, and does a KNN-like voting to recommend models.
    """
    # Fetch historical runs
    memory = get_meta_memory()
    if not memory or len(memory) < 3:
        # Too little memory, return equal weights
        return {
            "Logistic Regression": 0.2,
            "Random Forest": 0.2,
            "XGBoost": 0.2,
            "SVM": 0.2,
            "KNN": 0.2
        }
        
    # Standardize our current features
    # Features vector: [log(rows), log(cols), missing, cat_ratio, skew, corr, complexity]
    def extract_vector(m):
        return np.array([
            np.log10(max(m["num_rows"], 1)),
            np.log10(max(m["num_cols"], 1)),
            m["missing_ratio"],
            m.get("categorical_ratio", 0.0),
            m["skewness_mean"],
            m["correlation_mean"],
            m["complexity_score"]
        ])
        
    curr_vec = extract_vector(meta)
    
    # Calculate distances
    distances = []
    for item in memory:
        try:
            item_vec = extract_vector({
                "num_rows": item["num_rows"],
                "num_cols": item["num_cols"],
                "missing_ratio": item["missing_ratio"],
                "categorical_ratio": item["categorical_ratio"],
                "skewness_mean": item["skewness_mean"],
                "correlation_mean": item["correlation_mean"],
                "complexity_score": item["complexity_score"]
            })
            # Euclidean distance
            dist = np.linalg.norm(curr_vec - item_vec)
            distances.append((dist, item["best_model"], item["best_score"]))
        except:
            pass
            
    if not distances:
        return {m: 0.2 for m in ["Logistic Regression", "Random Forest", "XGBoost", "SVM", "KNN"]}
        
    # Sort by distance
    distances.sort(key=lambda x: x[0])
    
    # Take K nearest neighbors (up to 5)
    k_neighbors = min(len(distances), 5)
    neighbors = distances[:k_neighbors]
    
    # Calculate votes with distance-based weights
    votes = {
        "Logistic Regression": 0.0,
        "Random Forest": 0.0,
        "XGBoost": 0.0,
        "SVM": 0.0,
        "KNN": 0.0
    }
    
    for dist, best_model, score in neighbors:
        # Weight is inverse of distance (add small epsilon to avoid divide by zero)
        weight = 1.0 / (dist + 1e-5) * score
        if best_model in votes:
            votes[best_model] += weight
            
    total_votes = sum(votes.values())
    if total_votes > 0:
        for k in votes:
            votes[k] = round(votes[k] / total_votes, 3)
    else:
        # Fallback
        votes = {m: 0.2 for m in ["Logistic Regression", "Random Forest", "XGBoost", "SVM", "KNN"]}
        
    return votes

def get_combined_recommendation(meta: dict) -> dict:
    """
    Combines rule-based and learned weights to produce the final ranked list.
    """
    rule_scores = recommend_model_rules(meta)
    learned_scores = recommend_model_learned(meta)
    
    # Combine scores (50% rules, 50% historical memory)
    combined = {}
    for model in rule_scores:
        combined[model] = 0.5 * rule_scores[model] + 0.5 * learned_scores[model]
        
    # Rank models
    ranked = sorted(combined.items(), key=lambda x: x[1], reverse=True)
    
    # Determine confidence score
    # Based on the margin of the top model over others
    margin = ranked[0][1] - ranked[1][1] if len(ranked) > 1 else 0.5
    confidence_score = float(min(max(0.3 + margin * 2.0, 0.4), 0.95))
    
    # Construct justification
    best_model = ranked[0][0]
    justifications = []
    
    if best_model == "Logistic Regression":
        justifications.append("The dataset exhibits linear structures and a high sample-to-feature ratio, making simple linear decision boundaries extremely effective and transparent.")
    elif best_model == "SVM":
        justifications.append("The sample count is relatively small while the feature count is high, an environment where Support Vector Machines excel at finding optimal margins without overfitting.")
    elif best_model == "Random Forest":
        justifications.append("The dataset features non-linear relationship structures and highly multi-modal distribution patterns. A Random Forest ensemble will partition features cleanly and resist variance errors.")
    elif best_model == "XGBoost":
        justifications.append("The dataset contains massive depth, high skew, or native missingness. XGBoost's gradient boosting mechanism will minimize bias efficiently while managing sparsity natively.")
    elif best_model == "KNN":
        justifications.append("The data is clustered in compact Euclidean spaces with clear spatial partitions and low complexity, allowing distance-based classification to succeed directly.")
        
    if meta["missing_ratio"] > 0.05:
        justifications.append("Additionally, the presence of missing values suggests split-based tree partition models will minimize the bias introduced by statistical imputation.")
        
    if meta["correlation_mean"] > 0.4:
        justifications.append("Note: The moderate/high collinearity structure detected implies feature redundancy is present; tree ensembles or regularized linear models are favored to stabilize training.")

    return {
        "best_model": best_model,
        "confidence_score": confidence_score,
        "rankings": [{"model": r[0], "weight": round(r[1], 3)} for r in ranked],
        "justification": " ".join(justifications),
        "rule_scores": rule_scores,
        "learned_scores": learned_scores
    }
