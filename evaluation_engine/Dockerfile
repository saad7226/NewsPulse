FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

CMD ["pytest", "tests/", "-v", "--html=report/fyp_test_report.html", "--self-contained-html"]
