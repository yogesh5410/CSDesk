# CSDesk Lab Allocation

This document explains the lab allocation module in CSDesk in a simple, human-readable way.
It is written so you can use it for explanation during viva or demo, and also so anyone reading it can understand the workflow quickly.

---

## 1. What This Module Does

The lab allocation feature automatically creates a conflict-free timetable for practical classes.

It uses:
- course details,
- student strength,
- academic year,
- instructor name,
- lab capacity,
- GPU availability,
- and time slots.

The final result is a schedule that avoids clashes between:
- labs,
- student batches or years,
- and instructors.

---

## 2. Main Idea

This system does not assign labs manually.
Instead, it converts timetable planning into a constraint-solving problem.

In simple words:
- every possible course-lab-slot combination is treated as a yes/no choice,
- the solver keeps only the combinations that satisfy all rules,
- and then it returns the best valid timetable.

The main solver logic is in [server/optimization/solver.py](server/optimization/solver.py#L6).

---

## 3. Full Workflow

### Step 1: Load the base data

When the Lab Allocation page opens, the frontend loads the current labs, courses, and slots from the backend.

This happens in [client/src/pages/dashboard/LabAllocation.jsx](client/src/pages/dashboard/LabAllocation.jsx#L37).

### Step 2: Update the data if needed

The user can:
- add a new course,
- add a new lab,
- or upload a PDF to extract course details.

The PDF parsing part is handled by [server/optimization/parser.py](server/optimization/parser.py#L6) and the API route in [server/routes/optimizationRoutes.js](server/routes/optimizationRoutes.js#L16).

### Step 3: Run the optimization

When the user clicks Run Algorithm, the frontend sends the current data to the backend.

That request is made in [client/src/pages/dashboard/LabAllocation.jsx](client/src/pages/dashboard/LabAllocation.jsx#L45).

### Step 4: Backend calls the Python solver

The backend writes the data into the JSON file if needed, then executes the Python solver script.

That logic is in [server/routes/optimizationRoutes.js](server/routes/optimizationRoutes.js#L62).

### Step 5: Solver returns the final timetable

If the solver finds a valid arrangement, it returns the allocations in JSON.
If it cannot find a valid arrangement, it returns an error or an infeasible result.

### Step 6: Frontend displays the schedule

The React page shows the generated timetable in a day-wise format.

The timetable output section is in [client/src/pages/dashboard/LabAllocation.jsx](client/src/pages/dashboard/LabAllocation.jsx#L324).

---

## 4. Data Used By The Solver

The sample data is stored in [server/optimization/dummy_data.json](server/optimization/dummy_data.json#L1).

It contains:
- labs with `id`, `name`, `capacity`, and `has_gpu`,
- courses with `code`, `name`, `duration`, `instructor`, `student_count`, `academic_year`, and `gpu_required`,
- and slots like `MON_M1`, `MON_M2`, `MON_A1`, `MON_A2`, up to Friday.

This slot structure is used by the solver in [server/optimization/solver.py](server/optimization/solver.py#L120).

---

## 5. How The Solver Works

The solver uses Google OR-Tools CP-SAT.

That means it checks a large number of possible assignments and keeps only the ones that satisfy every rule.

The input is read from JSON in [server/optimization/solver.py](server/optimization/solver.py#L7).

### 5.1 Course splitting for oversized batches

If a course is bigger than the largest valid lab, the solver automatically splits it into batches.

This is done in [server/optimization/solver.py](server/optimization/solver.py#L15).

Example:
- if a course has 100 students,
- and the biggest valid lab can hold only 40,
- the course is split into smaller batches so each batch can fit into the available labs.

### 5.2 Pre-check before solving

Before solving, the code checks whether each course has at least one eligible lab.

It checks:
- capacity,
- and GPU requirement.

If no lab can host a course, the solver immediately returns an error.

This check is in [server/optimization/solver.py](server/optimization/solver.py#L38).

### 5.3 Decision variables

For every possible combination of:
- course,
- lab,
- slot,

the solver creates a boolean variable.

If the variable is `1`, that means the course is assigned there.
If it is `0`, that placement is not used.

This is created in [server/optimization/solver.py](server/optimization/solver.py#L50).

---

## 6. Rules Enforced By The Solver

The solver applies these rules strictly:

### Rule 1: Each course gets the required number of slots

The solver calculates how many slots a course needs from its duration.

This is handled in [server/optimization/solver.py](server/optimization/solver.py#L60).

### Rule 2: Lab capacity must be enough

If the lab capacity is smaller than the student strength, that placement is not allowed.

See [server/optimization/solver.py](server/optimization/solver.py#L73).

### Rule 3: GPU courses only go to GPU labs

If a course needs GPU support, the solver forbids placing it in a non-GPU lab.

See [server/optimization/solver.py](server/optimization/solver.py#L73).

### Rule 4: A lab cannot be double-booked

Only one course can occupy one physical lab at one time slot.

See [server/optimization/solver.py](server/optimization/solver.py#L86).

### Rule 5: Same academic year cannot clash

Students of the same year should not be assigned to two different labs at the same time.

This is enforced in [server/optimization/solver.py](server/optimization/solver.py#L92).

### Rule 6: Same instructor cannot clash

An instructor cannot teach in two labs at the same time.

This is enforced in [server/optimization/solver.py](server/optimization/solver.py#L107).

### Rule 7: Duration-based scheduling behavior

The solver also groups slots by day and applies special handling for lab durations.

This is defined in [server/optimization/solver.py](server/optimization/solver.py#L120).

---

## 7. Objective Of The Solver

The solver does not only try to find any valid timetable.
It also tries to use GPU labs efficiently.

It minimizes the use of GPU labs for courses that do not actually require GPU support.

That objective is set in [server/optimization/solver.py](server/optimization/solver.py#L164).

---

## 8. Result Format

If the solver succeeds, it returns a JSON response with:
- course code,
- course name,
- year,
- instructor,
- lab name,
- slot code,
- duration.

That output is generated in [server/optimization/solver.py](server/optimization/solver.py#L180).

If there is no valid solution, it returns `INFEASIBLE`.

---

## 9. Frontend Display

The Lab Allocation page in the frontend does three important things:

1. Shows the current list of courses and labs.
2. Lets the user upload PDF data or manually add records.
3. Displays the final generated timetable.

The data entry part is in [client/src/pages/dashboard/LabAllocation.jsx](client/src/pages/dashboard/LabAllocation.jsx#L229).
The result table is in [client/src/pages/dashboard/LabAllocation.jsx](client/src/pages/dashboard/LabAllocation.jsx#L324).

The timetable is split into:
- Monday to Friday,
- morning block,
- afternoon block.

That structure is defined in [client/src/pages/dashboard/LabAllocation.jsx](client/src/pages/dashboard/LabAllocation.jsx#L8).

---

## 10. Simple Explanation You Can Say In Viva

You can explain it like this:

"The lab allocation system automatically creates a conflict-free timetable for practical classes. First, it reads all courses, labs, and available time slots. Then it checks important conditions like lab capacity, GPU requirement, instructor clashes, and academic year clashes. After that, it uses the OR-Tools CP-SAT solver to find a valid assignment for every course. If a course is too large for one lab, it is split into batches. Finally, the backend sends the result as JSON and the frontend shows the final timetable in a readable format."

---

## 11. Short Version For Quick Revision

- Input: courses, labs, slots.
- Parser: reads course data from PDF.
- Solver: uses CP-SAT to satisfy all constraints.
- Constraints: capacity, GPU, lab clash, year clash, instructor clash.
- Output: a valid timetable in JSON.
- UI: React page displays the result clearly.

---

## 12. Important Files

- [server/optimization/solver.py](server/optimization/solver.py)
- [server/optimization/parser.py](server/optimization/parser.py)
- [server/routes/optimizationRoutes.js](server/routes/optimizationRoutes.js)
- [server/optimization/dummy_data.json](server/optimization/dummy_data.json)
- [client/src/pages/dashboard/LabAllocation.jsx](client/src/pages/dashboard/LabAllocation.jsx)

---

## 13. One-Line Summary

CSDesk lab allocation is a rule-based timetable generator that uses OR-Tools to assign every lab practical to a suitable lab and slot without clashes.