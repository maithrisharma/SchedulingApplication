import sys, os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from flask import Flask, jsonify
from flask_cors import CORS

from api.scenarios import scenarios_bp
from api.uploads import uploads_bp
from api.clean import clean_bp
from api.schedule import schedule_bp
from api.visualize import visualize_bp
from api.results import results_bp


def create_app():
    app = Flask(__name__)

    # Global CORS
    CORS(app, resources={r"/*": {"origins": "*"}})

    # FINAL FIX: ensure ALL responses include CORS headers
    @app.after_request
    def add_cors_headers(response):
        response.headers["Access-Control-Allow-Origin"] = "*"
        response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS"
        response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
        return response

    @app.get("/api/health")
    def health():
        return jsonify({"status": "ok", "message": "scheduler backend is alive"})

    @app.get("/api/test-clean-import")
    def test_clean_import():
        try:
            from cleaning.clean_jobs import clean_jobs
            from cleaning.clean_shifts import clean_shifts
            return jsonify({"ok": True, "message": "cleaning modules import fine"})
        except Exception as e:
            return jsonify({"ok": False, "error": str(e)}), 500

    app.register_blueprint(scenarios_bp)
    app.register_blueprint(uploads_bp)
    app.register_blueprint(clean_bp)
    app.register_blueprint(schedule_bp)
    app.register_blueprint(visualize_bp)
    app.register_blueprint(results_bp)

    return app


if __name__ == "__main__":
    app = create_app()
    app.run(host="0.0.0.0", port=5000)
