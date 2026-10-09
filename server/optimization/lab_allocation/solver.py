import json
import sys
import math
from ortools.sat.python import cp_model

def solve_lab_allocation(data_path):
    with open(data_path, 'r') as f:
        data = json.load(f)

    labs = data['labs']
    raw_courses = data['courses']

    batches = []
    for c in raw_courses:
        if not c.get('periods'):
            return {
                "status": "ERROR", 
                "message": f"Course {c['code']} has no valid time slots (periods) assigned. Please ensure lab slots are properly mapped from the timetable."
            }

        valid_capacities = [l['capacity'] for l in labs if not c.get('gpu_required') or l.get('has_gpu')]
        max_cap = max(valid_capacities) if valid_capacities else 0
        
        student_count = int(c.get('student_count', 0))
        duration = int(c.get('duration', 2))
        periods = c['periods']
        
        # Split periods into discrete sessions of length 'duration'
        if len(periods) == 0 or len(periods) % duration != 0:
            sessions = [periods]
        else:
            sessions = [periods[i:i+duration] for i in range(0, len(periods), duration)]

        # Split students into batches if they exceed the max lab capacity
        if max_cap > 0 and student_count > max_cap:
            num_splits = math.ceil(student_count / max_cap)
            split_count = math.ceil(student_count / num_splits)
        else:
            num_splits = 1
            split_count = student_count

        for i in range(num_splits):
            batches.append({
                'batch_id': f"{c['code']}_B{i+1}",
                'course_code': c['code'],
                'name': f"{c.get('name', '')} (Batch {i+1})" if num_splits > 1 else c.get('name', ''),
                'student_count': split_count,
                'gpu_required': c.get('gpu_required', False),
                'academic_years': [y.strip() for y in c.get('academic_year', '').split(',') if y.strip()],
                'instructor': c.get('instructor', ''),
                'duration': duration,
                'sessions': sessions,
                'num_splits': num_splits
            })

    # Validate that at least one physical lab exists for each batch's size and hardware requirement
    for b in batches:
        valid_labs = [l for l in labs if l['capacity'] >= b['student_count'] and (not b['gpu_required'] or l['has_gpu'])]
        if not valid_labs:
            return {
                "status": "ERROR", 
                "message": f"Course {b['course_code']} requires {b['student_count']} seats and GPU={b['gpu_required']}, but no physical lab meets these requirements."
            }

    model = cp_model.CpModel()

    # x[batch, session_index, lab_id] = 1 if this batch is assigned to this session and lab
    x = {}
    for b in batches:
        for s_idx, s in enumerate(b['sessions']):
            for l in labs:
                x[(b['batch_id'], s_idx, l['id'])] = model.NewBoolVar(f"x_{b['batch_id']}_s{s_idx}_{l['id']}")

    # 1. Each batch is assigned to EXACTLY ONE (session, lab) combination
    for b in batches:
        model.AddExactlyOne(x[(b['batch_id'], s_idx, l['id'])] 
                            for s_idx in range(len(b['sessions'])) 
                            for l in labs)

    # 2. Capacity and GPU Constraints (Hard Constraint)
    for b in batches:
        for s_idx in range(len(b['sessions'])):
            for l in labs:
                if l['capacity'] < b['student_count'] or (b['gpu_required'] and not l['has_gpu']):
                    model.Add(x[(b['batch_id'], s_idx, l['id'])] == 0)

    # 3. No Double Booking (Hard Constraint)
    all_periods = set()
    for b in batches:
        for s in b['sessions']:
            all_periods.update(s)
            
    for p in all_periods:
        for l in labs:
            active_vars = []
            for b in batches:
                for s_idx, s in enumerate(b['sessions']):
                    if p in s:
                        active_vars.append(x[(b['batch_id'], s_idx, l['id'])])
            if active_vars:
                model.AddAtMostOne(active_vars)

    # 4. Objective: Minimize GPU waste and optimize seating (Soft Constraints)
    penalty_terms = []
    for b in batches:
        for s_idx in range(len(b['sessions'])):
            for l in labs:
                var = x[(b['batch_id'], s_idx, l['id'])]
                
                # Penalty 1: Wasting a GPU lab for a non-GPU course is highly discouraged
                is_wasting_gpu = 1 if (not b['gpu_required'] and l['has_gpu']) else 0
                
                # Penalty 2: Wasting seats (favor tight fits so larger labs are free for larger batches)
                wasted_seats = l['capacity'] - b['student_count']
                
                total_penalty = (is_wasting_gpu * 1000000) + wasted_seats
                
                if total_penalty > 0:
                    penalty_terms.append(var * total_penalty)
                        
    model.Minimize(sum(penalty_terms))

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = 15.0
    status = solver.Solve(model)

    if status == cp_model.OPTIMAL or status == cp_model.FEASIBLE:
        results = []
        for b in batches:
            for s_idx, s in enumerate(b['sessions']):
                for l in labs:
                    if solver.Value(x[(b['batch_id'], s_idx, l['id'])]):
                        results.append({
                            "course": f"{b['course_code']}" + (f" (Batch {b['batch_id'].split('B')[1]})" if b.get('num_splits', 1) > 1 else ""),
                            "name": b['name'],
                            "year": ",".join(b['academic_years']),
                            "instructor": b['instructor'],
                            "lab": l['name'],
                            "periods": s,
                            "duration": b['duration']
                        })
        return {"status": "SUCCESS", "allocations": results}
    else:
        return {"status": "ERROR", "message": "The solver could not find a valid room allocation. There are likely more concurrent courses scheduled for a single slot than there are physical labs available."}

if __name__ == '__main__':
    data_file = sys.argv[1] if len(sys.argv) > 1 else 'dummy_data.json'
    try:
        result = solve_lab_allocation(data_file)
        print(json.dumps(result, indent=2))
    except Exception as e:
        print(json.dumps({"status": "ERROR", "message": str(e)}))
