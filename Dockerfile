# Use official Python runtime as a parent image
FROM python:3.9-slim

# Set working directory
WORKDIR /app

# Install system dependencies if needed (e.g. for PyMuPDF)
# pymupdf wheels usually include everything, but sometimes build tools are needed
# RUN apt-get update && apt-get install -y gcc

# Copy requirements
COPY requirements.txt /app/

# Install python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the application
COPY . /app

# Expose port
ENV FLASK_ENV=production
EXPOSE 8080

# Run the application
# Run the application with Gunicorn
# bind: host:port
# workers: number of worker processes (usually 2-4 per core)
# app:app : module_name:flask_instance_name
CMD ["gunicorn", "--bind", "0.0.0.0:8080", "--workers", "1", "--threads", "2", "app:app"]
