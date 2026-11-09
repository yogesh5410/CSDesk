/**
 * The five uploadable inputs plus the read-only tables, and the exact CSV
 * shape each one expects. `columns` must match the server's TABLES spec in
 * server/routes/taRoutes.js -- the upload is rejected if a column is missing.
 */

/**
 * The four core uploadable data sources for TA Allocation.
 * Courses supports both PDF extraction and direct CSV upload.
 */
export const DATA_SOURCES = [
  {
    key: "courses",
    title: "List of Courses",
    table: "courses",
    pdfEndpoint: "/api/ta/upload/courses-pdf",
    csvEndpoint: "/api/ta/upload/csv/courses",
    acceptPdf: ".pdf,application/pdf",
    acceptCsv: ".csv,text/csv",
    icon: "book",
    blurb:
      "Department course catalog with slot allocations and instructors. Only CSE-owned courses are stored (CS*/DS* codes). Supports both PDF parsing and direct CSV upload.",
    extracts: ["course code", "course name", "discipline", "program",
               "lecture slot", "tutorial slot", "lab slot", "instructors"],
    columns: ["course_code", "course_name", "discipline", "program",
              "lecture_slot", "tutorial_slot", "lab_slot", "instructors"],
    required: ["course_code", "course_name"],
    sample: [
      ["CSL301", "Database Systems", "CSE", "BTech", "E", "", "OWQSU", "Dr. Souradyuti Paul"],
      ["CSL502", "Advanced Algorithms", "CSE", "MTech", "C", "", "", "Dr. Subhajit Sidhanta"],
      ["CSL606", "Machine Learning", "CSE", "MTech", "D", "", "P23", "Dr. Gagan Raj Gupta"],
    ],
    notes: [
      "Upload either the official Institute Course List PDF or a CSV file.",
      "Slots must match the common timetable slot grid (e.g. A, C, OWQSU, P23).",
      "Multiple instructors can be listed separated by commas.",
    ],
  },
  {
    key: "timetable",
    title: "Common Timetable",
    table: "timetable",
    pdfEndpoint: "/api/ta/upload/timetable-pdf",
    acceptPdf: ".pdf,application/pdf",
    icon: "calendar",
    blurb:
      "The institute slot grid. Parsed into 5 days x 8 periods, recording which theory slot (A-M) and which 180-minute lab slot (N-W) occupies each cell.",
    extracts: ["day", "start time", "end time", "theory slot", "lab slot"],
    notes: [
      "Upload the official Common Time Table PDF containing the 5-day slot matrix.",
    ],
  },
  {
    key: "ta_details",
    title: "TA Details",
    table: "ta_details",
    csvEndpoint: "/api/ta/upload/csv/ta_details",
    acceptCsv: ".csv,text/csv",
    icon: "users",
    blurb:
      "Roster of all eligible teaching assistants. PhD scholars have no coursework constraints, while M.Tech TAs have class schedules to avoid.",
    columns: ["roll_no", "name", "program", "thesis_supervisor", "email"],
    required: ["roll_no", "name"],
    sample: [
      ["M25CS002", "ANIKET JAIN", "MTech", "Dr. Dhiman Saha", "M25CS002@iitbhilai.ac.in"],
      ["P24CS007", "Vikrant Sahu", "PhD", "Dr. Gagan Raj Gupta", ""],
    ],
    notes: [
      "program starting with 'P' is read as PhD -- those TAs count as free in every slot.",
      "thesis_supervisor is matched to course instructors by name, so spelling variants are tolerated.",
    ],
  },
  {
    key: "course_registration",
    title: "Course Registration",
    table: "course_registration",
    csvEndpoint: "/api/ta/upload/csv/course_registration",
    acceptCsv: ".csv,text/csv",
    icon: "registration",
    blurb:
      "Course enrollment records for M.Tech students. Used by the solver to determine student class hours and avoid scheduling conflicts.",
    columns: ["student_roll_no", "course_code"],
    required: ["student_roll_no", "course_code"],
    sample: [
      ["M25CS002", "CSL502"],
      ["M25CS002", "CSL606"],
      ["M25DS007", "DSL501"],
    ],
    notes: [
      "One row per student per course.",
      "Only M.Tech registrations matter: they are what make a TA unavailable in a slot.",
    ],
  },
];

export const PDF_UPLOADS = [
  DATA_SOURCES[0],
  DATA_SOURCES[1],
];

export const CSV_UPLOADS = [
  DATA_SOURCES[2],
  DATA_SOURCES[3],
];

export const TA_REQUIREMENTS_CSV_SPEC = {
  key: "ta_requirements",
  title: "TA Requirements",
  table: "ta_requirements",
  endpoint: "/api/ta/upload/csv/ta_requirements",
  columns: ["course_code", "tas_required", "preferred_ta_rolls"],
  required: ["course_code", "tas_required"],
  sample: [
    ["CSL301", "3", "M25CS002;P24CS007;M25DS007"],
    ["CSL302", "2", "M25CS011"],
  ],
  notes: [
    "tas_required must be a positive whole number.",
    "preferred_ta_rolls is a ';'-separated list of roll numbers, best first. It may be left blank.",
  ],
};

export const PREVIEW_TABLES = [
  { key: "courses", label: "Courses" },
  { key: "timetable", label: "Timetable" },
  { key: "ta_details", label: "TA Details" },
  { key: "course_registration", label: "Registrations" },
  { key: "ta_requirements", label: "Requirements" },
  { key: "users", label: "Users" },
];

/** Build the template text shown next to an upload (and offered as a file). */
export function templateCsv(spec) {
  if (!spec?.columns?.length) return "";
  const esc = (v) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return [spec.columns.join(","),
          ...(spec.sample || []).map((r) => r.map(esc).join(","))].join("\n");
}
