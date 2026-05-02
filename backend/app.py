import os
import joblib
import numpy as np
import tensorflow as tf
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from PIL import Image
from feature_extractor import getCSVFeatures
from models import HybridEnsemble
import warnings
warnings.filterwarnings('ignore')

app = Flask(__name__)
CORS(app)

# ---------- CONFIGURATION ----------
MODEL_BASE = "./trained_models/cedar55"
SAVED_MODELS_DIR = os.path.join(MODEL_BASE, "saved_models")
HYBRID_MODELS_DIR = os.path.join(MODEL_BASE, "hybrid_models")

# Caches for loaded models & scalers
model_cache = {}
scaler_cache = {}

def get_trained_persons():
    """Return list of person IDs that have a valid model_info file."""
    persons = []
    if not os.path.exists(SAVED_MODELS_DIR):
        return persons
    
    for f in os.listdir(SAVED_MODELS_DIR):
        if f.startswith('model_info_') and f.endswith('.pkl'):
            pid = f.replace('model_info_', '').replace('.pkl', '')
            if pid.isdigit():
                # Verify at least one model file exists for this person
                person_id = int(pid)
                if (os.path.exists(os.path.join(SAVED_MODELS_DIR, f'model_{person_id}.h5')) or
                    os.path.exists(os.path.join(SAVED_MODELS_DIR, f'model_{person_id}.keras')) or
                    os.path.exists(os.path.join(SAVED_MODELS_DIR, f'model_{person_id}_export'))):
                    persons.append(person_id)
    return sorted(persons)

def load_model_and_scaler(person_id):
    """Load model, scaler, and metadata for a given person (with caching)."""
    if person_id in model_cache:
        return model_cache[person_id], scaler_cache[person_id]

    info_path = os.path.join(SAVED_MODELS_DIR, f'model_info_{person_id}.pkl')
    scaler_path = os.path.join(SAVED_MODELS_DIR, f'scaler_{person_id}.pkl')
    hybrid_path = os.path.join(HYBRID_MODELS_DIR, f'hybrid_model_{person_id}.pkl')
    
    # Model file paths in priority order
    export_path = os.path.join(SAVED_MODELS_DIR, f'model_{person_id}_export')
    keras_path = os.path.join(SAVED_MODELS_DIR, f'model_{person_id}.keras')
    savedmodel_path = os.path.join(SAVED_MODELS_DIR, f'model_{person_id}_savedmodel')
    h5_path = os.path.join(SAVED_MODELS_DIR, f'model_{person_id}.h5')

    if not os.path.exists(info_path):
        raise FileNotFoundError(f"No model info for person {person_id}")

    model_info = joblib.load(info_path)
    model_type = model_info['model_type']
    scaler = joblib.load(scaler_path)

    # Fallback logic: if hybrid model is required but fails, try DNN
    loaded_model = None
    actual_type = model_type

    if model_type == "Hybrid_Ensemble":
        # Check if hybrid file exists and is non-empty
        hybrid_ok = os.path.exists(hybrid_path) and os.path.getsize(hybrid_path) > 0
        if hybrid_ok:
            try:
                loaded_model = joblib.load(hybrid_path)
                print(f"✅ Loaded hybrid ensemble for person {person_id}")
            except Exception as e:
                print(f"⚠️ Failed to load hybrid model for person {person_id}: {e}")
                hybrid_ok = False
        
        if not hybrid_ok:
            # Fallback to DNN model
            print(f"⚠️ Hybrid model missing/corrupt for person {person_id}, falling back to DNN")
            actual_type = "Proven_DNN"
    
    if actual_type == "Proven_DNN":
        # Try different DNN formats
        if os.path.exists(export_path):
            loaded_model = tf.saved_model.load(export_path)
            print(f"✅ Loaded exported DNN for person {person_id}")
        elif os.path.exists(keras_path):
            loaded_model = tf.keras.models.load_model(keras_path)
            print(f"✅ Loaded .keras DNN for person {person_id}")
        elif os.path.exists(savedmodel_path):
            loaded_model = tf.keras.models.load_model(savedmodel_path)
            print(f"✅ Loaded SavedModel DNN for person {person_id}")
        elif os.path.exists(h5_path):
            loaded_model = tf.keras.models.load_model(h5_path)
            print(f"✅ Loaded .h5 DNN for person {person_id}")
        else:
            raise FileNotFoundError(f"No DNN model file found for person {person_id}")
    elif actual_type == "Hybrid_Ensemble" and loaded_model is not None:
        # Already loaded
        pass
    else:
        raise ValueError(f"Unsupported model type: {actual_type}")

    # Cache
    model_cache[person_id] = (loaded_model, model_info, actual_type)
    scaler_cache[person_id] = scaler

    return (loaded_model, model_info, actual_type), scaler

@app.route('/api/persons', methods=['GET'])
def list_persons():
    persons = get_trained_persons()
    return jsonify({'persons': persons})

@app.route('/api/verify', methods=['POST'])
def verify_signature():
    try:
        person_id = int(request.form.get('person_id'))
        if 'image' not in request.files:
            return jsonify({'error': 'No image file provided'}), 400
        file = request.files['image']
        if file.filename == '':
            return jsonify({'error': 'Empty filename'}), 400

        (model, model_info, model_type), scaler = load_model_and_scaler(person_id)

        img = Image.open(file.stream).convert('L')
        img_array = np.array(img) / 255.0

        features = getCSVFeatures(img_array)
        feat_array = np.array(features).reshape(1, -1)
        feat_scaled = scaler.transform(feat_array)

        # Predict based on actual model type
        if model_type == "Proven_DNN":
            if hasattr(model, 'predict'):
                # Regular Keras model
                pred = model.predict(feat_scaled, verbose=0)
                confidence = float(pred[0][1])
            else:
                # Exported SavedModel (no .predict)
                input_tensor = tf.convert_to_tensor(feat_scaled, dtype=tf.float32)
                infer = model.signatures['serving_default']
                output = infer(input_tensor)
                pred_values = list(output.values())[0].numpy()
                confidence = float(pred_values[0][1])
        else:  # Hybrid_Ensemble
            pred = model.predict_proba(feat_scaled)
            confidence = float(pred[0][1])

        verdict = "genuine" if confidence >= 0.5 else "forged"

        return jsonify({
            'person_id': person_id,
            'verdict': verdict,
            'confidence': confidence,
            'model_accuracy': model_info.get('test_accuracy', 0.0),
            'model_type': model_type
        })

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e), 'trace': traceback.format_exc()}), 500

# ========== SERVE FRONTEND STATIC FILES ==========
@app.route('/')
def serve_frontend():
    return send_from_directory('../frontend', 'index.html')

@app.route('/<path:path>')
def serve_static(path):
    return send_from_directory('../frontend', path)

if __name__ == '__main__':
    os.makedirs(SAVED_MODELS_DIR, exist_ok=True)
    os.makedirs(HYBRID_MODELS_DIR, exist_ok=True)
    print(f"Trained persons found: {get_trained_persons()}")
    app.run(host='0.0.0.0', port=5000, debug=False)