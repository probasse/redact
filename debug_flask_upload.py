from flask import Flask
from app import app
import json
import io
import os

# Create a dummy PDF for the test
dummy_pdf_content = b"%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<\n/Root 1 0 R\n>>\n%%EOF"
with open("test_upload.pdf", "wb") as f:
    f.write(dummy_pdf_content)

# Prepare test data
data = {
    'patterns': json.dumps(['MyPattern']),
    'custom_patterns': json.dumps({'MyPattern': r'EMP-\d{5}'})
}
data['file'] = (io.BytesIO(dummy_pdf_content), 'test_upload.pdf')

# Simulate Request
with app.test_client() as client:
    print("Sending request to /upload...")
    response = client.post('/upload', data=data, content_type='multipart/form-data')
    print(f"Response Status: {response.status_code}")
    print(f"Response Data: {response.get_json()}")

# Clean up
if os.path.exists("test_upload.pdf"):
    os.remove("test_upload.pdf")
