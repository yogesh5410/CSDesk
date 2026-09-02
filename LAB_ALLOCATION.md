# CSDesk: Autonomous Lab Allocation & Timetable Optimization Engine
### Project Specification & LLM Agent Implementation Blueprint

---

## 1. Executive Summary & Objective

**CSDesk** is an academic automation software for the Computer Science & Engineering (CSE) department. 

The core task of this subsystem is to automate **Lab Allocation and Timetable Generation**. Given a set of university courses with specific lab practical requirements, batch strengths, physical labs with distinct capacities and hardware constraints (e.g., GPU enabled), and a fixed institute timetable slot layout, generate a 100% conflict-free lab schedule using deterministic constraint satisfaction.

---

## 2. Institutional Timetable Rules & Extracted Ground Truth

Based on institutional timetables and curriculum formats:

1. **Standard Institute Lab Slots:**
   * Lab courses are typically allocated to 180-minute (3-hour) afternoon or designated slots: **N, O, P, Q, R, S, T, U, V, W**[cite: 1].
   * Standard afternoon lab timing runs from **2:30 PM to 5:25 PM**, Monday through Friday[cite: 1].
   * 50–55 minute theory lecture slots (A through M) run in morning blocks and thrice a week[cite: 1].

2. **Course Characteristics:**
   * Courses specify lecture, tutorial, and practical contact hours in $L\text{-}T\text{-}P$ format (e.g., `0-0-3` represents a 3-hour practical lab)[cite: 2].
   * Courses belong to specific academic years ($1^{\text{st}}, 2^{\text{nd}}, 3^{\text{rd}}, 4^{\text{th}}$ Year B.Tech / M.Tech / Ph.D.) and student batches[cite: 2].
   * Specific AI/ML/Data Science and Systems courses mandate dedicated **GPU clusters**, whereas core theory labs require standard workstations.

---

## 3. System Architecture & Tech Stack

[ Frontend: React + Tailwind CSS ]
│ (HTTP / JSON)
▼
[ Backend API: FastAPI (Python 3.11+) ]
│
┌───────┴──────────────────────────────┐
│                                      │
▼                                      ▼
[ Storage: PostgreSQL + SQLAlchemy ]  [ Solver: Google OR-Tools (CP-SAT) ]


* **Backend Framework:** FastAPI / Python.
* **Optimization Engine:** `ortools.sat.python.cp_model` (Google OR-Tools CP-SAT).
* **Database:** PostgreSQL (SQLAlchemy ORM + Alembic migrations).
* **Parser:** `pdfplumber` / `pandas` for processing course CSV/PDF data.
* **Frontend:** React (Vite), Tailwind CSS, Lucide Icons.

---

## 4. Mathematical Model & Optimization Constraints

Let:
* $C$ be the set of courses requiring lab slots.
* $L$ be the set of available physical labs.
* $S$ be the set of valid lab time slots (e.g., $N, O, P, Q, R$).

Decision Variable:
$$x_{c, l, s} \in \{0, 1\} \quad \forall c \in C, l \in L, s \in S$$
where $x_{c, l, s} = 1$ if course $c$ is assigned to lab $l$ during slot $s$, and $0$ otherwise.

### Hard Constraints:

1. **Single Assignment:** Every registered lab practical course must be assigned to exactly one lab and one slot:
   $$\sum_{l \in L} \sum_{s \in S} x_{c, l, s} = 1 \quad \forall c \in C$$

2. **Lab Capacity Feasibility:** A lab must have sufficient seating capacity for the enrolled student strength:
   $$\text{If } \text{Capacity}(l) < \text{Strength}(c) \implies x_{c, l, s} = 0 \quad \forall s \in S$$

3. **Hardware / GPU Compatibility:** If a course mandates GPU support, it cannot be placed in a non-GPU lab:
   $$\text{If } \text{RequiresGPU}(c) = \text{True} \land \text{HasGPU}(l) = \text{False} \implies x_{c, l, s} = 0 \quad \forall s \in S$$

4. **No Lab Double-Booking:** At most one practical course can occupy a physical lab in any slot:
   $$\sum_{c \in C} x_{c, l, s} \le 1 \quad \forall l \in L, \forall s \in S$$

