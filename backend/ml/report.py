import os
from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, KeepTogether
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors
from reportlab.lib.units import inch

def generate_pdf_report(meta: dict, training: dict, output_path: str):
    """
    Generates a publication-grade PDF report summarizing the automl run.
    Uses clean, professional styling (Supabase-like palette: deep slate, grey, emerald accent).
    """
    doc = SimpleDocTemplate(
        output_path,
        pagesize=letter,
        rightMargin=54,
        leftMargin=54,
        topMargin=54,
        bottomMargin=54
    )
    
    styles = getSampleStyleSheet()
    
    # Custom styles
    primary_color = colors.HexColor("#0f172a") # Slate 900
    secondary_color = colors.HexColor("#475569") # Slate 600
    accent_color = colors.HexColor("#10b981") # Emerald 500
    bg_light = colors.HexColor("#f8fafc") # Slate 50
    border_color = colors.HexColor("#e2e8f0") # Slate 200
    
    title_style = ParagraphStyle(
        'DocTitle',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=24,
        leading=28,
        textColor=primary_color,
        spaceAfter=6
    )
    
    subtitle_style = ParagraphStyle(
        'DocSubtitle',
        parent=styles['Normal'],
        fontName='Helvetica-Oblique',
        fontSize=12,
        leading=16,
        textColor=secondary_color,
        spaceAfter=20
    )
    
    h1_style = ParagraphStyle(
        'SectionH1',
        parent=styles['Heading1'],
        fontName='Helvetica-Bold',
        fontSize=14,
        leading=18,
        textColor=primary_color,
        spaceBefore=14,
        spaceAfter=8,
        keepWithNext=True
    )
    
    h2_style = ParagraphStyle(
        'SectionH2',
        parent=styles['Heading2'],
        fontName='Helvetica-Bold',
        fontSize=11,
        leading=15,
        textColor=secondary_color,
        spaceBefore=10,
        spaceAfter=6,
        keepWithNext=True
    )
    
    body_style = ParagraphStyle(
        'BodyTextCustom',
        parent=styles['BodyText'],
        fontName='Helvetica',
        fontSize=10,
        leading=14,
        textColor=colors.HexColor("#1e293b"), # Slate 800
        spaceAfter=8
    )
    
    bullet_style = ParagraphStyle(
        'BulletCustom',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=9.5,
        leading=13,
        textColor=colors.HexColor("#1e293b"),
        leftIndent=15,
        firstLineIndent=-10,
        spaceAfter=4
    )
    
    quote_style = ParagraphStyle(
        'BlockQuote',
        parent=styles['Normal'],
        fontName='Helvetica-Oblique',
        fontSize=10,
        leading=14,
        textColor=colors.HexColor("#0f172a"),
        backColor=bg_light,
        borderColor=accent_color,
        borderWidth=1,
        borderPadding=8,
        spaceAfter=12
    )

    story = []
    
    # 1. Header Page Section
    story.append(Paragraph("OptiML Experiment Report", title_style))
    story.append(Paragraph(f"Automated Pipeline Optimization & Meta-Analysis: {meta['personality']['title']}", subtitle_style))
    story.append(Spacer(1, 0.1 * inch))
    
    # 2. Executive Summary
    story.append(Paragraph("1. Executive Summary", h1_style))
    exec_summary = (
        f"This publication-grade AutoML report evaluates the structural profile of the uploaded dataset "
        f"and outlines findings from training multiple competitive machine learning architectures. "
        f"Using cross-validated grid search, the <b>{training['best_model']}</b> pipeline was selected as the optimal model, "
        f"achieving a final cross-validated test accuracy of <b>{training['best_score']*100:.2f}%</b>. "
        f"The model details have been logged in the OptiML experiment registry for future offline similarity-based advice."
    )
    story.append(Paragraph(exec_summary, body_style))
    story.append(Spacer(1, 0.1 * inch))
    
    # 3. Dataset Taxonomy & Profile
    story.append(Paragraph("2. Dataset Taxonomy & Profile", h1_style))
    story.append(Paragraph(f"The analysis parsed <b>{meta['num_rows']:,}</b> records containing <b>{meta['num_features']}</b> predictive features. The target column was set to <b>`{meta['target_column']}`</b>.", body_style))
    
    # Metadata Table
    meta_data = [
        [Paragraph("<b>Metric</b>", body_style), Paragraph("<b>Value</b>", body_style), Paragraph("<b>Statistical Implication</b>", body_style)],
        ["Dimensions", f"{meta['num_rows']} rows x {meta['num_cols']} cols", "Overall scale limits parameter search shapes"],
        ["Feature Skewness", f"{meta['skewness_mean']:.3f}", "High skew forces non-symmetric boundary partitions"],
        ["Feature Correlation", f"{meta['correlation_mean']:.3f}", "Correlations signal high dimensionality redundancy"],
        ["Missing Ratio", f"{meta['missing_ratio']*100:.2f}%", "Zero values filled with mode/median values"],
        ["Complexity Index", f"{meta['complexity_score']:.3f}", "Determines difficulty of boundary convergence"]
    ]
    
    meta_table = Table(meta_data, colWidths=[1.5*inch, 2.0*inch, 3.5*inch])
    meta_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), bg_light),
        ('ALIGN', (0,0), (-1,-1), 'LEFT'),
        ('BOTTOMPADDING', (0,0), (-1,0), 6),
        ('GRID', (0,0), (-1,-1), 0.5, border_color),
        ('FONTNAME', (0,1), (-1,-1), 'Helvetica'),
        ('FONTSIZE', (0,1), (-1,-1), 9),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('TOPPADDING', (0,0), (-1,-1), 4),
        ('BOTTOMPADDING', (0,0), (-1,-1), 4),
    ]))
    story.append(meta_table)
    story.append(Spacer(1, 0.15 * inch))
    
    # Dataset Characterization Callout
    story.append(Paragraph(f"<b>Dataset Characterization Profile:</b><br/>{meta['personality']['summary']}", quote_style))
    
    # Implications
    story.append(Paragraph("Modeling Implications:", h2_style))
    for imp in meta['personality']['implications']:
        story.append(Paragraph(f"• {imp}", bullet_style))
        
    story.append(PageBreak())
    
    # 4. Leaderboard Table
    story.append(Paragraph("3. Empirical Model Leaderboard", h1_style))
    story.append(Paragraph("All models were trained using Stratified K-Fold cross-validation over scaled feature matrices:", body_style))
    
    leaderboard_data = [
        [
            Paragraph("<b>Rank</b>", body_style),
            Paragraph("<b>Model</b>", body_style),
            Paragraph("<b>Accuracy</b>", body_style),
            Paragraph("<b>F1-Score</b>", body_style),
            Paragraph("<b>ROC-AUC</b>", body_style),
            Paragraph("<b>Fit Time</b>", body_style)
        ]
    ]
    
    for idx, entry in enumerate(training["leaderboard"], 1):
        leaderboard_data.append([
            str(idx),
            entry["model"],
            f"{entry['accuracy']:.4f}",
            f"{entry['f1']:.4f}",
            f"{entry['roc_auc']:.4f}",
            f"{entry['train_time']:.2f}s"
        ])
        
    lead_table = Table(leaderboard_data, colWidths=[0.6*inch, 2.2*inch, 1.0*inch, 1.0*inch, 1.0*inch, 1.2*inch])
    lead_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), primary_color),
        ('TEXTCOLOR', (0,0), (-1,0), colors.white),
        ('ALIGN', (0,0), (-1,-1), 'LEFT'),
        ('BOTTOMPADDING', (0,0), (-1,0), 6),
        ('GRID', (0,0), (-1,-1), 0.5, border_color),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, bg_light]),
        ('FONTNAME', (0,1), (-1,-1), 'Helvetica'),
        ('FONTSIZE', (0,1), (-1,-1), 9),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('TOPPADDING', (0,0), (-1,-1), 4),
        ('BOTTOMPADDING', (0,0), (-1,-1), 4),
    ]))
    # Set text colors in header manually
    for col_idx in range(6):
        lead_table.setStyle(TableStyle([('TEXTCOLOR', (col_idx, 0), (col_idx, 0), colors.white)]))
        
    story.append(lead_table)
    story.append(Spacer(1, 0.15 * inch))
    
    # 5. Feature Importances
    story.append(Paragraph("4. Feature Attribution & Sensitivity Analysis", h1_style))
    story.append(Paragraph(f"Relative feature importance calculated from the primary pipeline (<b>{training['best_model']}</b>):", body_style))
    
    importance_data = [
        [Paragraph("<b>Feature Name</b>", body_style), Paragraph("<b>Relative Attribution</b>", body_style)]
    ]
    
    for entry in training["feature_importances"][:10]: # top 10
        importance_data.append([
            entry["feature"],
            f"{entry['importance']*100:.2f}%"
        ])
        
    imp_table = Table(importance_data, colWidths=[4.0*inch, 3.0*inch])
    imp_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), bg_light),
        ('GRID', (0,0), (-1,-1), 0.5, border_color),
        ('ALIGN', (0,0), (-1,-1), 'LEFT'),
        ('FONTSIZE', (0,1), (-1,-1), 9),
        ('TOPPADDING', (0,0), (-1,-1), 3),
        ('BOTTOMPADDING', (0,0), (-1,-1), 3),
    ]))
    story.append(imp_table)
    story.append(Spacer(1, 0.15 * inch))
    
    # 6. Safeguards & Limitations
    story.append(Paragraph("5. Preprocessing & Engineering Safeguards", h1_style))
    safeguards = (
        "During execution, numeric features were imputed with their median and standardized using Z-score normalizer. "
        "Categorical variables were imputed with their mode and one-hot encoded. Target fields were mapped to index integers. "
        "This ensures that models like KNN or SVM, which rely heavily on distance boundaries, are not biased by disparate feature scales."
    )
    story.append(Paragraph(safeguards, body_style))
    
    story.append(Spacer(1, 0.1 * inch))
    story.append(Paragraph("6. Platform Limitations & Next Steps", h1_style))
    story.append(Paragraph(f"• <b>Feature Focus:</b> The model is highly sensitive to the top feature <b>`{training['feature_importances'][0]['feature']}`</b>. Guardrails should be placed to ensure this value is not missing in production inputs.", bullet_style))
    story.append(Paragraph(f"• <b>Sparsity:</b> Imputation of {meta['missing_ratio']:.1%} of values could introduce noise. For mission-critical deployments, double-check if missingness represents zero counts or structural dropouts.", bullet_style))
    story.append(Paragraph(f"• <b>Model Complexity:</b> The performance gap between models shows the boundary complexity. Prioritize tree ensembles for safety if deployment latency permits.", bullet_style))
    
    doc.build(story)
