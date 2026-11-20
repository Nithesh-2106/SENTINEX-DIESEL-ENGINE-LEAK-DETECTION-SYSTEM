import joblib
import shap
import traceback

try:
    print("Loading model...")
    model = joblib.load('models/xgboost.pkl')
    print("Model loaded. Type:", type(model.estimators_[1]))
    
    print("Creating explainer...")
    explainer = shap.TreeExplainer(model.estimators_[1])
    print("Success")
except Exception as e:
    print("Error:", e)
    traceback.print_exc()
