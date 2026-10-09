# CSDesk Lab Room Allocation Module

This document explains the **Lab Room Allocation** module in CSDesk. It is written to be easily understandable for presentations, vivas, and future developers who want to understand the exact workflow and constraints of the system.

---

## 1. What This Module Does

The lab allocation feature solves a specific, complex problem: **Room Assignment for Fixed Time Slots**. 

In university scheduling, the Institute Timetable usually fixes *when* a lab session occurs (e.g., Monday 2 PM - 5 PM). However, deciding *which physical room* each batch goes to is often a manual, error-prone process. 

Our module takes the **pre-determined time slots** from the Institute Timetable and automatically computes the optimal physical lab assignment for every course, ensuring no physical room is double-booked and hardware requirements are perfectly met.

---

## 2. Main Idea & Philosophy

This system strictly acts as a **Room Allocator**, not a timetable generator. 
- It does **not** shift a course from Monday to Tuesday to avoid a student clash. 
- It assumes student and instructor clashes are already resolved in the master Institute Timetable. 
- Its sole duty is to read the exact time periods assigned to a course, look at the physical labs available during that time, and assign the best possible room.

To do this, it converts the assignment task into a **Constraint Satisfaction Problem (CSP)** using Google's **OR-Tools (CP-SAT solver)**.

---

## 3. Full Workflow

### Step 1: Data Ingestion (PDF Parsing & DB)
1. **Timetable Parsing:** The system parses the Institute Timetable PDF to understand the grid (Days, Slots, and precise Time Periods).
2. **Course Parsing:** The system extracts the lab courses (CS/CSL codes) from the semester's course offerings PDF, automatically grabbing the Course Code, Name, Instructor, and Lab Duration (Hours).
3. **Metadata Enrichment:** The user manually inputs the Student Strength and whether the course strictly requires a GPU.
4. **Lab Inventory:** The user defines the physical labs available on campus, their seating capacity, and if they have GPUs.

### Step 2: Preprocessing (Chunking & Batching)
Before feeding data to the mathematical solver, the backend intelligently pre-processes the courses:

* **Batch Splitting:** If a course has a massive student strength (e.g., 120 students) but the largest lab on campus only holds 80 students, the system automatically divides the course into smaller units (e.g., Batch 1 and Batch 2, 60 students each). These batches are treated as independent groups that need concurrent rooms.
* **Session Chunking:** If a course is allocated a massive block of time (e.g., 6 hours total) but the actual duration of a single lab session is 3 hours, the system splits those periods into two separate 3-hour sessions that get scheduled independently.

### Step 3: The OR-Tools Solver
The system models every possible combination of `[Batch, Session, Physical Lab]` as a boolean variable (`0` or `1`). It then applies a series of rigid mathematical constraints.

#### Hard Constraints (Must Be Obeyed)
If any of these rules are broken, the schedule is instantly rejected as invalid:
1. **Exactly One Lab:** Every batch's session must be assigned to exactly one physical lab.
2. **No Double-Booking:** If two sessions overlap at the exact same time period, they **cannot** be assigned to the same physical lab.
3. **Strict Capacity:** A physical lab can only be assigned if its `capacity` is greater than or equal to the `student_count` of the batch.
4. **Hardware Needs:** If a course requires GPUs, it will *only* be assigned to a lab equipped with GPUs.

#### Soft Constraints (Smart Optimizations)
When multiple valid labs are available for a session, the solver uses an objective function (penalties) to pick the best one:
1. **Conserve GPU Labs (Massive Penalty = 1,000,000):** If the solver tries to put a non-GPU course into a GPU-equipped lab, it incurs a massive penalty. This forces the solver to use regular labs first. A GPU lab will only be used for a non-GPU course if absolutely every other regular lab on campus is full at that time.
2. **Minimize Wasted Seats (Small Penalty):** The solver calculates `lab_capacity - batch_strength`. It favors "tighter fits" (e.g., putting a 60-student batch in a 70-seat lab instead of a 300-seat lab) so that massive rooms remain free for massive batches.

### Step 4: Output & Visualization
The solver explores thousands of permutations in milliseconds. If it finds the optimal arrangement, it returns it to the React frontend. The frontend dynamically renders an interactive, horizontally-scrollable Gantt-style timeline showing exactly which lab is occupied by which batch at what time.

---

## 4. Database Persistence & Safety

All data is stored in **Supabase (PostgreSQL)**:
- `lab_allocation_labs`
- `lab_allocation_courses`
- `lab_allocation_timetable`

To prevent data corruption or silent deletions, the backend API (`server/routes/optimizationRoutes.js`) uses rigid type-casting (`parseInt`, `Boolean`) before saving to the database. It explicitly catches and throws any database constraint violations to ensure the UI stays synchronized with the actual database state.

---

## 5. Simple Explanation You Can Say In Viva

You can explain the architecture like this:

*"Our lab allocation system automates physical room assignments for fixed time slots. First, it extracts course data and the master timetable grid from PDFs. Then, it preprocesses the data—automatically splitting massive classes into smaller batches if they exceed the capacity of our largest physical lab. Next, it passes this data to Google's OR-Tools engine. The engine applies hard rules: no room can be double-booked, the room must have enough seats, and GPU courses must get GPU labs. Finally, it applies smart optimizations, mathematically penalizing the system if it wastes an expensive GPU lab on a regular course, ensuring specialized hardware is conserved. The result is a mathematically proven, 100% conflict-free physical room schedule."*

---

## 6. Important Files

- **Solver Logic:** `server/optimization/lab_allocation/solver.py`
- **PDF Parsers:** `server/optimization/lab_allocation/parser.py` & `parse_timetable.py`
- **Backend API:** `server/routes/optimizationRoutes.js`
- **Frontend UI & Visualizer:** `client/src/pages/dashboard/LabAllocation.jsx`