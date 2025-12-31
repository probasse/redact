import re
import fitz
from redact_pdf import redact_pii

# 1. Create a dummy PDF
doc = fitz.open()
page = doc.new_page()
page.insert_text((50, 50), "Start Employee ID: EMP-99999 End")
doc.save("debug_custom.pdf")
doc.close()

# 2. Simulate Generator Logic
text_input = "EMP-99999"
regex = re.escape(text_input)
def repl_digits(match):
    s = match.group(0)
    return f"\\d{{{len(s)}}}"
generated_regex = re.sub(r'\d+', repl_digits, regex)
print(f"Generated Regex: '{generated_regex}'")

# 3. Simulate Redaction Call
custom_patterns = {"MyCustomPattern": generated_regex}
selected_patterns = ["MyCustomPattern"]

print("Attempting redaction...")
try:
    count = redact_pii("debug_custom.pdf", "debug_custom_redacted.pdf", selected_patterns, custom_patterns)
    print(f"Redaction count: {count}")
except Exception as e:
    print(f"Error: {e}")
