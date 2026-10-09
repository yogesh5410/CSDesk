import pdfplumber
import sys
import json
import re

def parse_timetable(file_path):
    try:
        with pdfplumber.open(file_path) as pdf:
            text = pdf.pages[0].extract_text()
            
            lines = text.split('\n')
            
            # Find the header line with times
            time_line = -1
            for i, line in enumerate(lines):
                if "8:30" in line and "9:30" in line:
                    time_line = i
                    break
                    
            if time_line == -1:
                # Try finding a line with multiple '-' or ':'
                for i, line in enumerate(lines):
                    if line.count('-') >= 4 and line.count(':') >= 4:
                        time_line = i
                        break
                        
            if time_line == -1:
                return {"error": "Could not find time header in timetable PDF"}
                
            # Extract starts and ends purely by looking for HH:MM pattern
            # The starts are on time_line, ends are typically 2 lines down
            starts = re.findall(r'\d{1,2}:\d{2}', lines[time_line])
            
            end_line = time_line + 1
            if time_line + 2 < len(lines) and ("9:25" in lines[time_line+2] or "10:25" in lines[time_line+2]):
                end_line = time_line + 2
                
            ends = re.findall(r'\d{1,2}:\d{2}', lines[end_line])
            
            time_matches = []
            for i in range(min(len(starts), len(ends))):
                time_matches.append(f"{starts[i]}-{ends[i]}")
            
            # Fallback if something goes wrong
            if len(time_matches) < 8:
                time_matches = ["8:30-9:25", "9:30-10:25", "10:30-11:25", "11:30-12:25", "12:30-1:25", "2:30-3:25", "3:30-4:25", "4:30-5:25"]

            # Pad to 8 if needed
            while len(time_matches) < 8:
                time_matches.append("")
                
            # Now find the days and slots
            days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]
            slot_mapping = {}
            
            for i in range(time_line, len(lines)):
                for day in days:
                    if day in lines[i]:
                        # The line above might have the lab slots (N O, V W)
                        if i > 0:
                            prev_line = lines[i-1].strip()
                            if len(prev_line) <= 5 and prev_line: # like "N O", "N   O"
                                parts = prev_line.split()
                                if len(parts) >= 1:
                                    # First part is morning slot, typically covers first 3 periods
                                    slot_mapping[parts[0]] = {
                                        "day": day,
                                        "periods": time_matches[0:3]
                                    }
                                if len(parts) >= 2:
                                    # Second part is afternoon slot, typically covers last 3 periods (periods 5,6,7 assuming 0-indexed and 8 total periods)
                                    # User said O is 2.30 to 5.30 (which is the last 3 periods)
                                    slot_mapping[parts[1]] = {
                                        "day": day,
                                        "periods": time_matches[5:8]
                                    }
                                    
            return {
                "headers": time_matches,
                "slots": slot_mapping
            }
            
    except Exception as e:
        return {"error": str(e)}

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "No file path provided"}))
        sys.exit(1)
    print(json.dumps(parse_timetable(sys.argv[1])))
