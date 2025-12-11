from app import create_app

app = create_app()

#  only used if someone runs `python wsgi.py`
if __name__ == "__main__":
    app.run()