5. **No Student / Batch Clash:** A student batch/academic year group cannot be assigned to two labs at the same time:
   $$\sum_{c \in C_{\text{batch}}} \sum_{l \in L} x_{c, l, s} \le 1 \quad \forall s \in S$$

---

## 5. Database Schema Definition

```sql
CREATE TABLE physical_labs (
    id SERIAL PRIMARY KEY,
    lab_name VARCHAR(100) NOT NULL,
    room_number VARCHAR(50),
    capacity INT NOT NULL,
    has_gpu BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE
);

CREATE TABLE academic_courses (
    id SERIAL PRIMARY KEY,
    course_code VARCHAR(20) NOT NULL,
    course_name VARCHAR(255) NOT NULL,
    academic_year INT NOT NULL, -- 1, 2, 3, 4
    batch_section VARCHAR(20) NOT NULL, -- B1, B2, etc.
    student_count INT NOT NULL,
    duration_hours INT DEFAULT 3, -- 2 or 3 hours
    gpu_required BOOLEAN DEFAULT FALSE,
    instructor_name VARCHAR(100)
);

CREATE TABLE time_slots (
    id SERIAL PRIMARY KEY,
    slot_code VARCHAR(10) UNIQUE NOT NULL, -- N, O, P, Q, R
    day_of_week VARCHAR(15) NOT NULL,     -- Monday to Friday
    start_time TIME NOT NULL,              -- 14:30:00
    end_time TIME NOT NULL                 -- 17:25:00
);

CREATE TABLE lab_allocations (
    id SERIAL PRIMARY KEY,
    course_id INT REFERENCES academic_courses(id) ON DELETE CASCADE,
    lab_id INT REFERENCES physical_labs(id) ON DELETE CASCADE,
    slot_id INT REFERENCES time_slots(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_lab_slot UNIQUE (lab_id, slot_id)
);
```
---

## 6. Optimization Algorithm Implementation (`solver.py`)

The core scheduling engine leverages **Google OR-Tools CP-SAT (Constraint Programming - Satisfiability)**. The script `solver.py` formulates the lab allocation as a deterministic boolean constraint satisfaction problem.

### 1. Data Parsing & Pre-flight Sanity Checks
Before feeding data to the mathematical solver, the algorithm runs a **pre-flight sanity check**. It verifies if every course has *at least one* physical lab capable of holding its student strength and meeting its hardware (GPU) requirements. If a course is physically impossible to schedule (e.g., 80 students needing a GPU, but the largest GPU lab holds 40), the algorithm halts immediately and returns a precise error message.

### 2. Decision Variables
The model relies on a 3-dimensional boolean decision variable matrix:
`x[(c, l, s)] ∈ {0, 1}`
Where `x` is `1` if Course `c` is assigned to Lab `l` during Time Slot `s`, and `0` otherwise.

### 3. Hard Constraints Applied
The solver enforces the following 6 hard constraints:
1. **Single Assignment:** `model.AddExactlyOne(...)`
   Every registered lab course must be assigned to exactly one lab and exactly one time slot.
2. **Lab Capacity Feasibility:** 
   If a lab's seating capacity is strictly less than the course's student strength, the decision variable for that `(c, l, s)` combination is forced to `0`.
3. **Hardware / GPU Compatibility:**
   If a course requires a GPU, but the lab lacks GPU infrastructure, the decision variable is forced to `0`.
4. **No Lab Double-Booking:** `model.AddAtMostOne(...)`
   For any given lab `l` and any given slot `s`, the sum of assigned courses cannot exceed `1` (a physical room can only host one practical at a time).
5. **No Student / Year Clash:**
   Courses belonging to the same `academic_year` (e.g., "2nd Year") are grouped. For any given time slot `s`, a specific academic year can be assigned to at most `1` lab, ensuring students never have overlapping classes.
6. **No Instructor Clash:**
   Courses taught by the same `instructor` are grouped. For any given time slot `s`, a specific instructor can be assigned to at most `1` lab, guaranteeing professors are never double-booked.

### 4. Resolution
The CP-SAT solver aggressively explores the boolean search tree to find a `FEASIBLE` or `OPTIMAL` matrix that satisfies 100% of the above constraints. Once found, it translates the boolean `1` values back into human-readable JSON outputs containing the generated schedule.