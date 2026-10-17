"""MySQL connection helper for the existing tourism database."""

from contextlib import contextmanager

import pymysql
from flask import current_app


class DatabaseError(Exception):
    """A safe, user-friendly error for MySQL connection or query failures."""


def get_db_connection():
    """Create a connection without creating or modifying database objects."""
    ssl_ca = current_app.config.get("DB_SSL_CA", "").strip()
    ssl_options = None

    if ssl_ca:
        if not os.path.isabs(ssl_ca):
            ssl_ca = os.path.join(os.path.dirname(__file__), ssl_ca)

        ssl_options = {"ca": ssl_ca}

    return pymysql.connect(
        host=current_app.config["DB_HOST"],
        port=current_app.config["DB_PORT"],
        user=current_app.config["DB_USER"],
        password=current_app.config["DB_PASSWORD"],
        database=current_app.config["DB_NAME"],
        charset="utf8mb4",
        cursorclass=pymysql.cursors.DictCursor,
        autocommit=True,
        ssl=ssl_options,
    )


@contextmanager
def database_cursor():
    """Yield a dictionary cursor and always close the cursor and connection."""
    connection = None
    cursor = None

    try:
        connection = get_db_connection()
        cursor = connection.cursor()
        yield cursor
    except pymysql.MySQLError as error:
        current_app.logger.error("MySQL error: %s", error)
        raise DatabaseError("Unable to connect to the MySQL database.") from error
    finally:
        if cursor is not None:
            cursor.close()
        if connection is not None:
            connection.close()
