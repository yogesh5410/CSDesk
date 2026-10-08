/**
 * The five uploadable inputs plus the read-only tables, and the exact CSV
 * shape each one expects. `columns` must match the server's TABLES spec in
 * server/routes/taRoutes.js -- the upload is rejected if a column is missing.
 */

export const PDF_UPLOADS = [
  {
    key: "courses",
    title: "List of Courses",
    endpoint: "/api/ta/upload/courses-pdf",
    accept: "application/pdf",
    table: "courses",
    blurb:
      "The department course list PDF. Only CSE-owned courses are stored: the " +
      "discipline must name CSE/CS&DS and the code must be in the CS*/DS* series.",
    extracts: ["course code", "course name", "discipline", "program",
               "lecture slot", "tutorial slot", "lab slot", "instructors"],
  },
  {
    key: "timetable",
    title: "Common Timetable",
    endpoint: "/api/ta/upload/timetable-pdf",
    accept: "application/pdf",
    table: "timetable",
    blurb:
      "The institute slot grid. Parsed into 5 days x 8 periods, recording which " +
      "theory slot (A-M) and which 180-minute lab slot (N-W) occupies each cell.",
    extracts: ["day", "start time", "end time", "theory slot", "lab slot"],
  },
];

export const CSV_UPLOADS = [
  {
    key: "ta_details",
    title: "TA Details",
    table: "ta_details",
    endpoint: "/api/ta/upload/csv/ta_details",
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
    endpoint: "/api/ta/upload/csv/course_registration",
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
  {
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
  },
];

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
  const esc = (v) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return [spec.columns.join(","),
          ...spec.sample.map((r) => r.map(esc).join(","))].join("\n");
}
