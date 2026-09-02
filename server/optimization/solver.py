import json
import sys
from ortools.sat.python import cp_model

def solve_lab_allocation(data_path):
    # Load the dummy JSON data
    with open(data_path, 'r') as f:
        data = json.load(f)

    labs = data['labs']
    courses = data['courses']
    slots = data['slots']

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

    # Constraint 1: Single Assignment 
    # Every registered lab course must be assigned to exactly one lab and one slot
    for c in courses:
        model.AddExactlyOne(x[(c['code'], l['id'], s['id'])] for l in labs for s in slots)

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


    # 3. Solve the model
    solver = cp_model.CpSolver()
    status = solver.Solve(model)

    # 4. Process and output the results
    if status == cp_model.OPTIMAL or status == cp_model.FEASIBLE:
        results = []
        for c in courses:
            for l in labs:
                for s in slots:
                    if solver.Value(x[(c['code'], l['id'], s['id'])]):
                        results.append({
                            "course": c['code'],
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
