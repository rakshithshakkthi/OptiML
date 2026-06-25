def generate_report(meta_results: dict, training_results: dict) -> str:
    """
    Generates a structured, research-paper-style report explaining the
    dataset analysis, meta-learning advice, model rankings, and key insights.
    """
    best_model = training_results["best_model"]
    best_score = training_results["best_score"]
    leaderboard = training_results["leaderboard"]
    personality = meta_results["personality"]
    
    # Pre-calculate markdown structures
    leaderboard_rows = []
    for rank, entry in enumerate(leaderboard, 1):
        leaderboard_rows.append(
            f"| {rank} | {entry['model']} | {entry['accuracy']:.4f} | {entry['f1']:.4f} | {entry['roc_auc']:.4f} | {entry['train_time']:.3f}s |"
        )
    leaderboard_md = "\n".join(leaderboard_rows)
    
    # Feature importances breakdown
    top_features = training_results["feature_importances"][:5]
    features_md_list = []
    for idx, f_entry in enumerate(top_features, 1):
        features_md_list.append(f"{idx}. **{f_entry['feature']}** ({f_entry['importance']*100:.2f}% relative attribution)")
    features_md = "\n".join(features_md_list)
    
    # Analysis points
    skew_status = "heavily skewed" if meta_results["skewness_mean"] > 1.5 else "normally balanced"
    corr_status = "strongly coupled" if meta_results["correlation_mean"] > 0.4 else "largely independent"
    missing_status = f"{meta_results['missing_ratio']*100:.1f}% missingness"
    
    # Generate the text
    report = f"""# OptiML Experiment Report: Pipeline Optimization & Meta-Analysis
**Dataset Characterization Tag:** *{personality['title']}*
**Execution ID:** Pipeline Evaluation Run

---

## 1. Executive Summary
This report presents a thorough analysis of the uploaded dataset and evaluates five machine learning architectures (Logistic Regression, Random Forest, XGBoost, Support Vector Machines, and K-Nearest Neighbors) to identify the optimal model. 

Through automated preprocessing and grid-search cross-validation, the **{best_model}** has been identified as the best-performing pipeline, achieving a cross-validated test accuracy of **{best_score*100:.2f}%** (Weighted F1: **{leaderboard[0]['f1']:.4f}**; ROC-AUC: **{leaderboard[0]['roc_auc']:.4f}**).

---

## 2. Dataset Taxonomy & Profile
The dataset contains **{meta_results['num_rows']:,}** samples and **{meta_results['num_features']}** features, with target variable **`{meta_results['target_column']}`**. 

### 2.1 Meta-Features Extract
* **Dimensionality ratio (features/rows):** {meta_results['num_features'] / max(meta_results['num_rows'], 1):.4f}
* **Missing Value Ratio:** {missing_status}
* **Mean Absolute Feature Skewness:** {meta_results['skewness_mean']:.3f} ({skew_status})
* **Pairwise Feature Correlation Mean:** {meta_results['correlation_mean']:.3f} ({corr_status})
* **System Complexity Index:** {meta_results['complexity_score']:.3f}

### 2.2 Dataset Characterization & Profile Assessment
> "{personality['summary']}"

The implications of these characteristics on training are as follows:
{chr(10).join([f"* {imp}" for imp in personality['implications']])}

---

## 3. Empirical Model Leaderboard
The five models were trained utilizing Stratified K-Fold cross-validation and hyperparameter grid tuning. Below are the final evaluated performance metrics ranked by accuracy:

| Rank | Model Architecture | Accuracy | Weighted F1 | ROC-AUC | Training Time |
| :--- | :--- | :--- | :--- | :--- | :--- |
{leaderboard_md}

### 3.1 Performance Variance Analysis
The difference in performance between the top and bottom models is **{(leaderboard[0]['accuracy'] - leaderboard[-1]['accuracy'])*100:.2f} percentage points**. 
* **Tree-based models** (Random Forest/XGBoost) scored highest if the data features non-linear boundary splits, because their hierarchical structure splits features orthogonal to axes, making them resilient to scale variations and skewness.
* **Linear models** (Logistic Regression/SVM) performed optimally if the underlying decision plane is simple, which reduces model variance and prevents overfitting on smaller sample sizes.
* **K-Nearest Neighbors** performance was governed by density. Its accuracy drops in the presence of redundant/correlated features, as the distance metric becomes biased towards collinear directions.

---

## 4. Feature Attribution & Sensitivity Analysis
Using the best-performing pipeline (**{best_model}**), we analyzed the relative importances of the features to understand their predictive power:

### Top Predictive Features:
{features_md}

### Interpretation:
The top features dominate the boundary partition. The variable **`{top_features[0]['feature']}`** holds the highest information gain. The model focuses its splits (or maximizes its weights) along this direction. Feature engineering should prioritize refining measurements or collecting more granularity for these primary variables.

---

## 5. Preprocessing & Engineering Safeguards
To guarantee clean convergence, the OptiML automated preprocessor executed the following safeguards:
1. **Numerical Cleanups:** Missing numerical values were imputed via median values (resisting outlier pull), and scaled using a standard Z-score standardizer ($X_s = \\frac{{X - \\mu}}{{\\sigma}}$) to bring all continuous spaces into standard scales (essential for KNN and SVM).
2. **Categorical Handling:** Categorical values were imputed with the most frequent value (mode) and converted to binary columns using One-Hot encoding.
3. **Target Cleanups:** Missing target labels were dropped, and target strings were index-encoded to support multi-class gradient boosting interfaces.

---

## 6. Dataset Limitations & Future Recommendations
1. **Sparsity / Missingness:** The present missing value ratio ({meta_results['missing_ratio']:.3%}) introduces potential bias in imputation. If missingness is not random, tracking the indicator ($I_{{missing}}$) as a separate feature could improve predictive accuracy.
2. **Sample Depth:** With {meta_results['num_rows']} samples, complex estimators (like deep trees or nonlinear SVMs) run the risk of overfitting. Collecting more rows will help smooth decision boundaries and increase generalization.
3. **Data Collection Quality:** The high importance of **`{top_features[0]['feature']}`** suggests the system is highly sensitive to this single source. Redundancy paths should be developed to prevent the model from failing if this metric becomes missing or corrupted in production environments.
"""
    return report
