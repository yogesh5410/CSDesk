import json
import sys
import math
from ortools.sat.python import cp_model

def solve_lab_allocation(data_path):
    # Load the dummy JSON data
    with open(data_path, 'r') as f:
        data = json.load(f)

    labs = data['labs']
    raw_courses = data['courses']
    slots = data['slots']

    # Auto-Split oversized courses
    courses = []
    for c in raw_courses:
        # Find the max capacity of a lab that meets the hardware requirements
        valid_capacities = [l['capacity'] for l in labs if not c.get('gpu_required') or l.get('has_gpu')]
        max_cap = max(valid_capacities) if valid_capacities else 0
        
        student_count = int(c.get('student_count', 0))
        
        # If course is bigger than the biggest valid lab, split it!
        if max_cap > 0 and student_count > max_cap:
            num_splits = math.ceil(student_count / max_cap)
            split_count = math.ceil(student_count / num_splits)
            
            for i in range(num_splits):
                new_c = c.copy()
                new_c['code'] = f"{c['code']} (Batch {i+1})"
                new_c['name'] = f"{c.get('name', '')} (Batch {i+1})".strip()
                new_c['student_count'] = split_count
                courses.append(new_c)
        else:
            courses.append(c)

    # Pre-flight Sanity Checks for better error messages
    for c in courses:
        valid_labs = [l for l in labs if l['capacity'] >= int(c['student_count']) and (not c['gpu_required'] or l['has_gpu'])]
        if not valid_labs:
            return {
                "status": "ERROR", 
                "message": f"Course {c['code']} is impossible to schedule! It requires {c['student_count']} seats and GPU={c['gpu_required']}, but no single physical lab meets these requirements."
            }

    # Initialize the CP-SAT model
    model = cp_model.CpModel()

    # 1. Decision Variables
    # x[c, l, s] = 1 if course 'c' is assigned to lab 'l' during slot 's'
    x = {}
    for c in courses:
        for l in labs:
            for s in slots:
                x[(c['code'], l['id'], s['id'])] = model.NewBoolVar(f"x_{c['code']}_{l['id']}_{s['id']}")

    # 2. Hard Constraints

    # Constraint 1: Assignment Count
    # A course gets 1 slot if duration is 2 or 3. It gets 2 slots if duration is 4 or 6.
    for c in courses:
        duration = int(c.get('duration', 2))
        req_slots = 2 if duration >= 4 else 1
        
        # Sum over all labs and slots must equal the required number of slots
        model.Add(sum(x[(c['code'], l['id'], s['id'])] for l in labs for s in slots) == req_slots)
        
        # A course cannot be scheduled in two labs at the SAME time
        for s in slots:
            model.AddAtMostOne(x[(c['code'], l['id'], s['id'])] for l in labs)

    # Constraint 2: Lab Capacity Feasibility
    # Constraint 3: Hardware / GPU Compatibility
    for c in courses:
        for l in labs:
            for s in slots:
                # If capacity is not enough, forbid this assignment
                if l['capacity'] < c['student_count']:
                    model.Add(x[(c['code'], l['id'], s['id'])] == 0)
                
                # If course needs GPU but lab doesn't have it, forbid this assignment
                if c['gpu_required'] and not l['has_gpu']:
                    model.Add(x[(c['code'], l['id'], s['id'])] == 0)

    # Constraint 4: No Lab Double-Booking
    # At most one practical course can occupy a physical lab in any slot
    for l in labs:
        for s in slots:
            model.AddAtMostOne(x[(c['code'], l['id'], s['id'])] for c in courses)

    # Constraint 5: No Student / Year Clash
    # A student year group cannot be assigned to two labs at the same time
    year_courses = {}
    for c in courses:
        year = c.get('academic_year')
        if year:
            if year not in year_courses:
                year_courses[year] = []
            year_courses[year].append(c['code'])

    for year, c_ids in year_courses.items():
        for s in slots:
            # For a given year and a given slot, they can only be in at most 1 lab across all their courses
            model.AddAtMostOne(x[(c_id, l['id'], s['id'])] for c_id in c_ids for l in labs)

    # Constraint 6: No Instructor Clash
    instructor_courses = {}
    for c in courses:
        inst = c.get('instructor')
        if inst:
            if inst not in instructor_courses:
                instructor_courses[inst] = []
            instructor_courses[inst].append(c['code'])

    for inst, c_ids in instructor_courses.items():
        for s in slots:
            model.AddAtMostOne(x[(c_id, l['id'], s['id'])] for c_id in c_ids for l in labs)

    # Constraint 7: Minimum 1 Day Gap Between Sessions
    # A course cannot have multiple labs on the same day, AND cannot have labs on consecutive days.
    
    # Group slots into days (assuming 10 slots, 2 per day)
    days_slots = []
    for i in range(0, len(slots), 2):
        if i+1 < len(slots):
            days_slots.append([slots[i]['id'], slots[i+1]['id']])
            
    for c in courses:
        course_on_day = []
        for d, day_slots in enumerate(days_slots):
            # Sum of allocations for this course on day 'd'
            day_sum = sum(x[(c['code'], l['id'], s_id)] for l in labs for s_id in day_slots)
            
            # A course cannot have 2 labs on the very same day
            model.Add(day_sum <= 1)
            
            # Track if course is active on day 'd'
            day_var = model.NewBoolVar(f"course_{c['code']}_day_{d}")
            model.Add(day_sum == day_var)
            course_on_day.append(day_var)
            
        # Prevent consecutive days (Minimum 1 day gap)
        for d in range(len(days_slots) - 1):
            model.Add(course_on_day[d] + course_on_day[d+1] <= 1)

    # 3. Objective Function: Save Costly GPU Labs
    # Minimize the assignment of NON-GPU courses into GPU labs
    penalty_terms = []
    for c in courses:
        if not c['gpu_required']:
            for l in labs:
                if l['has_gpu']:
                    for s in slots:
                        penalty_terms.append(x[(c['code'], l['id'], s['id'])])
                        
    model.Minimize(sum(penalty_terms))

    # 4. Solve the model
    solver = cp_model.CpSolver()
    status = solver.Solve(model)

    # 5. Process and output the results
    if status == cp_model.OPTIMAL or status == cp_model.FEASIBLE:
        results = []
        for c in courses:
            for l in labs:
                for s in slots:
                    if solver.Value(x[(c['code'], l['id'], s['id'])]):
                        results.append({
                            "course": c['code'],
                            "name": c.get('name', ''),
                            "year": c.get('academic_year', ''),
                            "instructor": c.get('instructor', ''),
                            "lab": l['name'],
                            "slot": s['code']
                        })
        return {"status": "SUCCESS", "allocations": results}
    else:
        return {"status": "INFEASIBLE", "allocations": []}

if __name__ == '__main__':
    # Use passed file path or default to 'dummy_data.json'
    data_file = sys.argv[1] if len(sys.argv) > 1 else 'dummy_data.json'
    
    try:
        result = solve_lab_allocation(data_file)
        print(json.dumps(result, indent=2))
    except Exception as e:
        print(json.dumps({"status": "ERROR", "message": str(e)}))
