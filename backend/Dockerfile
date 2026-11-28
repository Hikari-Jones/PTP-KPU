FROM python:3.12-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends default-mysql-client && rm -rf /var/lib/apt/lists/*
COPY requirements.txt .
COPY kirana-llm ./kirana-llm
ENV KIRANA_MODEL_DIR=/models
# Current pip (older versions carry known installer vulnerabilities).
RUN pip install --no-cache-dir --retries 10 --timeout 120 --upgrade pip
RUN KIRANA_SKIP_MODEL_DOWNLOAD=1 pip install --no-cache-dir --retries 10 --timeout 120 -r requirements.txt
COPY app ./app
COPY setup_local_database.py upgrade_operations.py restore_backup.py bootstrap.py ./
RUN useradd --create-home appuser && mkdir -p uploads backups /models && chown -R appuser:appuser /app /models
USER appuser
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
