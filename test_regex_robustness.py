import re

def current_heuristic(text):
    regex = re.escape(text)
    def repl_digits(match):
        s = match.group(0)
        return f"\\d{{{len(s)}}}"
    regex = re.sub(r'\d+', repl_digits, regex)
    return regex

def improved_heuristic(text):
    regex = re.escape(text)
    # Replace escaped spaces (or just spaces depending on python ver) with \s+
    # re.escape("A B") -> "A\ B"
    regex = regex.replace(r'\ ', r'\s+')
    
    def repl_digits(match):
        s = match.group(0)
        return f"\\d{{{len(s)}}}"
    regex = re.sub(r'\d+', repl_digits, regex)
    return regex

target_text = "Employee  ID: 12345" # Two spaces
input_text = "Employee ID: 12345"   # One space input

print(f"Target Text in PDF: '{target_text}'")
print(f"User Input: '{input_text}'")

curr_regex = current_heuristic(input_text)
print(f"Current Regex: '{curr_regex}'")
match = re.search(curr_regex, target_text)
print(f"Current Match: {match}")

new_regex = improved_heuristic(input_text)
print(f"Improved Regex: '{new_regex}'")
match = re.search(new_regex, target_text)
print(f"Improved Match: {match}")
