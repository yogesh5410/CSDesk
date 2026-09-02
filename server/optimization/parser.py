import pdfplumber
import sys
import json
import re

def parse_pdf(file_path):
    courses = []
    try:
        with pdfplumber.open(file_path) as pdf:
            for page in pdf.pages:
                tables = page.extract_tables()
                for table in tables:
                    # Find header row index
                    header_idx = -1
                    for i, row in enumerate(table):
                        # check if row is not None and has 'Course code'
                        if row and any(cell and "Course code" in str(cell) for cell in row):
                            header_idx = i
                            break
                    
                    if header_idx != -1:
                        # process rows
                        headers = [str(h).replace('\n', ' ').strip() if h else "" for h in table[header_idx]]
                        
                        # Fallback indices based on the user screenshot if exact text match fails
                        code_idx = 0
                        name_idx = 1
                        ltp_idx = 2
                        inst_idx = 9
                        
                        # Try to find exact matches
                        for i, h in enumerate(headers):
                            if "Course code" in h: code_idx = i
                            elif "Course Name" in h: name_idx = i
                            elif "L" in h and "T" in h and "P" in h: ltp_idx = i
                            elif "Instructor" in h: inst_idx = i

                        for row in table[header_idx+1:]:
                            if not row or not row[code_idx]:
                                continue
                            
                            code = str(row[code_idx]).strip().replace('\n', '')
                            
                            # MUST start with CS or CSL to be valid CSE course
                            if code.startswith("CS") or code.startswith("CSL"):
                                ltp = str(row[ltp_idx]).strip()
                                
                                # parse L-T-P (e.g., '3-0-2' or '3 - 0 - 2' or '0-0-3')
                                parts = ltp.replace(' ', '').split('-')
                                if len(parts) == 3:
                                    try:
                                        p = int(parts[2])
                                        # Only extract if it HAS a lab component (P > 0)
                                        if p > 0:
                                            course_name = str(row[name_idx]).strip().replace('\n', ' ')
                                            
                                            # Skip BTech Project courses as they don't need scheduled lab rooms
                                            if "btech project" in course_name.lower() or "b.tech project" in course_name.lower():
                                                continue
                                                
                                            courses.append({
                                                "code": code,
                                                "name": course_name,
                                                "duration": p,
                                                "instructor": str(row[inst_idx]).strip().replace('\n', ' ')
                                            })
                                    except ValueError:
                                        pass
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)
        
    print(json.dumps({"courses": courses}))

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "No file path provided"}))
        sys.exit(1)
    parse_pdf(sys.argv[1])
