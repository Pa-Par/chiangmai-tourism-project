"""Flask entry point for the Chiang Mai natural tourism API."""

from flask import Flask, jsonify, render_template_string
from flask_cors import CORS
from werkzeug.exceptions import HTTPException

from config import Config
from database import DatabaseError, database_cursor
from routes.attractions import attractions_bp
from routes.recommend import recommend_bp


def create_app():
    app = Flask(__name__)
    app.config.from_object(Config)
    CORS(app, resources={r"/api/*": {"origins": app.config["CORS_ORIGINS"]}})

    app.register_blueprint(attractions_bp, url_prefix="/api")
    app.register_blueprint(recommend_bp, url_prefix="/api")

    @app.get("/")
    def home():
        """Provide a small temporary page for checking the Backend APIs."""
        return render_template_string(
            """
            <!doctype html>
            <html lang="th">
              <head>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1">
                <title>Chiang Mai Nature Guide</title>
                <style>
                  body { font-family: Arial, sans-serif; margin: 48px; color: #1f4d35; }
                  h1 { margin-bottom: 12px; }
                  ul { padding-left: 20px; }
                  li { margin: 10px 0; }
                  a { color: #167a45; }
                </style>
              </head>
              <body>
                <h1>Chiang Mai Nature Guide</h1>
                <p>หน้าเว็บชั่วคราวสำหรับตรวจสอบ Flask Backend</p>
                <ul>
                  <li><a href="/api/health">/api/health</a></li>
                  <li><a href="/api/zones">/api/zones</a></li>
                  <li><a href="/api/categories">/api/categories</a></li>
                  <li><a href="/api/attractions">/api/attractions</a></li>
                </ul>
              </body>
            </html>
            """
        )

    @app.get("/api/health")
    def health_check():
        """Check Flask and the existing MySQL database connection."""
        try:
            with database_cursor() as cursor:
                cursor.execute("SELECT 1 AS database_ok")
                cursor.fetchone()
        except DatabaseError:
            return jsonify(
                {
                    "success": False,
                    "message": "ไม่สามารถเชื่อมต่อฐานข้อมูล MySQL ได้ "
                    "โปรดตรวจสอบ XAMPP และค่าในไฟล์ .env",
                }
            ), 503

        return jsonify(
            {
                "success": True,
                "data": {"status": "healthy", "database": "connected"},
            }
        ), 200

    @app.errorhandler(DatabaseError)
    def handle_database_error(_error):
        return jsonify(
            {
                "success": False,
                "message": "ไม่สามารถเชื่อมต่อหรืออ่านข้อมูลจากฐานข้อมูล MySQL ได้ "
                "โปรดตรวจสอบ XAMPP และค่าในไฟล์ .env",
            }
        ), 503

    @app.errorhandler(HTTPException)
    def handle_http_error(error):
        return jsonify({"success": False, "message": error.description}), error.code

    @app.errorhandler(Exception)
    def handle_unexpected_error(error):
        app.logger.exception("Unexpected server error", exc_info=error)
        return jsonify(
            {"success": False, "message": "เกิดข้อผิดพลาดภายในระบบ"}
        ), 500

    return app


app = create_app()


if __name__ == "__main__":
    app.run(
        host=app.config["FLASK_HOST"],
        port=app.config["FLASK_PORT"],
        debug=app.config["FLASK_DEBUG"],
    )
