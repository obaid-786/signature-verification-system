# Signature Verification System

AI-powered handwritten signature verification using hybrid ensemble learning (DNN + ML) trained on CEDAR55 dataset.

## Features
- Upload a signature image and verify against a selected person’s model.
- Real‑time confidence score with visual meter.
- Supports both DNN and hybrid ensemble models.
- Fully local deployment (no external API calls after setup).

## Tech Stack
- **Backend:** Flask, TensorFlow 2.13, scikit‑learn, joblib
- **Frontend:** HTML5, CSS3, JavaScript (vanilla)
- **Models:** Trained on CEDAR55 dataset (55 persons, 24 genuine + 24 forged each)

## Prerequisites
- Python 3.8 – 3.10
- pip + virtualenv
- Git LFS (if you clone the models directly)

## Setup

### 1. Clone the repository
```bash
git clone https://github.com/YOUR_USERNAME/signature-verification-system.git
cd signature-verification-system