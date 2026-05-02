import numpy as np
import joblib

class HybridEnsemble:
    """Custom ensemble that combines DNN and traditional ML models."""
    def __init__(self, models, weights):
        self.models = models          # list of (name, model) tuples
        self.weights = weights        # normalized weights
        self.is_fitted = True

    def predict_proba(self, X):
        predictions = []
        for (name, model), weight in zip(self.models, self.weights):
            if name == 'dnn':
                pred = model.predict(X, verbose=0)
            else:
                pred = model.predict_proba(X)
            predictions.append(pred * weight)
        weighted_avg = np.sum(predictions, axis=0)
        return weighted_avg

    def predict(self, X):
        proba = self.predict_proba(X)
        return np.argmax(proba, axis=1)